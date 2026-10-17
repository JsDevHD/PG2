"""RF-07 / CU-04 — Exportar portafolio en PDF.

Export Service no es dueño de ninguna colección: lee (read-only) `courses`, `projects`, `groups`
y `versions` de Projects Service y `feedback` de Feedback Service, descarga las imágenes de Blob
Storage y resuelve nombres en Auth Service. El PDF se genera en cada petición y se entrega en la
respuesta; no se persiste.
"""

import asyncio
import logging
import re
import unicodedata

from bson import ObjectId
from fastapi import APIRouter, Depends, Query, Response
from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.api.deps import CurrentUser, get_current_user, get_db
from app.core.auth_client import fetch_user_names
from app.core.pdf_builder import build_portfolio_pdf
from app.core.portfolio import UNKNOWN_NAME, load_thread, portfolio_versions, project_data
from app.core.security import oauth2_scheme
from app.exceptions import ForbiddenError, NotFoundError, UnprocessableEntityError

logger = logging.getLogger(__name__)

router = APIRouter()

PDF_MEDIA_TYPE = "application/pdf"


async def find_by_id(collection: AsyncIOMotorCollection, doc_id: str, not_found: str) -> dict:
    if not ObjectId.is_valid(doc_id):
        raise NotFoundError(not_found)
    document = await collection.find_one({"_id": ObjectId(doc_id)})
    if document is None:
        raise NotFoundError(not_found)
    return document


def _resolve_student_id(
    current_user: CurrentUser, requested_student_id: str | None, course: dict
) -> str:
    """Estudiante cuyo portafolio se exporta, verificando pertenencia al curso (H-6)."""
    enrolled = course.get("student_ids", [])
    if current_user.role == "estudiante":
        # El student_id recibido se ignora: un estudiante solo puede exportar lo suyo.
        if current_user.id not in enrolled:
            raise ForbiddenError()
        return current_user.id
    if course["teacher_id"] != current_user.id:
        raise ForbiddenError()
    if requested_student_id not in enrolled:
        raise ForbiddenError("El estudiante no pertenece al curso de este proyecto")
    return requested_student_id


def slug(value: str) -> str:
    """Fragmento ASCII seguro para el nombre del archivo (sin tildes, espacios ni comillas)."""
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9]+", "_", ascii_value).strip("_") or "sin_nombre"


def pdf_response(pdf: bytes, filename: str) -> Response:
    return Response(
        content=pdf,
        media_type=PDF_MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # Contiene datos personales y calificaciones: que ningún intermediario lo cachee.
            "Cache-Control": "no-store",
        },
    )


@router.get(
    "/{project_id}/export",
    response_class=Response,
    responses={200: {"content": {PDF_MEDIA_TYPE: {}}, "description": "Portafolio en PDF"}},
)
async def export_portfolio(
    project_id: str,
    student_id: str | None = Query(
        default=None, description="Obligatorio para docentes; se ignora para estudiantes"
    ),
    current_user: CurrentUser = Depends(get_current_user),
    token: str = Depends(oauth2_scheme),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Response:
    """Genera y entrega el portafolio en PDF de un estudiante en un proyecto. En proyectos por
    grupos incluye las versiones de su grupo y solo su propia calificación final."""
    if current_user.role == "docente" and not student_id:
        raise UnprocessableEntityError("El parámetro student_id es obligatorio para docentes")

    project = await find_by_id(db.projects, project_id, "Proyecto no encontrado")
    if project.get("hidden") and current_user.role == "estudiante":
        # Un proyecto oculto no existe para el estudiante (mismo criterio que Projects Service).
        raise NotFoundError("Proyecto no encontrado")
    course = await find_by_id(db.courses, project["course_id"], "Curso no encontrado")
    effective_student_id = _resolve_student_id(current_user, student_id, course)

    thread = await load_thread(db, project, effective_student_id)
    names = await fetch_user_names(thread.user_ids(), token)
    versions = await portfolio_versions(thread, names)

    student_name = names.get(effective_student_id, UNKNOWN_NAME)
    # ReportLab es CPU-bound: se ejecuta en un hilo para no bloquear el event loop.
    pdf = await asyncio.to_thread(
        build_portfolio_pdf, project_data(thread, names), versions, student_name, course["name"]
    )
    logger.info(
        "Portafolio exportado: proyecto=%s estudiante=%s versiones=%d",
        project_id,
        effective_student_id,
        len(versions),
    )
    return pdf_response(pdf, f"portafolio_{slug(project['title'])}_{slug(student_name)}.pdf")
