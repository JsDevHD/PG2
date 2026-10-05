"""RF-07 / CU-04 — Exportar portafolio en PDF.

Export Service no es dueño de ninguna colección: lee (read-only) `courses`, `projects` y
`versions` de Projects Service y `feedback` de Feedback Service, descarga las imágenes de Blob
Storage y resuelve nombres en Auth Service. El PDF se genera en cada petición y se entrega en la
respuesta; no se persiste.
"""

import asyncio
import logging
import re
import unicodedata
from collections import defaultdict
from pathlib import PurePosixPath

from bson import ObjectId
from fastapi import APIRouter, Depends, Query, Response
from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.api.deps import CurrentUser, get_current_user, get_db
from app.core.auth_client import fetch_user_names
from app.core.pdf_builder import build_portfolio_pdf
from app.core.security import oauth2_scheme
from app.core.storage import display_file_name, download_file
from app.exceptions import ForbiddenError, NotFoundError, UnprocessableEntityError
from app.schemas.export import FeedbackData, FileKind, ProjectData, VersionWithFeedback

logger = logging.getLogger(__name__)

router = APIRouter()

PDF_MEDIA_TYPE = "application/pdf"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
UNKNOWN_NAME = "Nombre no disponible"


async def _find_by_id(collection: AsyncIOMotorCollection, doc_id: str, not_found: str) -> dict:
    if not ObjectId.is_valid(doc_id):
        raise NotFoundError(not_found)
    document = await collection.find_one({"_id": ObjectId(doc_id)})
    if document is None:
        raise NotFoundError(not_found)
    return document


def _resolve_student_id(
    current_user: CurrentUser, requested_student_id: str | None, course: dict
) -> str:
    """Estudiante cuyo portafolio se exporta, verificando pertenencia al curso (H-6)."""
    enrolled = course.get("student_ids", [])
    if current_user.role == "estudiante":
        # El student_id recibido se ignora: un estudiante solo puede exportar lo suyo.
        if current_user.id not in enrolled:
            raise ForbiddenError()
        return current_user.id
    if course["teacher_id"] != current_user.id:
        raise ForbiddenError()
    if requested_student_id not in enrolled:
        raise ForbiddenError("El estudiante no pertenece al curso de este proyecto")
    return requested_student_id


def _file_kind(file_url: str) -> FileKind:
    suffix = PurePosixPath(display_file_name(file_url)).suffix.lower()
    return FileKind.IMAGE if suffix in IMAGE_EXTENSIONS else FileKind.DOCUMENT


async def _to_portfolio_version(
    number: int, version: dict, feedback: list[FeedbackData]
) -> VersionWithFeedback:
    file_url = version["file_url"]
    file_kind = _file_kind(file_url)
    # Solo se descargan las imágenes; los PDF/SVG se listan por nombre en el documento.
    image_data = await download_file(file_url) if file_kind is FileKind.IMAGE else None
    return VersionWithFeedback(
        number=number,
        description=version["description"],
        uploaded_at=version["uploaded_at"],
        file_name=display_file_name(file_url),
        file_kind=file_kind,
        image_data=image_data,
        feedback=feedback,
    )


def _slug(value: str) -> str:
    """Fragmento ASCII seguro para el nombre del archivo (sin tildes, espacios ni comillas)."""
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9]+", "_", ascii_value).strip("_") or "sin_nombre"


@router.get(
    "/{project_id}/export",
    response_class=Response,
    responses={200: {"content": {PDF_MEDIA_TYPE: {}}, "description": "Portafolio en PDF"}},
)
async def export_portfolio(
    project_id: str,
    student_id: str | None = Query(
        default=None, description="Obligatorio para docentes; se ignora para estudiantes"
    ),
    current_user: CurrentUser = Depends(get_current_user),
    token: str = Depends(oauth2_scheme),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Response:
    """Genera y entrega el portafolio en PDF de un estudiante en un proyecto."""
    if current_user.role == "docente" and not student_id:
        raise UnprocessableEntityError("El parámetro student_id es obligatorio para docentes")

    project = await _find_by_id(db.projects, project_id, "Proyecto no encontrado")
    course = await _find_by_id(db.courses, project["course_id"], "Curso no encontrado")
    effective_student_id = _resolve_student_id(current_user, student_id, course)

    versions = (
        await db.versions.find({"project_id": project_id, "student_id": effective_student_id})
        .sort("uploaded_at", 1)
        .to_list(None)
    )
    version_ids = [str(version["_id"]) for version in versions]
    feedback = []
    if version_ids:
        feedback = (
            await db.feedback.find({"version_id": {"$in": version_ids}})
            .sort("created_at", 1)
            .to_list(None)
        )

    names = await fetch_user_names(
        [effective_student_id, *(f["teacher_id"] for f in feedback)], token
    )

    feedback_by_version: dict[str, list[FeedbackData]] = defaultdict(list)
    for item in feedback:
        feedback_by_version[item["version_id"]].append(
            FeedbackData(
                teacher_name=names.get(item["teacher_id"], UNKNOWN_NAME),
                comment=item["comment"],
                score=item["score"],
                is_final=item.get("is_final", False),
                created_at=item["created_at"],
            )
        )
    portfolio = await asyncio.gather(
        *(
            _to_portfolio_version(number, version, feedback_by_version[str(version["_id"])])
            for number, version in enumerate(versions, start=1)
        )
    )

    student_name = names.get(effective_student_id, UNKNOWN_NAME)
    # ReportLab es CPU-bound: se ejecuta en un hilo para no bloquear el event loop.
    pdf = await asyncio.to_thread(
        build_portfolio_pdf,
        ProjectData(id=project_id, title=project["title"], description=project["description"]),
        list(portfolio),
        student_name,
        course["name"],
    )
    logger.info(
        "Portafolio exportado: proyecto=%s estudiante=%s versiones=%d",
        project_id,
        effective_student_id,
        len(versions),
    )

    filename = f"portafolio_{_slug(project['title'])}_{_slug(student_name)}.pdf"
    return Response(
        content=pdf,
        media_type=PDF_MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # Contiene datos personales y calificaciones: que ningún intermediario lo cachee.
            "Cache-Control": "no-store",
        },
    )
