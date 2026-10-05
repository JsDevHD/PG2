"""Índices de las colecciones propias de este servicio, creados al arrancar (idempotente)."""

import logging

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING

logger = logging.getLogger(__name__)


async def create_indexes(db: AsyncIOMotorDatabase) -> None:
    # Hace cumplir en la base la unicidad del código aunque dos inserciones sean concurrentes.
    await db.courses.create_index("course_code", unique=True)
    await db.projects.create_index("course_id")
    await db.versions.create_index(
        [("project_id", ASCENDING), ("student_id", ASCENDING), ("uploaded_at", ASCENDING)]
    )
    logger.info("Índices de courses, projects y versions verificados")
