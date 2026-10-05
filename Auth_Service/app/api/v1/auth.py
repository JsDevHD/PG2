"""Endpoints de Auth Service: registro (RF-10), login (RF-01), usuario actual y resolución
de nombres para el resto del sistema."""

import asyncio
import logging
from datetime import UTC, datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.api.deps import CurrentUser, get_current_user, get_db
from app.core.config import Settings, get_settings
from app.core.credentials import create_access_token, hash_password, verify_password
from app.exceptions import ConflictError, NotFoundError
from app.models.user import UserInDB
from app.schemas.user import (
    TokenResponse,
    UserLoginRequest,
    UserPublicResponse,
    UserRegisterRequest,
    UserResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()

INVALID_CREDENTIALS = "Credenciales inválidas"
MAX_BATCH_IDS = 100


def _to_response(user: UserInDB) -> UserResponse:
    return UserResponse.model_validate(user, from_attributes=True)


@router.post(
    "/auth/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["auth"],
)
async def register(
    body: UserRegisterRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> UserResponse:
    """RF-10: crea una cuenta nueva. El rol queda fijo desde la creación."""
    # bcrypt es costoso en CPU; se ejecuta fuera del event loop para no bloquear otras peticiones.
    password_hash = await asyncio.to_thread(hash_password, body.password)
    document = {
        "name": body.name,
        "email": body.email,
        "password_hash": password_hash,
        "role": body.role.value,
        "created_at": datetime.now(UTC),
    }
    try:
        result = await db.users.insert_one(document)
    except DuplicateKeyError as exc:
        raise ConflictError("El correo ya está registrado") from exc

    logger.info("Usuario registrado: id=%s role=%s", result.inserted_id, body.role.value)
    return _to_response(UserInDB.model_validate({**document, "_id": result.inserted_id}))


@router.post("/auth/login", response_model=TokenResponse, tags=["auth"])
async def login(
    body: UserLoginRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    """RF-01: autentica con correo y contraseña y emite un JWT."""
    document = await db.users.find_one({"email": body.email})
    user = UserInDB.model_validate(document) if document else None
    if user is None or not await asyncio.to_thread(
        verify_password, body.password, user.password_hash
    ):
        # Mismo mensaje si el correo no existe o la contraseña falla: evita enumerar correos.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=INVALID_CREDENTIALS,
            headers={"WWW-Authenticate": "Bearer"},
        )

    return TokenResponse(
        access_token=create_access_token(user.id, user.role.value),
        expires_in=settings.jwt_expire_minutes * 60,
    )


@router.get("/auth/me", response_model=UserResponse, tags=["auth"])
async def me(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> UserResponse:
    """Datos del usuario autenticado; el frontend lo usa al cargar la aplicación."""
    document = None
    if ObjectId.is_valid(current_user.id):
        document = await db.users.find_one({"_id": ObjectId(current_user.id)})
    if document is None:
        raise NotFoundError("Usuario no encontrado")
    return _to_response(UserInDB.model_validate(document))


@router.get(
    "/users/batch",
    response_model=list[UserPublicResponse],
    dependencies=[Depends(get_current_user)],
    tags=["users"],
)
async def users_batch(
    ids: str = Query(description=f"Ids separados por comas (máximo {MAX_BATCH_IDS})"),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[UserPublicResponse]:
    """Resuelve ids a nombres de display. Los ids inexistentes o mal formados se omiten."""
    requested = [raw.strip() for raw in ids.split(",") if raw.strip()]
    if len(requested) > MAX_BATCH_IDS:
        raise HTTPException(status_code=422, detail=f"Máximo {MAX_BATCH_IDS} ids por llamada")

    object_ids = list(dict.fromkeys(ObjectId(i) for i in requested if ObjectId.is_valid(i)))
    # La proyección garantiza que email y password_hash ni siquiera salen de la base.
    cursor = db.users.find({"_id": {"$in": object_ids}}, {"name": 1, "role": 1})
    found = {doc["_id"]: doc async for doc in cursor}

    # Se responde en el mismo orden en que se pidieron los ids.
    return [
        UserPublicResponse(id=str(oid), name=found[oid]["name"], role=found[oid]["role"])
        for oid in object_ids
        if oid in found
    ]
