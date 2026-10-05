"""Documento de la colección `feedback` (escrita exclusivamente por Feedback Service)."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.common import ObjectIdStr

MIN_SCORE = 0.0
MAX_SCORE = 5.0


class FeedbackInDB(BaseModel):
    id: ObjectIdStr = Field(alias="_id")
    version_id: str
    # `project_id` y `student_id` se copian de la versión al crear el registro. Las versiones son
    # inmutables (RNF-08), así que no pueden desincronizarse; permiten consultar por proyecto y
    # hacer cumplir en la base "una calificación final por estudiante y proyecto" (RF-09).
    project_id: str
    student_id: str
    teacher_id: str
    comment: str
    score: float = Field(ge=MIN_SCORE, le=MAX_SCORE)
    is_final: bool = False  # True únicamente en el registro de calificación final (RF-09)
    created_at: datetime
