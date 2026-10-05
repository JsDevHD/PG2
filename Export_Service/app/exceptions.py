"""Excepciones de dominio y su handler global.

Los servicios lanzan estas excepciones desde la lógica de negocio; el handler las traduce
al formato de error común a los cuatro microservicios: `{"detail": "..."}`.

    raise NotFoundError("Proyecto no encontrado")
"""

from fastapi import Request
from fastapi.responses import JSONResponse


class DomainError(Exception):
    status_code: int = 400
    detail: str = "Error de dominio"

    def __init__(self, detail: str | None = None) -> None:
        if detail is not None:
            self.detail = detail
        super().__init__(self.detail)


class NotFoundError(DomainError):
    status_code = 404
    detail = "Recurso no encontrado"


class ForbiddenError(DomainError):
    # Casos de H-6: rol correcto pero sin pertenencia al curso/proyecto.
    status_code = 403
    detail = "No tiene permisos sobre este recurso"


class ConflictError(DomainError):
    status_code = 409
    detail = "El recurso entra en conflicto con uno existente"


class UnprocessableEntityError(DomainError):
    # Petición bien formada pero incompleta según la regla de negocio (p. ej. falta un parámetro
    # que solo es obligatorio para cierto rol).
    status_code = 422
    detail = "La petición no se puede procesar"


async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
