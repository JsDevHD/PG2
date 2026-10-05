"""Cliente MongoDB (Motor) compartido por todo el servicio.

El ciclo de vida está atado al `lifespan` de FastAPI definido en `app/main.py`.
"""

import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class MongoDB:
    client: AsyncIOMotorClient | None = None
    db: AsyncIOMotorDatabase | None = None


mongodb = MongoDB()


async def connect_to_mongo() -> None:
    # Motor conecta de forma perezosa: la conexión real se abre en la primera operación.
    settings = get_settings()
    mongodb.client = AsyncIOMotorClient(settings.mongodb_uri)
    mongodb.db = mongodb.client[settings.mongodb_db_name]
    logger.info("Cliente MongoDB inicializado (base de datos: %s)", settings.mongodb_db_name)


async def close_mongo_connection() -> None:
    if mongodb.client is not None:
        mongodb.client.close()
        logger.info("Conexión a MongoDB cerrada")
    mongodb.client = None
    mongodb.db = None


def get_db() -> AsyncIOMotorDatabase:
    if mongodb.db is None:
        raise RuntimeError("MongoDB no está inicializado; ¿se ejecutó el lifespan de la app?")
    return mongodb.db
