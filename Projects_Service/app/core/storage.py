"""Almacenamiento de los archivos de cada versión en Azure Blob Storage.

El cliente se crea una sola vez en el `lifespan` de `app/main.py` (mismo patrón que Motor en
`app/db/mongodb.py`); los routers solo usan `validate_file` y `upload_file`.
"""

import contextlib
import logging
import uuid
from pathlib import PurePosixPath

from azure.core.exceptions import AzureError, ResourceExistsError
from azure.storage.blob import ContentSettings
from azure.storage.blob.aio import BlobServiceClient, ContainerClient
from fastapi import UploadFile

from app.core.config import get_settings
from app.exceptions import ServiceUnavailableError, ValidationError

logger = logging.getLogger(__name__)

# RNF-05: formatos aceptados para una versión.
ALLOWED_CONTENT_TYPES = frozenset({"image/jpeg", "image/png", "application/pdf", "image/svg+xml"})


class BlobStorage:
    client: BlobServiceClient | None = None
    # El contenedor se crea (si falta) en la primera subida del proceso; ver `_ensure_container`.
    container_ready: bool = False


storage = BlobStorage()


def connect_to_storage() -> None:
    # Solo interpreta la cadena de conexión: la primera conexión real se abre al subir un archivo.
    settings = get_settings()
    storage.client = BlobServiceClient.from_connection_string(
        settings.azure_storage_connection_string
    )
    logger.info(
        "Cliente de Blob Storage inicializado (contenedor: %s)", settings.azure_storage_container
    )


async def close_storage_connection() -> None:
    if storage.client is not None:
        await storage.client.close()
        logger.info("Cliente de Blob Storage cerrado")
    storage.client = None
    storage.container_ready = False


def get_container_client() -> ContainerClient:
    if storage.client is None:
        raise RuntimeError("Blob Storage no está inicializado; ¿se ejecutó el lifespan de la app?")
    return storage.client.get_container_client(get_settings().azure_storage_container)


def _content_type(file: UploadFile) -> str:
    # Descarta parámetros como "; charset=utf-8" para comparar solo el tipo MIME.
    return (file.content_type or "").split(";")[0].strip().lower()


def _safe_filename(filename: str | None) -> str:
    # Solo el nombre base: un nombre como "../../x.png" no debe alterar la ruta del blob.
    name = PurePosixPath((filename or "").replace("\\", "/")).name
    return name or "archivo"


def validate_file(file: UploadFile) -> None:
    """Lanza ValidationError (422) si el formato o tamaño no cumplen RNF-05."""
    if _content_type(file) not in ALLOWED_CONTENT_TYPES:
        raise ValidationError(
            "Formato de archivo no permitido. Formatos aceptados: JPG, PNG, PDF y SVG"
        )
    max_mb = get_settings().max_file_size_mb
    size = file.size or 0  # FastAPI calcula `size` al leer el multipart
    if size == 0:
        raise ValidationError("El archivo está vacío")
    if size > max_mb * 1024 * 1024:
        raise ValidationError(f"El archivo supera el tamaño máximo permitido de {max_mb} MB")


async def _ensure_container(container: ContainerClient) -> None:
    # En Azure el contenedor normalmente ya existe; en local (Azurite) arranca vacío.
    if storage.container_ready:
        return
    with contextlib.suppress(ResourceExistsError):
        await container.create_container()
    storage.container_ready = True


async def upload_file(file: UploadFile, project_id: str, student_id: str) -> str:
    """Sube el archivo a Blob Storage bajo la ruta
    versions/{project_id}/{student_id}/{uuid}_{filename} y retorna la URL pública."""
    blob_name = (
        f"versions/{project_id}/{student_id}/{uuid.uuid4().hex}_{_safe_filename(file.filename)}"
    )
    container = get_container_client()
    blob = container.get_blob_client(blob_name)
    try:
        await _ensure_container(container)
        await file.seek(0)
        # overwrite=False: una versión subida nunca se reemplaza (RNF-08).
        await blob.upload_blob(
            await file.read(),
            overwrite=False,
            content_settings=ContentSettings(content_type=_content_type(file)),
        )
    except AzureError as exc:
        logger.exception("Error al subir %s a Blob Storage", blob_name)
        raise ServiceUnavailableError(
            "No fue posible almacenar el archivo; intente de nuevo más tarde"
        ) from exc
    return blob.url
