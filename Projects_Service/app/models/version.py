from pydantic import BaseModel, Field

from app.models.common import ObjectIdStr, UTCDatetime


class VersionInDB(BaseModel):
    """Documento de la colección `versions`.

    Índice compuesto `(project_id, student_id, uploaded_at)`: sirve tanto al historial completo
    de un proyecto (docente) como al de un estudiante dentro de ese proyecto.
    """

    id: ObjectIdStr = Field(alias="_id")
    project_id: str
    student_id: str
    file_url: str  # ruta en Azure Blob Storage
    description: str
    uploaded_at: UTCDatetime
