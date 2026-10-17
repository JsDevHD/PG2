from pydantic import BaseModel, Field

from app.models.common import ObjectIdStr, UTCDatetime


class VersionInDB(BaseModel):
    """Documento de la colección `versions`.

    Índice compuesto `(project_id, student_id, uploaded_at)`: sirve tanto al historial completo
    de un proyecto (docente) como al de un estudiante dentro de ese proyecto. En proyectos por
    grupos, el índice `(project_id, group_id, uploaded_at)` sirve al historial del grupo.
    """

    id: ObjectIdStr = Field(alias="_id")
    project_id: str
    # Autor de la subida. En proyectos por grupos, el integrante que la subió.
    student_id: str
    # Grupo dueño de la versión en proyectos por grupos; None en proyectos individuales.
    group_id: str | None = None
    file_url: str  # ruta en Azure Blob Storage
    description: str
    uploaded_at: UTCDatetime
