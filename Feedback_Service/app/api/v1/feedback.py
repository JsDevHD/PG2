"""Endpoints de Feedback Service: retroalimentación parcial (RF-05, RF-06) y calificación final
(RF-09) sobre las versiones de Projects Service.

No existen endpoints para editar ni eliminar retroalimentación (RNF-08).

Proyectos por grupos: las versiones son del grupo y todos sus integrantes ven su retroalimentación
parcial. La calificación final es por integrante o por grupo según `grading_mode` del proyecto
(excluyentes); la grupal se registra una vez por integrante, así cada estudiante tiene su propio
registro y la regla "una calificación final por estudiante y proyecto" sigue aplicando.
"""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import BulkWriteError, DuplicateKeyError

from app.api.deps import (
    CurrentUser,
    get_current_teacher,
    get_current_user,
    get_db,
    verify_can_read_version,
    verify_project_member,
    verify_teacher_owns_version,
)
from app.db import projects_readonly
from app.db.init_indexes import CURRENT_PARTIAL_GRADE
from app.exceptions import ConflictError, UnprocessableError
from app.models.feedback import FeedbackInDB
from app.models.projects import VersionView
from app.schemas.feedback import FeedbackCreateRequest, FeedbackResponse, FinalGradeCreateRequest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["feedback"])

FINAL_GRADE_EXISTS = "El estudiante ya tiene una calificación final en este proyecto"
GROUP_FINAL_GRADE_EXISTS = "El grupo ya tiene una calificación final en este proyecto"
GROUP_GRADING_NO_STUDENT = "Este proyecto se califica por grupo: no se indica un estudiante"
INDIVIDUAL_GRADING_NEEDS_STUDENT = "Indica qué integrante del grupo estás calificando"
STUDENT_NOT_IN_GROUP = "El estudiante no pertenece al grupo de esta versión"
DUPLICATE_KEY = 11000
PARTIAL_GRADE_CHANGED = (
    "La calificación de esta versión cambió mientras guardabas. "
    "Recarga la página e intenta de nuevo."
)
# Orden cronológico (RF-06); `_id` desempata registros con el mismo `created_at`.
CHRONOLOGICAL = [("created_at", 1), ("_id", 1)]


def _to_response(feedback: FeedbackInDB) -> FeedbackResponse:
    return FeedbackResponse.model_validate(feedback, from_attributes=True)


def _own_work_only(current_user: CurrentUser) -> dict:
    """Filtro de alcance por rol: un estudiante solo recibe lo de sus propias versiones, sin
    importar lo que pida (mismo criterio que Projects Service); el docente titular, todo."""
    return {"student_id": current_user.id} if current_user.role == "estudiante" else {}


def _not_others_final_grades(current_user: CurrentUser) -> dict:
    """En una versión de grupo, el estudiante ve todos los comentarios pero solo su propia
    calificación final: la de un compañero calificado individualmente es de ese compañero."""
    if current_user.role != "estudiante":
        return {}
    return {"$or": [{"is_final": False}, {"student_id": current_user.id}]}


def _final_grade_document(
    version: VersionView,
    teacher: CurrentUser,
    body: FinalGradeCreateRequest,
    student_id: str,
) -> dict:
    return {
        "version_id": version.id,
        "project_id": version.project_id,
        "student_id": student_id,
        "group_id": version.group_id,
        "teacher_id": teacher.id,
        "comment": body.comment,
        "score": body.score,
        "score_replaced": False,
        "is_final": True,
        "created_at": datetime.now(UTC),
    }


