"""Respuestas de RF-08: progreso = (versiones con retroalimentación / total de versiones) × 100."""

from pydantic import BaseModel


class ProgressStats(BaseModel):
    versions_count: int
    versions_with_feedback: int
    progress_percentage: float


class StudentProgressResponse(ProgressStats):
    """Vista del estudiante matriculado: solo su propio progreso en el curso."""

    course_id: str
    student_id: str


class StudentProgressItem(ProgressStats):
    student_id: str
    student_name: str | None  # None si Auth Service no respondió (degradación, sección 8)


class CourseProgressResponse(ProgressStats):
    """Vista del docente titular: totales del curso y desglose por estudiante."""

    course_id: str
    students: list[StudentProgressItem]
