"""Verificación de JWT, común a todos los microservicios.

Este módulo solo VERIFICA tokens; emitirlos es responsabilidad exclusiva de Auth Service.
Valida identidad y rol, no pertenencia a curso/proyecto: esa verificación vive en cada
servicio de negocio, contra su propia colección (H-6).
"""

import logging
from typing import Literal

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel, ValidationError

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# tokenUrl apunta al login de Auth Service; solo se usa para documentar el flujo en OpenAPI.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


class InvalidTokenError(Exception):
    """El token está mal formado, tiene firma inválida, le faltan claims o expiró."""


class CurrentUser(BaseModel):
    id: str
    role: Literal["estudiante", "docente"]


def decode_access_token(token: str) -> dict:
    """Decodifica y valida un JWT. Lanza InvalidTokenError si expiró o es inválido."""
    settings = get_settings()
    try:
        return jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"require_exp": True},
        )
    except JWTError as exc:
        raise InvalidTokenError(str(exc)) from exc


def get_current_user(token: str = Depends(oauth2_scheme)) -> CurrentUser:
    """Dependencia de FastAPI: extrae el token del header Authorization,
    lo decodifica y retorna un objeto CurrentUser(id, role).
    Lanza 401 si el token es inválido o expiró."""
    try:
        payload = decode_access_token(token)
        return CurrentUser(id=payload.get("sub"), role=payload.get("role"))
    except (InvalidTokenError, ValidationError) as exc:
        logger.debug("Token rechazado: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
