"""Grupos de los proyectos por grupos.

Los estudiantes matriculados forman los grupos ellos mismos (crear, unirse, salir) hasta la fecha
límite que fija el docente; el docente puede cambiar esa fecha. Un estudiante pertenece a lo sumo
a un grupo por proyecto (índice `unique_group_member_per_project`) y un grupo no supera el máximo
de integrantes del proyecto (condición atómica en el `$push`).
"""

import logging

from fastapi import APIRouter, Depends, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.api.access import (
    get_member_project,
    get_student_group,
    groups_open,
    parse_object_id,
    require_docente,
    require_estudiante,
)
from app.api.deps import CurrentUser, get_current_user, get_db
from app.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.models.common import to_mongo_precision, utc_now
from app.models.group import GroupInDB
from app.models.project import ProjectInDB
from app.schemas.group import GroupCreateRequest, GroupResponse
from app.schemas.project import GroupDeadlineRequest, ProjectResponse

logger = logging.getLogger(__name__)

router = APIRouter()

NOT_A_GROUP_PROJECT = "Este proyecto es individual: no tiene grupos"
GROUPS_CLOSED = "El plazo para formar grupos terminó"
ALREADY_IN_GROUP = "Ya perteneces a un grupo de este proyecto"
GROUP_FULL = "El grupo está completo"
GROUP_GRADED = "El grupo ya tiene calificación final: no admite cambios"
GROUP_HAS_VERSIONS = "El grupo ya subió versiones: no puedes salir de él"


def _group_response(doc: dict) -> GroupResponse:
    return GroupResponse.model_validate(GroupInDB.model_validate(doc))


def _require_group_project(project: ProjectInDB) -> None:
    if project.work_mode != "group":
        raise ValidationError(NOT_A_GROUP_PROJECT)


def _require_open(project: ProjectInDB) -> None:
    if not groups_open(project):
        raise ForbiddenError(GROUPS_CLOSED)


async def _get_group(db: AsyncIOMotorDatabase, project: ProjectInDB, group_id: str) -> GroupInDB:
    oid = parse_object_id(group_id)
    doc = await db.groups.find_one({"_id": oid, "project_id": project.id}) if oid else None
    if doc is None:
        raise NotFoundError("Grupo no encontrado")
    return GroupInDB.model_validate(doc)


async def _ensure_not_graded(db: AsyncIOMotorDatabase, group_id: str) -> None:
    # Lectura read-only de `feedback` (Feedback Service): con calificación final el grupo queda
    # fijo.
    if await db.feedback.find_one({"group_id": group_id, "is_final": True}, {"_id": 1}):
        raise ForbiddenError(GROUP_GRADED)


