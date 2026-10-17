"""Router raíz de la API v1, montado en `app/main.py` bajo el prefijo `/api/v1`.

Cada microservicio registra aquí sus routers de negocio, por ejemplo:

    from app.api.v1 import projects
    api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
"""

from fastapi import APIRouter

from app.api.v1 import courses, groups, progress, projects, versions

api_router = APIRouter()
api_router.include_router(courses.router, prefix="/courses", tags=["courses"])
api_router.include_router(progress.router, prefix="/courses", tags=["progress"])
api_router.include_router(versions.router, prefix="/projects", tags=["versions"])
api_router.include_router(groups.router, prefix="/projects", tags=["groups"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