async def _insert_feedback(
    db: AsyncIOMotorDatabase,
    version: VersionView,
    teacher: CurrentUser,
    body: FeedbackCreateRequest | FinalGradeCreateRequest,
    *,
    is_final: bool,
) -> FeedbackResponse:
    document = {
        "version_id": version.id,
        "project_id": version.project_id,
        "student_id": version.student_id,
        "group_id": version.group_id,
        "teacher_id": teacher.id,
        "comment": body.comment,
        "score": body.score,
        "score_replaced": False,
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
    """RF-05 / CU-03: el docente titular deja un comentario, con calificación parcial opcional.

    Una versión admite varios comentarios pero una sola calificación parcial vigente: si el
    comentario trae `score`, reemplaza a la vigente, que se conserva con `score_replaced=True`
    (nada se borra ni se edita, RNF-08). No se bloquea después de la calificación final."""
    version = await verify_teacher_owns_version(db, version_id, current_user)
    if body.score is None:
        return await _insert_feedback(db, version, current_user, body, is_final=False)

    replaced = await db.feedback.update_many(
        {**CURRENT_PARTIAL_GRADE, "version_id": version.id},
        {"$set": {"score_replaced": True}},
    )
    if replaced.modified_count:
        logger.info("Calificación parcial reemplazada: version_id=%s", version.id)
    try:
        return await _insert_feedback(db, version, current_user, body, is_final=False)
    except DuplicateKeyError as exc:
        # Otra petición simultánea dejó su calificación vigente entre el reemplazo y la inserción;
        # el índice `unique_current_partial_grade` impide que queden dos.
        raise ConflictError(PARTIAL_GRADE_CHANGED) from exc


@router.get("/versions/{version_id}/feedback", response_model=list[FeedbackResponse])
async def list_version_feedback(
    version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[FeedbackResponse]:
    """RF-06: historial de retroalimentación de una versión, en orden cronológico."""
    version = await verify_can_read_version(db, version_id, current_user)
    return await _list_feedback(
        db, {"version_id": version.id, **_not_others_final_grades(current_user)}
    )


@router.get("/projects/{project_id}/feedback", response_model=list[FeedbackResponse])
async def list_project_feedback(
    project_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[FeedbackResponse]:
    """RF-06: historial completo del proyecto, en orden cronológico. El estudiante recibe el de sus
    propias versiones (y, en proyectos por grupos, los comentarios de las de su grupo); el docente
    titular, el de todos los estudiantes."""
    await verify_project_member(db, project_id, current_user)
    query: dict = {"project_id": project_id}
    if current_user.role == "estudiante":
        group = await projects_readonly.get_student_group(db, project_id, current_user.id)
        own = [{"student_id": current_user.id}]
        if group is not None:
            own.append({"group_id": group.id, "is_final": False})
        query["$or"] = own
    return await _list_feedback(db, query)


async def _graded_students(
    db: AsyncIOMotorDatabase, version: VersionView, body: FinalGradeCreateRequest
) -> tuple[list[str], str]:
    """Estudiantes que recibe la calificación final y el mensaje si alguno ya la tenía.

    - Proyecto individual: el autor de la versión (`student_id` del body se ignora).
    - Por grupos, calificación individual: el integrante indicado en `student_id`.
    - Por grupos, calificación grupal: todos los integrantes del grupo de la versión.
    """
    project = await projects_readonly.get_project(db, version.project_id)
    if project is None or project.work_mode != "group" or version.group_id is None:
        return [version.student_id], FINAL_GRADE_EXISTS
    group = await projects_readonly.get_group(db, version.group_id)
    members = group.member_ids if group else []
    if not members:
        raise UnprocessableError("El grupo de esta versión no tiene integrantes")
    if project.grading_mode == "group":
        if body.student_id is not None:
            raise UnprocessableError(GROUP_GRADING_NO_STUDENT)
        return members, GROUP_FINAL_GRADE_EXISTS
    if body.student_id is None:
        raise UnprocessableError(INDIVIDUAL_GRADING_NEEDS_STUDENT)
    if body.student_id not in members:
        raise UnprocessableError(STUDENT_NOT_IN_GROUP)
    return [body.student_id], FINAL_GRADE_EXISTS


@router.post(
    "/projects/{project_id}/final-grade",
    response_model=list[FeedbackResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_final_grade(
    project_id: str,
    body: FinalGradeCreateRequest,
    current_user: CurrentUser = Depends(get_current_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[FeedbackResponse]:
    """RF-09: calificación final sobre `version_id`. Retorna los registros creados: uno, o uno por
    integrante si el proyecto se califica por grupo.

    Se asigna una sola vez por estudiante y proyecto; en el MVP no hay endpoint para corregirla."""
    version = await verify_teacher_owns_version(db, body.version_id, current_user)
    if version.project_id != project_id:
        raise UnprocessableError("La versión no pertenece a este proyecto")
    student_ids, exists_message = await _graded_students(db, version, body)
    documents = [
        _final_grade_document(version, current_user, body, student_id) for student_id in student_ids
    ]
    try:
        # ordered=True: si el primero ya tenía calificación final no se inserta ninguno. En
        # calificación grupal todos se califican juntos, así que nunca queda un grupo a medias.
        result = await db.feedback.insert_many(documents, ordered=True)
    except BulkWriteError as exc:
        # El índice único parcial `unique_final_grade_per_student` es quien hace cumplir la regla.
        if any(error.get("code") == DUPLICATE_KEY for error in exc.details.get("writeErrors", [])):
            raise ConflictError(exists_message) from exc
        raise
    logger.info(
        "Calificación final registrada: version_id=%s estudiantes=%d", version.id, len(documents)
    )
    return [
        _to_response(FeedbackInDB.model_validate({**document, "_id": inserted_id}))
        for document, inserted_id in zip(documents, result.inserted_ids, strict=True)
    ]


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
