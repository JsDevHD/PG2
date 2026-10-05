from pydantic import BaseModel, Field

from app.models.common import ObjectIdStr, UTCDatetime


class ProjectInDB(BaseModel):
    """Documento de la colección `projects`. Índice: `course_id` (no único)."""

    id: ObjectIdStr = Field(alias="_id")
    course_id: str
    title: str
    description: str
    # teacher_id; redundante con courses.teacher_id pero explícito para trazabilidad.
    created_by: str
    created_at: UTCDatetime
