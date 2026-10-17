from typing import Literal

from pydantic import BaseModel, Field

from app.models.common import ObjectIdStr, UTCDatetime

WorkMode = Literal["individual", "group"]
GradingMode = Literal["individual", "group"]


class ProjectInDB(BaseModel):
    """Documento de la colección `projects`. Índice: `course_id` (no único).

    Los proyectos creados antes de los grupos no tienen los campos de grupo: se leen como
    individuales.
    """

    id: ObjectIdStr = Field(alias="_id")
    course_id: str
    title: str
    description: str
    # teacher_id; redundante con courses.teacher_id pero explícito para trazabilidad.
    created_by: str
    created_at: UTCDatetime
    # "group": los estudiantes forman grupos y las versiones son del grupo.
    work_mode: WorkMode = "individual"
    # Solo en proyectos por grupos: una calificación final por integrante ("individual") o una
    # sola para todo el grupo ("group"). Son excluyentes y se fijan al crear el proyecto.
    grading_mode: GradingMode = "individual"
    group_min_size: int | None = None
    group_max_size: int | None = None
    # Hasta cuándo los estudiantes pueden crear grupos, unirse o salir. Lo puede cambiar el docente.
    group_deadline: UTCDatetime | None = None
    # Oculto: los estudiantes no lo ven ni pueden trabajar en él (borrador o proyecto retirado).
    # Sus versiones y retroalimentación se conservan intactas.
    hidden: bool = False
    updated_at: UTCDatetime | None = None
