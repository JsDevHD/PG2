"""Progreso de un curso (RF-08).

progreso = (versiones con al menos una retroalimentación / total de versiones) × 100

Las versiones de un estudiante son las que subió en proyectos individuales y las de su grupo en
proyectos por grupos: una versión de grupo cuenta para cada integrante.
"""

from collections import Counter

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.access import get_member_course
from app.api.deps import CurrentUser, get_current_user, get_db
from app.core.auth_client import fetch_user_names
from app.core.security import oauth2_scheme
from app.schemas.progress import (
    CourseProgressResponse,
    StudentProgressItem,
    StudentProgressResponse,
)

router = APIRouter()


def _percentage(with_feedback: int, total: int) -> float:
    return round(with_feedback / total * 100, 2) if total else 0.0


@router.get(
    "/{course_id}/progress",
    response_model=StudentProgressResponse | CourseProgressResponse,
)
async def course_progress(
    course_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    token: str = Depends(oauth2_scheme),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> StudentProgressResponse | CourseProgressResponse:
    """RF-08 — el estudiante ve solo su progreso; el docente titular, el de todo el curso."""
    course = await get_member_course(db, course_id, current_user)

    # El estudiante no cuenta los proyectos ocultos (no existen para él); el docente, todos.
    project_query: dict = {"course_id": course.id}
    if current_user.role == "estudiante":
        project_query["hidden"] = {"$ne": True}
    project_ids = [str(doc["_id"]) async for doc in db.projects.find(project_query, {"_id": 1})]
    members_by_group = {
        str(doc["_id"]): doc["member_ids"]
        async for doc in db.groups.find({"project_id": {"$in": project_ids}}, {"member_ids": 1})
    }
    version_query: dict = {"project_id": {"$in": project_ids}}
    if current_user.role == "estudiante":
        own_groups = [
            gid for gid, members in members_by_group.items() if current_user.id in members
        ]
        version_query["$or"] = [
            {"student_id": current_user.id, "group_id": None},
            {"group_id": {"$in": own_groups}},
        ]
    versions = [
        doc async for doc in db.versions.find(version_query, {"student_id": 1, "group_id": 1})
    ]

    # Lectura read-only de `feedback` (Feedback Service). Varios comentarios sobre la misma
    # versión cuentan una sola vez.
    version_ids = [str(doc["_id"]) for doc in versions]
    reviewed_ids = (
        set(await db.feedback.distinct("version_id", {"version_id": {"$in": version_ids}}))
        if version_ids
        else set()
    )

    def owners(version: dict) -> list[str]:
        group_id = version.get("group_id")
        return members_by_group.get(group_id, []) if group_id else [version["student_id"]]

    totals: Counter[str] = Counter()
    reviewed: Counter[str] = Counter()
    for doc in versions:
        is_reviewed = str(doc["_id"]) in reviewed_ids
        for owner in owners(doc):
            totals[owner] += 1
            reviewed[owner] += is_reviewed
    versions_count = len(versions)
    with_feedback = sum(str(doc["_id"]) in reviewed_ids for doc in versions)

    if current_user.role == "estudiante":
        return StudentProgressResponse(
            course_id=course.id,
            student_id=current_user.id,
            versions_count=versions_count,
            versions_with_feedback=with_feedback,
            progress_percentage=_percentage(with_feedback, versions_count),
        )

    # Matriculados (incluso sin versiones, para que el docente vea quién no ha entregado)
    # más cualquier autor de versiones, sin duplicados y conservando el orden.
    student_ids = list(dict.fromkeys([*course.student_ids, *totals]))
    names = await fetch_user_names(student_ids, token)
    return CourseProgressResponse(
        course_id=course.id,
        versions_count=versions_count,
        versions_with_feedback=with_feedback,
        progress_percentage=_percentage(with_feedback, versions_count),
        students=[
            StudentProgressItem(
                student_id=student_id,
                student_name=names.get(student_id),
                versions_count=totals[student_id],
                versions_with_feedback=reviewed[student_id],
                progress_percentage=_percentage(reviewed[student_id], totals[student_id]),
            )
            for student_id in student_ids
        ],
    )
