from pydantic import BaseModel, Field

from app.models.common import ObjectIdStr


class CourseInDB(BaseModel):
    """Documento de la colección `courses`. Índice: `course_code` único."""

    id: ObjectIdStr = Field(alias="_id")
    name: str
    course_code: str  # único, generado por el sistema (6 caracteres)
    teacher_id: str  # referencia a users._id (Auth Service)
    student_ids: list[str] = []  # referencias a users._id
