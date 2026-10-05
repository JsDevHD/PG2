"""Vistas de solo lectura de las colecciones de Projects Service (`versions`, `projects`,
`courses`).

Feedback Service nunca escribe en ellas. Cada vista declara solo los campos que este servicio
necesita para validar existencia y titularidad (H-6); el resto del documento se ignora. Las
referencias se leen como `ObjectIdStr` para tolerar que se guarden como ObjectId o como string.
"""

from pydantic import BaseModel, Field

from app.models.common import ObjectIdStr


class VersionView(BaseModel):
    id: ObjectIdStr = Field(alias="_id")
    project_id: ObjectIdStr
    student_id: ObjectIdStr


class ProjectView(BaseModel):
    id: ObjectIdStr = Field(alias="_id")
    course_id: ObjectIdStr


class CourseView(BaseModel):
    id: ObjectIdStr = Field(alias="_id")
    teacher_id: ObjectIdStr
    student_ids: list[ObjectIdStr] = []
