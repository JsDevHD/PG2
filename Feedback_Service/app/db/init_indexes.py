"""Índices de MongoDB, creados en el lifespan de arranque. `create_index` es idempotente."""

import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def init_indexes(db: AsyncIOMotorDatabase) -> None:
    # No único: una versión acumula varios comentarios a lo largo del tiempo.
    await db.feedback.create_index("version_id")
    # Historial por proyecto; el prefijo (project_id, student_id) sirve al filtro del estudiante.
    await db.feedback.create_index([("project_id", 1), ("student_id", 1), ("created_at", 1)])
    # Una sola calificación final por estudiante y proyecto (RF-09). Se hace cumplir en la base
    # porque dos peticiones simultáneas pasarían cualquier verificación previa en la aplicación.
    await db.feedback.create_index(
        [("project_id", 1), ("student_id", 1)],
        unique=True,
        partialFilterExpression={"is_final": True},
        name="unique_final_grade_per_student",
    )
    logger.info("Índices de MongoDB verificados")
