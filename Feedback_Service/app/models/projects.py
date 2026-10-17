"""Vistas de solo lectura de las colecciones de Projects Service (`versions`, `projects`,
`courses`, `groups`).

Feedback Service nunca escribe en ellas. Cada vista declara solo los campos que este servicio
necesita para validar existencia, titularidad (H-6) y la forma de calificar; el resto del
documento se ignora. Las referencias se leen como `ObjectIdStr` para tolerar que se guarden como
ObjectId o como string.
"""

from typing import Literal

from pydantic import BaseModel, Field

from app.models.common import ObjectIdStr


class VersionView(BaseModel):
    id: ObjectIdStr = Field(alias="_id")
    project_id: ObjectIdStr
    student_id: ObjectIdStr  # autor de la subida
    # Grupo dueño de la versión en proyectos por grupos. `str | None` y no `ObjectIdStr | None`:
    # el validador de ObjectIdStr convertiría None en el texto "None".
    group_id: str | None = None


class ProjectView(BaseModel):
    id: ObjectIdStr = Field(alias="_id")
    course_id: ObjectIdStr
    # Proyectos creados antes de los grupos no tienen estos campos: son individuales.
    work_mode: Literal["individual", "group"] = "individual"
    grading_mode: Literal["individual", "group"] = "individual"
    # Oculto por el docente: para el estudiante no existe (404).
    hidden: bool = False


class CourseView(BaseModel):
    id: ObjectIdStr = Field(alias="_id")
    teacher_id: ObjectIdStr
    student_ids: list[ObjectIdStr] = []


class GroupView(BaseModel):
    id: ObjectIdStr = Field(alias="_id")
    project_id: ObjectIdStr
    member_ids: list[ObjectIdStr] = []
