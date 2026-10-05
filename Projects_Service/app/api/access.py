"""Verificaciones de rol y de pertenencia (H-6) compartidas por los routers de negocio.

`get_current_user` (template) solo valida identidad y rol del token; la pertenencia a un
curso se verifica aquí, contra la colección `courses` de este servicio:
- docente: debe ser el titular (`courses.teacher_id`); no hay co-docentes en el MVP.
- estudiante: debe estar en `courses.student_ids`.
"""

from collections.abc import Callable
from typing import Literal

from bson import ObjectId
from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.deps import CurrentUser, get_current_user
from app.exceptions import ForbiddenError, NotFoundError
from app.models.course import CourseInDB
from app.models.project import ProjectInDB


def _require_role(role: Literal["estudiante", "docente"]) -> Callable[..., CurrentUser]:
    def dependency(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role != role:
            raise ForbiddenError(f"Esta acción requiere el rol {role}")
        return current_user

    return dependency


require_docente = _require_role("docente")
require_estudiante = _require_role("estudiante")


def parse_object_id(value: str) -> ObjectId | None:
    """ObjectId del id recibido en la ruta, o None si no tiene formato válido."""
    return ObjectId(value) if ObjectId.is_valid(value) else None


def is_course_member(course: CourseInDB, user: CurrentUser) -> bool:
    if user.role == "docente":
        return course.teacher_id == user.id
    return user.id in course.student_ids


async def get_course(db: AsyncIOMotorDatabase, course_id: str) -> CourseInDB:
    oid = parse_object_id(course_id)
    doc = await db.courses.find_one({"_id": oid}) if oid else None
    if doc is None:
        raise NotFoundError("Curso no encontrado")
    return CourseInDB.model_validate(doc)


async def get_member_course(
    db: AsyncIOMotorDatabase, course_id: str, user: CurrentUser
) -> CourseInDB:
    """Curso si `user` es su titular o está matriculado; si no, 403 (404 si no existe)."""
    course = await get_course(db, course_id)
    if not is_course_member(course, user):
        raise ForbiddenError()
    return course


async def get_titular_course(
    db: AsyncIOMotorDatabase, course_id: str, user: CurrentUser
) -> CourseInDB:
    """Curso solo si `user` es el docente titular; si no, 403 (404 si no existe)."""
    course = await get_course(db, course_id)
    if course.teacher_id != user.id:
        raise ForbiddenError("Solo el docente titular del curso puede realizar esta acción")
    return course


async def get_member_project(
    db: AsyncIOMotorDatabase, project_id: str, user: CurrentUser
) -> tuple[ProjectInDB, CourseInDB]:
    """Proyecto y su curso si `user` pertenece al curso; si no, 403 (404 si no existe)."""
    oid = parse_object_id(project_id)
    doc = await db.projects.find_one({"_id": oid}) if oid else None
    if doc is None:
        raise NotFoundError("Proyecto no encontrado")
    project = ProjectInDB.model_validate(doc)
    course = await get_member_course(db, project.course_id, user)
    return project, course
