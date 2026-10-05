"""Cliente HTTP de Auth Service.

Este servicio nunca lee la colección `users`: los nombres a mostrar se resuelven con
`GET /api/v1/users/batch` de Auth Service (RNF-06, minimización de datos).
"""

import logging

import httpx
from pydantic import BaseModel, TypeAdapter

from app.core.config import get_settings

logger = logging.getLogger(__name__)

BATCH_MAX_IDS = 100  # límite de ids por llamada que acepta Auth Service
TIMEOUT_SECONDS = 5.0


class UserPublic(BaseModel):
    id: str
    name: str


_users_adapter = TypeAdapter(list[UserPublic])


async def fetch_user_names(user_ids: list[str], token: str) -> dict[str, str]:
    """Retorna `{user_id: name}` consultando Auth Service con el JWT del usuario actual.

    Si Auth Service falla, registra un warning y retorna lo que haya podido resolver (o nada):
    quien llama debe degradar mostrando el nombre como `None`, nunca fallar por esto.
    Los ids inexistentes simplemente no aparecen en el resultado.
    """
    names: dict[str, str] = {}
    if not user_ids:
        return names
    settings = get_settings()
    try:
        async with httpx.AsyncClient(
            base_url=settings.auth_service_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=TIMEOUT_SECONDS,
        ) as client:
            for start in range(0, len(user_ids), BATCH_MAX_IDS):
                chunk = user_ids[start : start + BATCH_MAX_IDS]
                response = await client.get("/api/v1/users/batch", params={"ids": ",".join(chunk)})
                response.raise_for_status()
                users = _users_adapter.validate_json(response.content)
                names.update({user.id: user.name for user in users})
    except (httpx.HTTPError, ValueError) as exc:
        # ValueError cubre JSON inválido y respuestas que no cumplen el contrato (pydantic).
        logger.warning("No se pudieron resolver nombres en Auth Service: %r", exc)
    return names
