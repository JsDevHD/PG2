"""Punto único de importación de dependencias para los routers de negocio.

Uso: `from app.api.deps import CurrentUser, get_current_user, get_db`

Además de las dependencias del template, aquí vive la verificación de pertenencia (H-6) de
Feedback Service, compartida por todos sus endpoints para no duplicarla. Consulta `versions`,
`projects` y `courses` en modo solo lectura (ver `app/db/projects_readonly.py`).
"""

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.security import CurrentUser, get_current_user
from app.db import projects_readonly
from app.db.mongodb import get_db
from app.exceptions import ForbiddenError, NotFoundError
from app.models.projects import VersionView

__all__ = [
    "CurrentUser",
    "get_current_teacher",
    "get_current_user",
    "get_db",
    "verify_can_read_version",
    "verify_project_member",
    "verify_teacher_owns_version",
]


def get_current_teacher(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Como `get_current_user`, pero exige rol `docente` (403 si no lo es)."""
    if current_user.role != "docente":
        raise ForbiddenError("Solo un docente puede realizar esta acción")
    return current_user


async def _get_version_or_404(db: AsyncIOMotorDatabase, version_id: str) -> VersionView:
    version = await projects_readonly.get_version(db, version_id)
    if version is None:
        raise NotFoundError("Versión no encontrada")
    return version


async def verify_teacher_owns_version(
    db: AsyncIOMotorDatabase, version_id: str, current_user: CurrentUser
) -> VersionView:
    """H-6 (CU-03, pasos 2–3): la versión existe (404) y `current_user` es el docente titular del
    curso al que pertenece (403). Recorre versión → proyecto → curso."""
    version = await _get_version_or_404(db, version_id)
    project = await projects_readonly.get_project(db, version.project_id)
    course = await projects_readonly.get_course(db, project.course_id) if project else None
    if course is None or course.teacher_id != current_user.id:
        raise ForbiddenError()
    return version


async def verify_can_read_version(
    db: AsyncIOMotorDatabase, version_id: str, current_user: CurrentUser
) -> VersionView:
    """El estudiante accede a sus propias versiones y, en proyectos por grupos, a las de su grupo;
    el docente, a las de los cursos que dicta. 404 si la versión no existe, 403 si no tiene
    acceso."""
    if current_user.role == "docente":
        return await verify_teacher_owns_version(db, version_id, current_user)
    version = await _get_version_or_404(db, version_id)
    project = await projects_readonly.get_project(db, version.project_id)
    if project is None or project.hidden:
        # Un proyecto oculto no existe para el estudiante, igual que en Projects Service.
        raise NotFoundError("Versión no encontrada")
    if version.student_id == current_user.id:
        return version
    group = await projects_readonly.get_group(db, version.group_id) if version.group_id else None
    if group is None or current_user.id not in group.member_ids:
        raise ForbiddenError()
    return version


async def verify_project_member(
    db: AsyncIOMotorDatabase, project_id: str, current_user: CurrentUser
) -> None:
    """El proyecto existe (404) y `current_user` es el docente titular o un estudiante
    matriculado en su curso (403)."""
    project = await projects_readonly.get_project(db, project_id)
    if project is None or (project.hidden and current_user.role == "estudiante"):
        raise NotFoundError("Proyecto no encontrado")
    course = await projects_readonly.get_course(db, project.course_id)
    if course is None:
        raise ForbiddenError()
    if current_user.role == "docente":
        is_member = course.teacher_id == current_user.id
    else:
        is_member = current_user.id in course.student_ids
    if not is_member:
        raise ForbiddenError()
