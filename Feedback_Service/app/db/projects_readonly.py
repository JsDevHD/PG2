"""Lecturas directas (read-only) a las colecciones de Projects Service.

Es el único módulo del servicio que toca `versions`, `projects` y `courses`, y nunca escribe en
ellas. Un id con formato inválido se trata igual que uno inexistente: retorna `None`.
"""

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.models.projects import CourseView, ProjectView, VersionView


async def _find_by_id(collection: AsyncIOMotorCollection, doc_id: str) -> dict | None:
    if not ObjectId.is_valid(doc_id):
        return None
    return await collection.find_one({"_id": ObjectId(doc_id)})


async def get_version(db: AsyncIOMotorDatabase, version_id: str) -> VersionView | None:
    document = await _find_by_id(db.versions, version_id)
    return VersionView.model_validate(document) if document else None


async def get_project(db: AsyncIOMotorDatabase, project_id: str) -> ProjectView | None:
    document = await _find_by_id(db.projects, project_id)
    return ProjectView.model_validate(document) if document else None


async def get_course(db: AsyncIOMotorDatabase, course_id: str) -> CourseView | None:
    document = await _find_by_id(db.courses, course_id)
    return CourseView.model_validate(document) if document else None
