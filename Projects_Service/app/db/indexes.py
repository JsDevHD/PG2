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
    await db.versions.create_index(
        [("project_id", ASCENDING), ("group_id", ASCENDING), ("uploaded_at", ASCENDING)]
    )
    # Multikey: cada par (proyecto, integrante) solo puede aparecer en un grupo. Es quien hace
    # cumplir "un grupo por estudiante y proyecto" cuando dos peticiones llegan a la vez.
    await db.groups.create_index(
        [("project_id", ASCENDING), ("member_ids", ASCENDING)],
        unique=True,
        name="unique_group_member_per_project",
    )
    logger.info("Índices de courses, projects, versions y groups verificados")
