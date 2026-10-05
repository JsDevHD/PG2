"""Progreso de un curso (RF-08).

progreso = (versiones con al menos una retroalimentación / total de versiones) × 100
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

    project_ids = [
        str(doc["_id"]) async for doc in db.projects.find({"course_id": course.id}, {"_id": 1})
    ]
    version_query: dict = {"project_id": {"$in": project_ids}}
    if current_user.role == "estudiante":
        version_query["student_id"] = current_user.id
    versions = [doc async for doc in db.versions.find(version_query, {"student_id": 1})]

    # Lectura read-only de `feedback` (Feedback Service). Varios comentarios sobre la misma
    # versión cuentan una sola vez.
    version_ids = [str(doc["_id"]) for doc in versions]
    reviewed_ids = (
        set(await db.feedback.distinct("version_id", {"version_id": {"$in": version_ids}}))
        if version_ids
        else set()
    )

    totals = Counter(doc["student_id"] for doc in versions)
    reviewed = Counter(doc["student_id"] for doc in versions if str(doc["_id"]) in reviewed_ids)
    versions_count = len(versions)
    with_feedback = sum(reviewed.values())

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
