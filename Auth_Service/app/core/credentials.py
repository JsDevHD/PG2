"""Emisión de credenciales: hash de contraseñas y firma de JWT. Exclusivo de Auth Service.

La verificación de tokens vive en `core/security.py` (template), común a los cuatro servicios.
"""

from datetime import UTC, datetime, timedelta

import bcrypt
from jose import jwt

from app.core.config import get_settings

# bcrypt opera sobre bytes y desde la versión 5 lanza ValueError si recibe más de 72.
BCRYPT_MAX_BYTES = 72


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    encoded = password.encode()
    # El registro impide guardar contraseñas de más de 72 bytes, así que una así nunca coincide.
    if len(encoded) > BCRYPT_MAX_BYTES:
        return False
    return bcrypt.checkpw(encoded, password_hash.encode())


def create_access_token(user_id: str, role: str) -> str:
    """Firma el JWT con los claims que `get_current_user` espera en todos los servicios:
    `sub`, `role` y `exp`. No agregar claims sin actualizar el template."""
    settings = get_settings()
    expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": user_id, "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
