"""Versiones de un proyecto (RF-03, RF-04, CU-02).

No existen `PUT` ni `DELETE`: una versión subida no se reemplaza ni se elimina (RNF-08).
"""

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING

from app.api.access import (
    get_member_project,
    get_student_group,
    parse_object_id,
    require_estudiante,
)
from app.api.deps import CurrentUser, get_current_user, get_db
from app.core.storage import ALLOWED_CONTENT_TYPES, download_file, upload_file, validate_file
from app.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.models.common import utc_now
from app.models.version import VersionInDB
from app.schemas.version import VersionResponse

router = APIRouter()

RIGHTS_DECLARATION_REQUIRED = (
    "Debes declarar que eres autor de la obra y que tienes permiso para el material de terceros"
)
ALREADY_GRADED = "Ya tienes calificación final en este proyecto: no se aceptan más versiones"
GROUP_REQUIRED = "Este proyecto es por grupos: únete a un grupo para subir versiones"


def _version_response(doc: dict) -> VersionResponse:
    return VersionResponse.model_validate(VersionInDB.model_validate(doc))


async def _ensure_student_not_graded(
    db: AsyncIOMotorDatabase, project_id: str, student_id: str
) -> None:
    """E3 de CU-02: un estudiante con calificación final en el proyecto no sube más versiones.

    Es por estudiante: calificar a uno no bloquea a sus compañeros. En proyectos por grupos con
    calificación grupal cada integrante recibe su registro de calificación final, así que el grupo
    entero queda bloqueado. Lectura read-only de `feedback` (propiedad de Feedback Service).
    """
    final = await db.feedback.find_one(
        {"project_id": project_id, "student_id": student_id, "is_final": True}, {"_id": 1}
    )
    if final is not None:
        raise ForbiddenError(ALREADY_GRADED)


async def _student_can_see(db: AsyncIOMotorDatabase, version: dict, student_id: str) -> bool:
    """El estudiante ve sus versiones y, en proyectos por grupos, las de su grupo."""
    if version["student_id"] == student_id:
        return True
    group_oid = parse_object_id(version.get("group_id") or "")
    if group_oid is None:
        return False
    return await db.groups.find_one({"_id": group_oid, "member_ids": student_id}) is not None


@router.post(
    "/{project_id}/versions",
    response_model=VersionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_version(
    project_id: str,
    file: UploadFile = File(),
    description: str = Form(min_length=1, max_length=2000),
    rights_declaration: bool = Form(False),
    current_user: CurrentUser = Depends(require_estudiante),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> VersionResponse:
    """RF-03 / CU-02 — sube una versión (diagrama `Secuencia_SubirVersion_H6`).

    `rights_declaration`: el estudiante declara que es autor de la obra o tiene permiso para el
    material de terceros y la autorización de las personas identificables que aparecen en ella.
    Es obligatoria y queda registrada con la fecha como evidencia.
    """
    project, _ = await get_member_project(db, project_id, current_user)  # H-6
    group_id = None
    if project.work_mode == "group":
        # La versión es del grupo: cualquier integrante la sube y todos la ven.
        group = await get_student_group(db, project.id, current_user.id)
        if group is None:
            raise ForbiddenError(GROUP_REQUIRED)
        group_id = group.id
    if not rights_declaration:
        raise ValidationError(RIGHTS_DECLARATION_REQUIRED)
    validate_file(file)  # RNF-05
    await _ensure_student_not_graded(db, project.id, current_user.id)
    file_url = await upload_file(file, project.id, current_user.id)
    now = utc_now()
    doc = {
        "project_id": project.id,
        "student_id": current_user.id,
        "group_id": group_id,
        "file_url": file_url,
        "description": description,
        "uploaded_at": now,
        "rights_declared_at": now,
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
    group_id: str | None = Query(
        default=None, description="Solo docente: filtra el historial de un grupo"
    ),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[VersionResponse]:
    """RF-04 — historial de versiones en orden cronológico.

    En proyectos por grupos, el estudiante ve el historial de su grupo (vacío si aún no tiene).
    """
    project, _ = await get_member_project(db, project_id, current_user)
    query: dict = {"project_id": project.id}
    if current_user.role == "estudiante":
        # Sección 7: un estudiante solo ve lo suyo, sin importar los filtros que envíe.
        if project.work_mode == "group":
            group = await get_student_group(db, project.id, current_user.id)
            if group is None:
                return []
            query["group_id"] = group.id
        else:
            query["student_id"] = current_user.id
    else:
        if student_id is not None:
            query["student_id"] = student_id
        if group_id is not None:
            query["group_id"] = group_id
    cursor = db.versions.find(query).sort([("uploaded_at", ASCENDING), ("_id", ASCENDING)])
    return [_version_response(doc) async for doc in cursor]


async def _get_accessible_version(
    db: AsyncIOMotorDatabase, project_id: str, version_id: str, current_user: CurrentUser
) -> dict:
    """Documento de la versión si `current_user` puede verla (H-6), o la excepción que aplica."""
    project, _ = await get_member_project(db, project_id, current_user)
    oid = parse_object_id(version_id)
    doc = await db.versions.find_one({"_id": oid, "project_id": project.id}) if oid else None
    if current_user.role == "estudiante":
        # 403 tanto si es ajena como si no existe: el estudiante no puede distinguir
        # entre ambos casos ni sondear qué versiones de sus compañeros existen.
        if doc is None or not await _student_can_see(db, doc, current_user.id):
            raise ForbiddenError()
    elif doc is None:
        raise NotFoundError("Versión no encontrada")
    return doc


@router.get("/{project_id}/versions/{version_id}", response_model=VersionResponse)
async def get_version(
    project_id: str,
    version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> VersionResponse:
    """Detalle de una versión del proyecto (extiende RF-04)."""
    doc = await _get_accessible_version(db, project_id, version_id, current_user)
    return _version_response(doc)


@router.get(
    "/{project_id}/versions/{version_id}/file",
    response_class=Response,
    responses={200: {"content": {ct: {} for ct in sorted(ALLOWED_CONTENT_TYPES)}}},
)
async def get_version_file(
    project_id: str,
    version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Response:
    """Archivo de la versión, con la misma autorización que el detalle (H-6).

    Blob Storage es privado, así que `file_url` no se puede abrir desde el navegador; el frontend
    descarga el archivo por aquí con su JWT.
    """
    doc = await _get_accessible_version(db, project_id, version_id, current_user)
    content, content_type = await download_file(doc["file_url"])
    return Response(
        content=content,
        media_type=content_type,
        headers={
            # Una versión nunca cambia (RNF-08): el navegador puede cachearla, pero solo en privado.
            "Cache-Control": "private, max-age=86400, immutable",
            "X-Content-Type-Options": "nosniff",
            # Un SVG subido no debe poder ejecutar scripts si se abre directamente.
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        },
    )
