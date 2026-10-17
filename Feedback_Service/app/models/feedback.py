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
    # Grupo de la versión en proyectos por grupos (copiado de la versión); None si es individual.
    # En una calificación final, `student_id` es el estudiante calificado, que en un proyecto por
    # grupos puede no ser quien subió la versión.
    group_id: str | None = None
    teacher_id: str
    comment: str
    # `None` en un comentario sin calificación. Una versión tiene a lo sumo una calificación
    # parcial vigente; las anteriores se conservan con `score_replaced=True` (nada se borra,
    # RNF-08).
    score: float | None = Field(default=None, ge=MIN_SCORE, le=MAX_SCORE)
    score_replaced: bool = False
    is_final: bool = False  # True únicamente en el registro de calificación final (RF-09)
    created_at: datetime
