"""DTOs internos para componer el PDF del portafolio (RF-07 / CU-04).

No son documentos de MongoDB: Export Service no es dueño de ninguna colección. El router los
ensambla a partir de `projects`, `versions`, `feedback`, Blob Storage y Auth Service, y así
`core/pdf_builder.py` queda desacoplado de todos ellos (se prueba con datos planos).
"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class FileKind(StrEnum):
    IMAGE = "image"  # JPG/PNG: se embebe en el PDF
    DOCUMENT = "document"  # PDF/SVG: solo se lista el nombre del archivo


class ProjectData(BaseModel):
    id: str
    title: str
    description: str
    # Proyectos por grupos: nombre del grupo del estudiante y nombres de sus integrantes.
    group_name: str | None = None
    group_members: list[str] = []


class FeedbackData(BaseModel):
    teacher_name: str
    comment: str
    # None en un comentario sin calificación (Feedback admite varios comentarios por versión y una
    # sola calificación parcial vigente; las reemplazadas llegan con `score_replaced=True`).
    score: float | None = None
    score_replaced: bool = False
    is_final: bool = False
    created_at: datetime


class VersionWithFeedback(BaseModel):
    number: int  # posición cronológica dentro del hilo del estudiante, desde 1
    description: str
    uploaded_at: datetime
    file_name: str
    file_kind: FileKind
    # Bytes de la imagen descargada de Blob Storage; None si es un documento o si el archivo
    # ya no está disponible (en ese caso el PDF muestra "Archivo no disponible").
    image_data: bytes | None = None
    feedback: list[FeedbackData] = []  # en orden cronológico
    # Proyectos por grupos: integrante que subió la versión.
    uploaded_by: str | None = None


class PortfolioOptions(BaseModel):
    """Qué incluye el portafolio académico del estudiante (lo elige él)."""

    include_feedback: bool = True  # comentarios del docente
    include_grades: bool = True  # calificaciones parciales vigentes y final
    include_images: bool = True  # imágenes incrustadas (sin ellas el PDF pesa mucho menos)


class ProjectPortfolio(BaseModel):
    project: ProjectData
    versions: list[VersionWithFeedback] = []


class CoursePortfolio(BaseModel):
    name: str
    projects: list[ProjectPortfolio] = []
