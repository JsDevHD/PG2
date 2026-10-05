"""Endpoints de Feedback Service: retroalimentación parcial (RF-05, RF-06) y calificación final
(RF-09) sobre las versiones de Projects Service.

No existen endpoints para editar ni eliminar retroalimentación (RNF-08).
"""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.api.deps import (
    CurrentUser,
    get_current_teacher,
    get_current_user,
    get_db,
    verify_can_read_version,
    verify_project_member,
    verify_teacher_owns_version,
)
from app.exceptions import ConflictError, UnprocessableError
from app.models.feedback import FeedbackInDB
from app.models.projects import VersionView
from app.schemas.feedback import FeedbackCreateRequest, FeedbackResponse, FinalGradeCreateRequest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["feedback"])

FINAL_GRADE_EXISTS = "El estudiante ya tiene una calificación final en este proyecto"
# Orden cronológico (RF-06); `_id` desempata registros con el mismo `created_at`.
CHRONOLOGICAL = [("created_at", 1), ("_id", 1)]


def _to_response(feedback: FeedbackInDB) -> FeedbackResponse:
    return FeedbackResponse.model_validate(feedback, from_attributes=True)


def _own_work_only(current_user: CurrentUser) -> dict:
    """Filtro de alcance por rol: un estudiante solo recibe lo de sus propias versiones, sin
    importar lo que pida (mismo criterio que Projects Service); el docente titular, todo."""
    return {"student_id": current_user.id} if current_user.role == "estudiante" else {}


async def _insert_feedback(
    db: AsyncIOMotorDatabase,
    version: VersionView,
    teacher: CurrentUser,
    body: FeedbackCreateRequest,
    *,
    is_final: bool,
) -> FeedbackResponse:
    document = {
        "version_id": version.id,
        "project_id": version.project_id,
        "student_id": version.student_id,
        "teacher_id": teacher.id,
        "comment": body.comment,
        "score": body.score,
        "is_final": is_final,
        "created_at": datetime.now(UTC),
    }
    result = await db.feedback.insert_one(document)
    logger.info(
        "Retroalimentación registrada: id=%s version_id=%s is_final=%s",
        result.inserted_id,
        version.id,
        is_final,
    )
    return _to_response(FeedbackInDB.model_validate({**document, "_id": result.inserted_id}))


async def _list_feedback(db: AsyncIOMotorDatabase, query: dict) -> list[FeedbackResponse]:
    cursor = db.feedback.find(query).sort(CHRONOLOGICAL)
    return [_to_response(FeedbackInDB.model_validate(document)) async for document in cursor]


@router.post(
    "/versions/{version_id}/feedback",
    response_model=FeedbackResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_feedback(
    version_id: str,
    body: FeedbackCreateRequest,
    current_user: CurrentUser = Depends(get_current_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> FeedbackResponse:
    """RF-05 / CU-03: el docente titular deja un comentario y una calificación parcial.

    No se bloquea después de la calificación final: el docente puede seguir comentando."""
    version = await verify_teacher_owns_version(db, version_id, current_user)
    return await _insert_feedback(db, version, current_user, body, is_final=False)


@router.get("/versions/{version_id}/feedback", response_model=list[FeedbackResponse])
async def list_version_feedback(
    version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[FeedbackResponse]:
    """RF-06: historial de retroalimentación de una versión, en orden cronológico."""
    version = await verify_can_read_version(db, version_id, current_user)
    return await _list_feedback(db, {"version_id": version.id})


@router.get("/projects/{project_id}/feedback", response_model=list[FeedbackResponse])
async def list_project_feedback(
    project_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[FeedbackResponse]:
    """RF-06: historial completo del proyecto, en orden cronológico. El estudiante solo recibe el
    de sus propias versiones; el docente titular, el de todos los estudiantes."""
    await verify_project_member(db, project_id, current_user)
    return await _list_feedback(db, {"project_id": project_id, **_own_work_only(current_user)})


@router.post(
    "/projects/{project_id}/final-grade",
    response_model=FeedbackResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_final_grade(
    project_id: str,
    body: FinalGradeCreateRequest,
    current_user: CurrentUser = Depends(get_current_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> FeedbackResponse:
    """RF-09: calificación final del estudiante autor de `version_id` en este proyecto.

    Se asigna una sola vez por estudiante y proyecto; en el MVP no hay endpoint para corregirla."""
    version = await verify_teacher_owns_version(db, body.version_id, current_user)
    if version.project_id != project_id:
        raise UnprocessableError("La versión no pertenece a este proyecto")
    try:
        return await _insert_feedback(db, version, current_user, body, is_final=True)
    except DuplicateKeyError as exc:
        # El índice único parcial `unique_final_grade_per_student` es quien hace cumplir la regla.
        raise ConflictError(FINAL_GRADE_EXISTS) from exc


@router.get("/projects/{project_id}/final-grade", response_model=list[FeedbackResponse])
async def list_final_grades(
    project_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[FeedbackResponse]:
    """Calificaciones finales del proyecto. El estudiante recibe la suya (lista vacía si aún no
    lo han calificado); el docente titular, la de cada estudiante ya calificado."""
    await verify_project_member(db, project_id, current_user)
    query = {"project_id": project_id, "is_final": True, **_own_work_only(current_user)}
    return await _list_feedback(db, query)
