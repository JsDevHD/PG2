"""Versiones de un proyecto (RF-03, RF-04, CU-02).

No existen `PUT` ni `DELETE`: una versión subida no se reemplaza ni se elimina (RNF-08).
"""

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING

from app.api.access import get_member_project, parse_object_id, require_estudiante
from app.api.deps import CurrentUser, get_current_user, get_db
from app.core.storage import upload_file, validate_file
from app.exceptions import ForbiddenError, NotFoundError
from app.models.common import utc_now
from app.models.version import VersionInDB
from app.schemas.version import VersionResponse

router = APIRouter()


def _version_response(doc: dict) -> VersionResponse:
    return VersionResponse.model_validate(VersionInDB.model_validate(doc))


async def _ensure_project_not_finalized(db: AsyncIOMotorDatabase, project_id: str) -> None:
    """E3 de CU-02: con calificación final asignada no se aceptan más versiones.

    Lectura read-only de `feedback` (propiedad de Feedback Service).
    """
    version_ids = [
        str(doc["_id"]) async for doc in db.versions.find({"project_id": project_id}, {"_id": 1})
    ]
    if not version_ids:
        return
    final = await db.feedback.find_one(
        {"version_id": {"$in": version_ids}, "is_final": True}, {"_id": 1}
    )
    if final is not None:
        raise ForbiddenError("El proyecto ya tiene calificación final asignada")


@router.post(
    "/{project_id}/versions",
    response_model=VersionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_version(
    project_id: str,
    file: UploadFile = File(),
    description: str = Form(min_length=1, max_length=2000),
    current_user: CurrentUser = Depends(require_estudiante),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> VersionResponse:
    """RF-03 / CU-02 — sube una versión (diagrama `Secuencia_SubirVersion_H6`)."""
    project, _ = await get_member_project(db, project_id, current_user)  # H-6
    validate_file(file)  # RNF-05
    await _ensure_project_not_finalized(db, project.id)
    file_url = await upload_file(file, project.id, current_user.id)
    doc = {
        "project_id": project.id,
        "student_id": current_user.id,
        "file_url": file_url,
        "description": description,
        "uploaded_at": utc_now(),
    }
    result = await db.versions.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _version_response(doc)


@router.get("/{project_id}/versions", response_model=list[VersionResponse])
async def list_versions(
    project_id: str,
    student_id: str | None = Query(
        default=None, description="Solo docente: filtra el hilo de un estudiante"
    ),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[VersionResponse]:
    """RF-04 — historial de versiones en orden cronológico."""
    project, _ = await get_member_project(db, project_id, current_user)
    query: dict = {"project_id": project.id}
    if current_user.role == "estudiante":
        # Sección 7: un estudiante solo ve lo suyo, sin importar el `student_id` que envíe.
        query["student_id"] = current_user.id
    elif student_id is not None:
        query["student_id"] = student_id
    cursor = db.versions.find(query).sort([("uploaded_at", ASCENDING), ("_id", ASCENDING)])
    return [_version_response(doc) async for doc in cursor]


@router.get("/{project_id}/versions/{version_id}", response_model=VersionResponse)
async def get_version(
    project_id: str,
    version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> VersionResponse:
    """Detalle de una versión del proyecto (extiende RF-04)."""
    project, _ = await get_member_project(db, project_id, current_user)
    oid = parse_object_id(version_id)
    doc = await db.versions.find_one({"_id": oid, "project_id": project.id}) if oid else None
    if current_user.role == "estudiante":
        # 403 tanto si es ajena como si no existe: el estudiante no puede distinguir
        # entre ambos casos ni sondear qué versiones de sus compañeros existen.
        if doc is None or doc["student_id"] != current_user.id:
            raise ForbiddenError()
    elif doc is None:
        raise NotFoundError("Versión no encontrada")
    return _version_response(doc)
