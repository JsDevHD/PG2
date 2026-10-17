"""Edición, visibilidad y eliminación de proyectos (docente titular).

- Editar: título, descripción, visibilidad y plazo de grupos, siempre. Modalidad, tamaño de los
  grupos y modo de calificación, solo mientras el proyecto no tenga grupos ni versiones: después
  cambiarían las reglas con las que ya se trabajó.
- Ocultar: el proyecto deja de existir para los estudiantes (404 en todos los servicios), pero sus
  versiones y retroalimentación se conservan. Sirve como borrador o para retirar un proyecto.
- Eliminar: solo un proyecto sin versiones. Con versiones hay evidencia académica que no se borra
  (RNF-08): se oculta en su lugar.
"""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.api.access import get_member_project, parse_object_id, require_docente
from app.api.deps import CurrentUser, get_db
from app.exceptions import ConflictError, ValidationError
from app.models.common import to_mongo_precision, utc_now
from app.models.project import ProjectInDB
from app.schemas.project import ProjectResponse, ProjectUpdateRequest

logger = logging.getLogger(__name__)

router = APIRouter()

STRUCTURE_FIELDS = ("work_mode", "group_min_size", "group_max_size", "grading_mode")
STRUCTURE_LOCKED = (
    "La modalidad, el tamaño de los grupos y la calificación ya no se pueden cambiar: "
    "el proyecto tiene grupos o versiones"
)
HAS_VERSIONS = "El proyecto tiene versiones: ocúltalo en lugar de eliminarlo"


async def _has_activity(db: AsyncIOMotorDatabase, project_id: str) -> bool:
    """¿Ya se trabajó en el proyecto? (tiene versiones o grupos formados)."""
    if await db.versions.find_one({"project_id": project_id}, {"_id": 1}):
        return True
    return await db.groups.find_one({"project_id": project_id}, {"_id": 1}) is not None


def _normalized_structure(state: dict) -> dict:
    """Modalidad y grupos tal como se guardan: un proyecto individual no tiene grupos."""
    if state["work_mode"] == "individual":
        return {
            "work_mode": "individual",
            "group_min_size": None,
            "group_max_size": None,
            "grading_mode": "individual",
            "group_deadline": None,
        }
    return {key: state[key] for key in (*STRUCTURE_FIELDS, "group_deadline")}


def _validate_group_settings(state: dict, was_group: bool) -> None:
    if state["work_mode"] != "group":
        return
    if state["group_min_size"] is None or state["group_max_size"] is None:
        raise ValidationError(
            "Un proyecto por grupos necesita el mínimo y el máximo de integrantes"
        )
    if state["group_min_size"] > state["group_max_size"]:
        raise ValidationError("El mínimo de integrantes no puede ser mayor que el máximo")
    if state["group_deadline"] is None:
        raise ValidationError("Un proyecto por grupos necesita la fecha límite para formar grupos")
    # Al pasar de individual a grupos la fecha debe ser futura (como al crear). En un proyecto que
    # ya era por grupos, una fecha pasada es válida: cierra la formación de grupos.
    if not was_group and state["group_deadline"] <= datetime.now(UTC):
        raise ValidationError("La fecha límite para formar grupos debe ser futura")


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    body: ProjectUpdateRequest,
    current_user: CurrentUser = Depends(require_docente),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> ProjectResponse:
    """Edita un proyecto. Solo cambian los campos enviados (el frontend puede enviar todos)."""
    # Para un docente, pertenecer al curso es ser su titular.
    project, _ = await get_member_project(db, project_id, current_user)
    changes = body.model_dump(exclude_unset=True)
    current = project.model_dump()
    if "group_deadline" in changes and changes["group_deadline"] is not None:
        changes["group_deadline"] = to_mongo_precision(changes["group_deadline"])

    merged = {**current, **changes}
    structure = _normalized_structure(merged)
    _validate_group_settings(structure, was_group=project.work_mode == "group")
    if any(structure[key] != current[key] for key in STRUCTURE_FIELDS) and await _has_activity(
        db, project.id
    ):
        raise ConflictError(STRUCTURE_LOCKED)

    update = {key: changes[key] for key in ("title", "description", "hidden") if key in changes}
    update.update(structure)
    update["updated_at"] = utc_now()
    doc = await db.projects.find_one_and_update(
        {"_id": parse_object_id(project.id)},
        {"$set": update},
        return_document=ReturnDocument.AFTER,
    )
    logger.info("Proyecto editado: id=%s campos=%s", project.id, sorted(changes))
    return ProjectResponse.model_validate(ProjectInDB.model_validate(doc))


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    current_user: CurrentUser = Depends(require_docente),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Response:
    """Elimina un proyecto sin versiones (y los grupos que se hubieran formado en él)."""
    project, _ = await get_member_project(db, project_id, current_user)
    if await db.versions.find_one({"project_id": project.id}, {"_id": 1}):
        raise ConflictError(HAS_VERSIONS)
    await db.groups.delete_many({"project_id": project.id})
    await db.projects.delete_one({"_id": parse_object_id(project.id)})
    logger.info("Proyecto eliminado: id=%s", project.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
