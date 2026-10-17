"""Router raíz de la API v1, montado en `app/main.py` bajo el prefijo `/api/v1`.

Cada microservicio registra aquí sus routers de negocio, por ejemplo:

    from app.api.v1 import projects
    api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
"""

from fastapi import APIRouter

from app.api.v1 import export, portfolio

api_router = APIRouter()
api_router.include_router(export.router, prefix="/projects", tags=["export"])
api_router.include_router(portfolio.router, prefix="/portfolio", tags=["portfolio"])
