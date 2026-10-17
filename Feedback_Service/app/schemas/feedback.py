from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.models.feedback import MAX_SCORE, MIN_SCORE

Comment = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]
# El redondeo a un decimal lo hace el frontend; aquí no se fuerza para no perder precisión en
# silencio.
Score = Annotated[float, Field(ge=MIN_SCORE, le=MAX_SCORE)]


class FeedbackCreateRequest(BaseModel):
    comment: Comment
    # Opcional: una versión admite varios comentarios, pero una sola calificación parcial vigente.
    # Enviar `score` cuando ya hay una la reemplaza (la anterior queda con `score_replaced=True`).
    score: Score | None = None


class FinalGradeCreateRequest(BaseModel):
    version_id: str
    comment: Comment
    score: Score  # obligatoria en la calificación final (RF-09)
    # Solo en proyectos por grupos con calificación individual: el integrante que se califica.
    # En proyectos individuales el estudiante sale de la versión, y en calificación grupal se
    # califica a todo el grupo, así que ahí se rechaza.
    student_id: str | None = None


class FeedbackResponse(BaseModel):
    id: str
    version_id: str
    project_id: str
    student_id: str
    group_id: str | None
    teacher_id: str
    comment: str
    # `None` en un comentario sin calificación.
    score: float | None
    # True si esta calificación parcial fue reemplazada por una posterior en la misma versión.
    score_replaced: bool
    is_final: bool
    created_at: datetime
