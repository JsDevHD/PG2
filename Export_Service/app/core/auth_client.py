"""Cliente HTTP de `GET /api/v1/users/batch` de Auth Service.

Es la única vía para obtener nombres de usuario: ningún servicio distinto de Auth lee la
colección `users` (RNF-06, minimización de datos).
"""

import logging
from collections.abc import Iterable

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 5.0


async def fetch_user_names(user_ids: Iterable[str], token: str) -> dict[str, str]:
    """Resuelve `{id: nombre}` reenviando el JWT de quien hace la petición.

    Los ids desconocidos simplemente no aparecen en el resultado. Si Auth Service falla, se
    degrada a `{}` y se loguea un warning (mismo criterio que Projects Service): el PDF se
    genera igual con un nombre de reemplazo, porque las evidencias importan más que el nombre.
    """
    ids = list(dict.fromkeys(user_ids))  # únicos, conservando el orden
    if not ids:
        return {}
    url = f"{get_settings().auth_service_url.rstrip('/')}/api/v1/users/batch"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            response = await client.get(
                url,
                params={"ids": ",".join(ids)},
                headers={"Authorization": f"Bearer {token}"},
            )
            response.raise_for_status()
            return {user["id"]: user["name"] for user in response.json()}
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        # ValueError/KeyError/TypeError: respuesta que no es la lista JSON esperada.
        # %r: algunos errores de httpx (p. ej. ConnectError) tienen str() vacío.
        logger.warning("No se pudieron resolver nombres en Auth Service: %r", exc)
        return {}
