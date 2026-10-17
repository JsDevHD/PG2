"""Cursos y proyectos de un curso (RF-02, CU-01)."""

import logging
import secrets
import string

from fastapi import APIRouter, Depends, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.api.access import (
    get_member_course,
    get_titular_course,
    require_docente,
    require_estudiante,
)
from app.api.deps import CurrentUser, get_current_user, get_db
from app.exceptions import ConflictError, NotFoundError
from app.models.common import to_mongo_precision, utc_now
from app.models.course import CourseInDB
from app.models.project import ProjectInDB
from app.schemas.course import CourseCreateRequest, CourseJoinRequest, CourseResponse
from app.schemas.project import ProjectCreateRequest, ProjectResponse

logger = logging.getLogger(__name__)

router = APIRouter()

COURSE_CODE_ALPHABET = string.ascii_uppercase + string.digits
COURSE_CODE_LENGTH = 6
MAX_CODE_ATTEMPTS = 5


def generate_course_code() -> str:
    return "".join(secrets.choice(COURSE_CODE_ALPHABET) for _ in range(COURSE_CODE_LENGTH))


def _course_response(doc: dict) -> CourseResponse:
    return CourseResponse.model_validate(CourseInDB.model_validate(doc))


def _project_response(doc: dict) -> ProjectResponse:
    return ProjectResponse.model_validate(ProjectInDB.model_validate(doc))


@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    body: CourseCreateRequest,
    current_user: CurrentUser = Depends(require_docente),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> CourseResponse:
    """RF-02 — crea un curso con un `course_code` único generado por el sistema."""
    # 36^6 combinaciones hacen improbable una colisión, pero el índice único es quien decide.
    for _ in range(MAX_CODE_ATTEMPTS):
        doc = {
            "name": body.name,
            "course_code": generate_course_code(),
            "teacher_id": current_user.id,
            "student_ids": [],
        }
        try:
            result = await db.courses.insert_one(doc)
        except DuplicateKeyError:
            logger.info("Colisión de course_code; se genera otro")
            continue
        doc["_id"] = result.inserted_id
        return _course_response(doc)
    raise ConflictError("No fue posible generar un código de curso único; intente de nuevo")


@router.get("", response_model=list[CourseResponse])
async def list_courses(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[CourseResponse]:
    """Cursos propios (docente) o en los que está matriculado (estudiante)."""
    if current_user.role == "docente":
        query = {"teacher_id": current_user.id}
    else:
        query = {"student_ids": current_user.id}
    cursor = db.courses.find(query).sort("name", ASCENDING)
    return [_course_response(doc) async for doc in cursor]


@router.post("/join", response_model=CourseResponse)
async def join_course(
    body: CourseJoinRequest,
    current_user: CurrentUser = Depends(require_estudiante),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> CourseResponse:
    """RF-02 / CU-01 — matricula al estudiante con el código del curso.

    Idempotente (flujo alternativo A1): si ya estaba matriculado responde 200 igual.
    `$addToSet` evita duplicados aunque lleguen dos peticiones a la vez.
    """
    doc = await db.courses.find_one_and_update(
        {"course_code": body.course_code},
        {"$addToSet": {"student_ids": current_user.id}},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        raise NotFoundError("Código de curso no válido")
    return _course_response(doc)


@router.post(
    "/{course_id}/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project(
    course_id: str,
    body: ProjectCreateRequest,
    current_user: CurrentUser = Depends(require_docente),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> ProjectResponse:
    """RF-02 — crea un proyecto; solo el docente titular del curso.

    Si es por grupos, fija el tamaño de los grupos, el plazo para formarlos y el modo de
    calificación (individual o por grupo). El frontend advierte si los inscritos no alcanzan para
    formar los grupos; aquí no se bloquea, porque los estudiantes pueden seguir matriculándose.
    """
    course = await get_titular_course(db, course_id, current_user)
    doc = {
        "course_id": course.id,
        "title": body.title,
        "description": body.description,
        "created_by": current_user.id,
        "created_at": utc_now(),
        "work_mode": body.work_mode,
        "grading_mode": body.grading_mode,
        "group_min_size": body.group_min_size,
        "group_max_size": body.group_max_size,
        "group_deadline": (
            to_mongo_precision(body.group_deadline) if body.group_deadline else None
        ),
        "hidden": body.hidden,
    }
    result = await db.projects.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _project_response(doc)


@router.get("/{course_id}/projects", response_model=list[ProjectResponse])
async def list_projects(
    course_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[ProjectResponse]:
    """Proyectos del curso, en orden de creación. Requiere pertenencia al curso.

    El docente ve todos; el estudiante, solo los visibles (los ocultos no existen para él).
    """
    course = await get_member_course(db, course_id, current_user)
    query: dict = {"course_id": course.id}
    if current_user.role == "estudiante":
        query["hidden"] = {"$ne": True}
    cursor = db.projects.find(query).sort([("created_at", ASCENDING), ("_id", ASCENDING)])
    return [_project_response(doc) async for doc in cursor]