@router.get("/{project_id}/groups", response_model=list[GroupResponse])
async def list_groups(
    project_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[GroupResponse]:
    """Grupos del proyecto con sus integrantes, en orden de creación (lista vacía si el proyecto
    es individual). Los ven el docente titular y los estudiantes matriculados, para elegir grupo."""
    project, _ = await get_member_project(db, project_id, current_user)
    if project.work_mode != "group":
        return []
    cursor = db.groups.find({"project_id": project.id}).sort(
        [("created_at", ASCENDING), ("_id", ASCENDING)]
    )
    return [_group_response(doc) async for doc in cursor]


@router.post(
    "/{project_id}/groups", response_model=GroupResponse, status_code=status.HTTP_201_CREATED
)
async def create_group(
    project_id: str,
    body: GroupCreateRequest,
    current_user: CurrentUser = Depends(require_estudiante),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> GroupResponse:
    """El estudiante crea un grupo y queda como su primer integrante."""
    project, _ = await get_member_project(db, project_id, current_user)
    _require_group_project(project)
    _require_open(project)
    if await get_student_group(db, project.id, current_user.id):
        raise ConflictError(ALREADY_IN_GROUP)
    if body.name:
        name = body.name
    else:
        name = f"Grupo {await db.groups.count_documents({'project_id': project.id}) + 1}"
    doc = {
        "project_id": project.id,
        "course_id": project.course_id,
        "name": name,
        "member_ids": [current_user.id],
        "created_by": current_user.id,
        "created_at": utc_now(),
    }
    try:
        result = await db.groups.insert_one(doc)
    except DuplicateKeyError as exc:
        # Se unió a otro grupo entre la verificación y la inserción.
        raise ConflictError(ALREADY_IN_GROUP) from exc
    doc["_id"] = result.inserted_id
    logger.info("Grupo creado: id=%s project_id=%s", result.inserted_id, project.id)
    return _group_response(doc)


@router.post("/{project_id}/groups/{group_id}/join", response_model=GroupResponse)
async def join_group(
    project_id: str,
    group_id: str,
    current_user: CurrentUser = Depends(require_estudiante),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> GroupResponse:
    """El estudiante se une a un grupo con cupo. Idempotente si ya era integrante."""
    project, _ = await get_member_project(db, project_id, current_user)
    _require_group_project(project)
    _require_open(project)
    group = await _get_group(db, project, group_id)
    if current_user.id in group.member_ids:
        return GroupResponse.model_validate(group)
    await _ensure_not_graded(db, group.id)
    if await get_student_group(db, project.id, current_user.id):
        raise ConflictError(ALREADY_IN_GROUP)

    max_size = project.group_max_size or 0
    try:
        # El filtro hace atómico el cupo: solo se agrega si aún no existe la posición max_size.
        doc = await db.groups.find_one_and_update(
            {
                "_id": parse_object_id(group.id),
                "member_ids": {"$ne": current_user.id},
                f"member_ids.{max_size - 1}": {"$exists": False},
            },
            {"$push": {"member_ids": current_user.id}},
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError as exc:
        raise ConflictError(ALREADY_IN_GROUP) from exc
    if doc is None:
        raise ConflictError(GROUP_FULL)
    return _group_response(doc)


@router.post("/{project_id}/groups/{group_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_group(
    project_id: str,
    group_id: str,
    current_user: CurrentUser = Depends(require_estudiante),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Response:
    """El estudiante sale de su grupo dentro del plazo, si el grupo todavía no subió versiones.

    Un grupo que queda sin integrantes se elimina: aún no tiene evidencias que conservar.
    """
    project, _ = await get_member_project(db, project_id, current_user)
    _require_group_project(project)
    _require_open(project)
    group = await _get_group(db, project, group_id)
    if current_user.id not in group.member_ids:
        raise ForbiddenError("No perteneces a este grupo")
    if await db.versions.find_one({"group_id": group.id}, {"_id": 1}):
        raise ConflictError(GROUP_HAS_VERSIONS)

    oid = parse_object_id(group.id)
    await db.groups.update_one({"_id": oid}, {"$pull": {"member_ids": current_user.id}})
    await db.groups.delete_one({"_id": oid, "member_ids": {"$size": 0}})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{project_id}/group-deadline", response_model=ProjectResponse)
async def update_group_deadline(
    project_id: str,
    body: GroupDeadlineRequest,
    current_user: CurrentUser = Depends(require_docente),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> ProjectResponse:
    """El docente titular cambia el plazo para formar grupos: lo amplía para los rezagados o lo
    cierra antes. Una fecha pasada cierra la formación de grupos de inmediato."""
    # Para un docente, pertenecer al curso es ser su titular.
    project, _ = await get_member_project(db, project_id, current_user)
    _require_group_project(project)
    doc = await db.projects.find_one_and_update(
        {"_id": parse_object_id(project.id)},
        {"$set": {"group_deadline": to_mongo_precision(body.group_deadline)}},
        return_document=ReturnDocument.AFTER,
    )
    return ProjectResponse.model_validate(ProjectInDB.model_validate(doc))
