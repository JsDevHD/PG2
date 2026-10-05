"""Índices de MongoDB, creados en el lifespan de arranque. `create_index` es idempotente."""

import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def init_indexes(db: AsyncIOMotorDatabase) -> None:
    # Hace cumplir "el correo es único" en la base: la validación en la aplicación no basta
    # frente a dos registros concurrentes con el mismo correo.
    await db.users.create_index("email", unique=True)
    logger.info("Índices de MongoDB verificados")
