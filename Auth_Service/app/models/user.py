"""Documento de la colección `users` (escrita exclusivamente por Auth Service)."""

from datetime import datetime
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, EmailStr, Field

# Mongo entrega `_id` como ObjectId; dentro de la app y en la API siempre se maneja como string.
ObjectIdStr = Annotated[str, BeforeValidator(str)]


class UserRole(StrEnum):
    ESTUDIANTE = "estudiante"
    DOCENTE = "docente"


class UserInDB(BaseModel):
    id: ObjectIdStr = Field(alias="_id")
    name: str
    email: EmailStr
    password_hash: str
    role: UserRole
    created_at: datetime
