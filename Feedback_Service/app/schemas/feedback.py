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
    score: Score


class FinalGradeCreateRequest(FeedbackCreateRequest):
    version_id: str


class FeedbackResponse(BaseModel):
    id: str
    version_id: str
    project_id: str
    student_id: str
    teacher_id: str
    comment: str
    score: float
    is_final: bool
    created_at: datetime
