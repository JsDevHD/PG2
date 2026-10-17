"""Portafolio académico del estudiante: un solo PDF con los cursos y proyectos que elija.

Es exclusivo del estudiante y solo de lo suyo: cada proyecto pedido debe ser de un curso en el que
esté matriculado (H-6). Elige además si incluye los comentarios del docente, las calificaciones y
las imágenes. El documento se genera en cada petición y no se guarda.
"""

import asyncio
import logging

from bson import ObjectId
from fastapi import APIRouter, Depends, Response
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import Field

from app.api.deps import CurrentUser, get_current_user, get_db
from app.api.v1.export import PDF_MEDIA_TYPE, pdf_response, slug
from app.core.auth_client import fetch_user_names
from app.core.pdf_builder import build_student_portfolio_pdf
from app.core.portfolio import (
    MAX_PARALLEL_DOWNLOADS,
    UNKNOWN_NAME,
    load_thread,
    portfolio_versions,
    project_data,
)
from app.core.security import oauth2_scheme
from app.exceptions import ForbiddenError, NotFoundError
from app.schemas.export import CoursePortfolio, PortfolioOptions, ProjectPortfolio

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_PROJECTS = 100
STUDENTS_ONLY = "El portafolio académico es exclusivo de los estudiantes"


class PortfolioExportRequest(PortfolioOptions):
    # Proyectos a incluir. "Un curso" o "todos los cursos" se resuelven en el frontend a sus
    # proyectos: el backend recibe siempre la lista explícita y verifica cada uno.
    project_ids: list[str] = Field(min_length=1, max_length=MAX_PROJECTS)


async def _select(
    db: AsyncIOMotorDatabase, project_ids: list[str], student_id: str
) -> list[tuple[dict, list[dict]]]:
    """Proyectos verificados (404 si alguno no existe, 403 si alguno no es de sus cursos),
    agrupados por curso: cursos por nombre y proyectos en orden de creación."""
    unique_ids = list(dict.fromkeys(project_ids))
    if not all(ObjectId.is_valid(pid) for pid in unique_ids):
        raise NotFoundError("Proyecto no encontrado")
    projects = await db.projects.find({"_id": {"$in": [ObjectId(p) for p in unique_ids]}}).to_list(
        None
    )
    # Un proyecto oculto por el docente no existe para el estudiante.
    if len(projects) != len(unique_ids) or any(p.get("hidden") for p in projects):
        raise NotFoundError("Proyecto no encontrado")
    course_ids = list(dict.fromkeys(p["course_id"] for p in projects))
    courses = await db.courses.find(
        {"_id": {"$in": [ObjectId(c) for c in course_ids if ObjectId.is_valid(c)]}}
    ).to_list(None)
    courses_by_id = {str(c["_id"]): c for c in courses}
    for course_id in course_ids:
        course = courses_by_id.get(course_id)
        if course is None or student_id not in course.get("student_ids", []):
            raise ForbiddenError("Solo puedes exportar proyectos de tus cursos")

    by_course: dict[str, list[dict]] = {}
    for project in sorted(projects, key=lambda p: (p["created_at"], str(p["_id"]))):
        by_course.setdefault(project["course_id"], []).append(project)
    ordered = sorted(by_course.items(), key=lambda item: courses_by_id[item[0]]["name"].lower())
    return [(courses_by_id[cid], items) for cid, items in ordered]


@router.post(
    "/export",
    response_class=Response,
    responses={200: {"content": {PDF_MEDIA_TYPE: {}}, "description": "Portafolio académico"}},
)
async def export_student_portfolio(
    body: PortfolioExportRequest,
    current_user: CurrentUser = Depends(get_current_user),
    token: str = Depends(oauth2_scheme),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Response:
    """Genera el portafolio académico con los proyectos elegidos, agrupados por curso."""
    if current_user.role != "estudiante":
        raise ForbiddenError(STUDENTS_ONLY)
    selection = await _select(db, body.project_ids, current_user.id)

    threads = [
        (course, [await load_thread(db, project, current_user.id) for project in projects])
        for course, projects in selection
    ]
    user_ids = [current_user.id] + [
        uid for _, course_threads in threads for t in course_threads for uid in t.user_ids()
    ]
    names = await fetch_user_names(user_ids, token)
    downloads = asyncio.Semaphore(MAX_PARALLEL_DOWNLOADS)

    courses: list[CoursePortfolio] = []
    for course, course_threads in threads:
        projects = [
            ProjectPortfolio(
                project=project_data(thread, names),
                versions=await portfolio_versions(
                    thread, names, include_images=body.include_images, downloads=downloads
                ),
            )
            for thread in course_threads
        ]
        courses.append(CoursePortfolio(name=course["name"], projects=projects))

    student_name = names.get(current_user.id, UNKNOWN_NAME)
    options = PortfolioOptions.model_validate(body.model_dump(exclude={"project_ids"}))
    pdf = await asyncio.to_thread(build_student_portfolio_pdf, student_name, courses, options)
    logger.info(
        "Portafolio académico exportado: estudiante=%s proyectos=%d",
        current_user.id,
        sum(len(c.projects) for c in courses),
    )
    return pdf_response(pdf, f"portafolio_academico_{slug(student_name)}.pdf")
