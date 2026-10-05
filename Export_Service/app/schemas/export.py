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


class FeedbackData(BaseModel):
    teacher_name: str
    comment: str
    score: float
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
