"""Lectura de archivos de versiones desde Azure Blob Storage.

Projects Service sube los archivos al contenedor; Export Service solo los descarga para
embeberlos en el PDF. Nunca escribe ni borra blobs.
"""

import asyncio
import logging
import re
from functools import lru_cache
from pathlib import PurePosixPath
from urllib.parse import unquote, urlparse

from azure.core.exceptions import AzureError
from azure.storage.blob import BlobServiceClient, ContainerClient

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Projects Service guarda los blobs como `{uuid}_{nombre original}`; el prefijo no se muestra.
_UUID_PREFIX = re.compile(r"^[0-9a-fA-F]{8}-?(?:[0-9a-fA-F]{4}-?){3}[0-9a-fA-F]{12}_")

# Sin reintentos: la política por defecto espera ~20 s por archivo cuando Blob no responde, y
# un archivo que no llega se reemplaza por una nota en el PDF en lugar de abortar la exportación.
_RETRY_TOTAL = 0
_CONNECTION_TIMEOUT_SECONDS = 5


@lru_cache
def _get_container_client() -> ContainerClient:
    # Instancia única (mismo patrón que el cliente de Motor del template).
    settings = get_settings()
    service = BlobServiceClient.from_connection_string(
        settings.azure_storage_connection_string,
        retry_total=_RETRY_TOTAL,
        connection_timeout=_CONNECTION_TIMEOUT_SECONDS,
    )
    return service.get_container_client(settings.azure_storage_container)


def blob_name_from_url(file_url: str, container: str) -> str:
    """Nombre del blob dentro del contenedor a partir de `versions.file_url`.

    Acepta la URL completa del blob (Azure: `https://<cuenta>.blob.core.windows.net/<contenedor>/
    <blob>`; Azurite: `http://127.0.0.1:10000/<cuenta>/<contenedor>/<blob>`) o directamente el
    nombre del blob. La lectura siempre ocurre en el contenedor configurado.
    """
    if "://" not in file_url:
        return file_url.lstrip("/")
    segments = [segment for segment in unquote(urlparse(file_url).path).split("/") if segment]
    if container in segments:
        segments = segments[segments.index(container) + 1 :]
    return "/".join(segments)


def display_file_name(file_url: str) -> str:
    """Nombre original del archivo, sin la ruta ni el prefijo uuid que agrega Projects Service."""
    name = PurePosixPath(unquote(urlparse(file_url).path) or file_url).name
    return _UUID_PREFIX.sub("", name) or name


def _download_sync(blob_name: str) -> bytes:
    return _get_container_client().download_blob(blob_name).readall()


async def download_file(file_url: str) -> bytes | None:
    """Descarga el archivo referenciado por `file_url`.

    Retorna None si ya no está disponible (o Blob Storage no responde): la exportación no se
    aborta por un archivo faltante, el PDF muestra "Archivo no disponible" en su lugar.
    """
    blob_name = blob_name_from_url(file_url, get_settings().azure_storage_container)
    try:
        # El SDK síncrono corre en un hilo para no bloquear el event loop.
        return await asyncio.to_thread(_download_sync, blob_name)
    except (AzureError, ValueError) as exc:  # ValueError: cadena de conexión mal formada
        logger.warning("No se pudo descargar el blob '%s': %s", blob_name, exc)
        return None
