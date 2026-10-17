"""Datos del portafolio de un estudiante en un proyecto, leídos de las colecciones de los otros
servicios (read-only) y de Blob Storage.

Lo usan la exportación de un proyecto (`api/v1/export.py`) y el portafolio académico
(`api/v1/portfolio.py`). En proyectos por grupos, las versiones del estudiante son las de su
grupo; de la retroalimentación ve todos los comentarios pero solo su propia calificación final.
"""

import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import PurePosixPath

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.storage import display_file_name, download_file
from app.schemas.export import FeedbackData, FileKind, ProjectData, VersionWithFeedback

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
UNKNOWN_NAME = "Nombre no disponible"
# Descargas simultáneas de Blob Storage al armar un portafolio con muchas imágenes.
MAX_PARALLEL_DOWNLOADS = 6


@dataclass
class StudentThread:
    """Lo que un estudiante tiene en un proyecto: su grupo (si aplica), versiones y feedback."""

    project: dict
    student_id: str
    group: dict | None = None
    versions: list[dict] = field(default_factory=list)
    feedback: list[dict] = field(default_factory=list)

    def user_ids(self) -> list[str]:
        """Ids cuyos nombres aparecen en el documento: estudiante, docentes, grupo y autores."""
        ids = [self.student_id, *(f["teacher_id"] for f in self.feedback)]
        if self.group:
            ids += [*self.group["member_ids"], *(v["student_id"] for v in self.versions)]
        return list(dict.fromkeys(ids))


async def load_thread(db: AsyncIOMotorDatabase, project: dict, student_id: str) -> StudentThread:
    project_id = str(project["_id"])
    thread = StudentThread(project=project, student_id=student_id)
    if project.get("work_mode") == "group":
        thread.group = await db.groups.find_one(
            {"project_id": project_id, "member_ids": student_id}
        )
        if thread.group is None:
            return thread  # sin grupo todavía: no tiene versiones
        version_query = {"project_id": project_id, "group_id": str(thread.group["_id"])}
    else:
        version_query = {"project_id": project_id, "student_id": student_id}
    thread.versions = (
        await db.versions.find(version_query).sort([("uploaded_at", 1), ("_id", 1)]).to_list(None)
    )
    version_ids = [str(version["_id"]) for version in thread.versions]
    if version_ids:
        thread.feedback = (
            await db.feedback.find(
                {
                    "version_id": {"$in": version_ids},
                    # La calificación final de un compañero de grupo es de ese compañero.
                    "$or": [{"is_final": False}, {"student_id": student_id}],
                }
            )
            .sort([("created_at", 1), ("_id", 1)])
            .to_list(None)
        )
    return thread


def file_kind(file_url: str) -> FileKind:
    suffix = PurePosixPath(display_file_name(file_url)).suffix.lower()
    return FileKind.IMAGE if suffix in IMAGE_EXTENSIONS else FileKind.DOCUMENT


def project_data(thread: StudentThread, names: dict[str, str]) -> ProjectData:
    project = thread.project
    group = thread.group
    return ProjectData(
        id=str(project["_id"]),
        title=project["title"],
        description=project.get("description", ""),
        group_name=group["name"] if group else None,
        group_members=[names.get(m, UNKNOWN_NAME) for m in group["member_ids"]] if group else [],
    )


async def portfolio_versions(
    thread: StudentThread,
    names: dict[str, str],
    *,
    include_images: bool = True,
    downloads: asyncio.Semaphore | None = None,
) -> list[VersionWithFeedback]:
    """Versiones numeradas en orden cronológico con su retroalimentación. Solo se descargan las
    imágenes (JPG/PNG), y solo si se van a incrustar."""
    feedback_by_version: dict[str, list[FeedbackData]] = defaultdict(list)
    for item in thread.feedback:
        feedback_by_version[item["version_id"]].append(
            FeedbackData(
                teacher_name=names.get(item["teacher_id"], UNKNOWN_NAME),
                comment=item["comment"],
                score=item.get("score"),
                score_replaced=item.get("score_replaced", False),
                is_final=item.get("is_final", False),
                created_at=item["created_at"],
            )
        )
    downloads = downloads or asyncio.Semaphore(MAX_PARALLEL_DOWNLOADS)

    async def build(number: int, version: dict) -> VersionWithFeedback:
        file_url = version["file_url"]
        kind = file_kind(file_url)
        image_data = None
        if kind is FileKind.IMAGE and include_images:
            async with downloads:
                image_data = await download_file(file_url)
        return VersionWithFeedback(
            number=number,
            description=version["description"],
            uploaded_at=version["uploaded_at"],
            file_name=display_file_name(file_url),
            file_kind=kind,
            image_data=image_data,
            feedback=feedback_by_version[str(version["_id"])],
            uploaded_by=names.get(version["student_id"], UNKNOWN_NAME) if thread.group else None,
        )

    return list(
        await asyncio.gather(
            *(build(number, version) for number, version in enumerate(thread.versions, start=1))
        )
    )
