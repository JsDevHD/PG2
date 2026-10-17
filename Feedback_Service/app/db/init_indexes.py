"""Índices de MongoDB, creados en el lifespan de arranque. `create_index` es idempotente."""

import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

# Calificación parcial vigente de una versión: con nota, no final y no reemplazada.
CURRENT_PARTIAL_GRADE = {"is_final": False, "score_replaced": False, "score": {"$type": "number"}}


async def _migrate_partial_grades(db: AsyncIOMotorDatabase) -> None:
    """Datos previos a "una calificación parcial vigente por versión": se deja vigente solo la
    más reciente de cada versión y las anteriores quedan con `score_replaced=True`. Idempotente."""
    legacy = {"is_final": False, "score": {"$type": "number"}, "score_replaced": {"$ne": True}}
    pipeline = [
        {"$match": legacy},
        {"$sort": {"created_at": 1, "_id": 1}},
        {"$group": {"_id": "$version_id", "ids": {"$push": "$_id"}}},
        {"$match": {"ids.1": {"$exists": True}}},  # versiones con más de una vigente
    ]
    replaced = 0
    async for group in db.feedback.aggregate(pipeline):
        result = await db.feedback.update_many(
            {"_id": {"$in": group["ids"][:-1]}}, {"$set": {"score_replaced": True}}
        )
        replaced += result.modified_count
    await db.feedback.update_many(
        {"score_replaced": {"$exists": False}}, {"$set": {"score_replaced": False}}
    )
    if replaced:
        logger.info("Migración: %d calificaciones parciales marcadas como reemplazadas", replaced)


async def init_indexes(db: AsyncIOMotorDatabase) -> None:
    # No único: una versión acumula varios comentarios a lo largo del tiempo.
    await db.feedback.create_index("version_id")
    # Historial por proyecto; el prefijo (project_id, student_id) sirve al filtro del estudiante.
    await db.feedback.create_index([("project_id", 1), ("student_id", 1), ("created_at", 1)])
    # Retroalimentación de un grupo (lo que ven sus integrantes) y su calificación final.
    await db.feedback.create_index("group_id")
    # Una sola calificación final por estudiante y proyecto (RF-09). Se hace cumplir en la base
    # porque dos peticiones simultáneas pasarían cualquier verificación previa en la aplicación.
    await db.feedback.create_index(
        [("project_id", 1), ("student_id", 1)],
        unique=True,
        partialFilterExpression={"is_final": True},
        name="unique_final_grade_per_student",
    )
    # Una sola calificación parcial vigente por versión (los comentarios sin nota no cuentan).
    await _migrate_partial_grades(db)
    await db.feedback.create_index(
        "version_id",
        unique=True,
        partialFilterExpression=CURRENT_PARTIAL_GRADE,
        name="unique_current_partial_grade",
    )
    logger.info("Índices de MongoDB verificados")
