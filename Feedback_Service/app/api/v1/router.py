"""Router raíz de la API v1, montado en `app/main.py` bajo el prefijo `/api/v1`."""

from fastapi import APIRouter

from app.api.v1 import feedback

api_router = APIRouter()
api_router.include_router(feedback.router)
