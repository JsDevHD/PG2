from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, EmailStr, Field, field_validator

from app.core.credentials import BCRYPT_MAX_BYTES
from app.models.user import UserRole

# El correo no distingue mayúsculas: "Ana@Uni.edu.co" y "ana@uni.edu.co" son la misma cuenta.
NormalizedEmail = Annotated[EmailStr, AfterValidator(str.lower)]


class UserRegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: NormalizedEmail
    password: str = Field(min_length=8, max_length=72)  # 72 = límite de bcrypt
    role: UserRole

    @field_validator("password")
    @classmethod
    def password_fits_bcrypt(cls, value: str) -> str:
        # El límite de bcrypt es en bytes: con tildes o ñ, 72 caracteres pueden superarlo.
        if len(value.encode()) > BCRYPT_MAX_BYTES:
            raise ValueError(f"La contraseña no puede superar {BCRYPT_MAX_BYTES} bytes")
        return value


class UserLoginRequest(BaseModel):
    email: NormalizedEmail
    password: str


class UserResponse(BaseModel):
    id: str
    name: str
    email: EmailStr
    role: UserRole
    created_at: datetime


class UserPublicResponse(BaseModel):
    """Solo datos de display; excluye deliberadamente `email` y `password_hash` (RNF-06)."""

    id: str
    name: str
    role: UserRole


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # segundos
