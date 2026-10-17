from pydantic import BaseModel, Field

from app.models.common import ObjectIdStr, UTCDatetime


class GroupInDB(BaseModel):
    """Documento de la colección `groups`: un grupo de estudiantes en un proyecto por grupos.

    Índice único `(project_id, member_ids)` (multikey): un estudiante pertenece a lo sumo a un
    grupo por proyecto, aunque dos peticiones lleguen a la vez.
    """

    id: ObjectIdStr = Field(alias="_id")
    project_id: str
    course_id: str
    name: str
    member_ids: list[str]  # referencias a users._id, en orden de llegada
    created_by: str
    created_at: UTCDatetime
