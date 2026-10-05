import os

# Deben definirse antes de importar la app: `get_settings()` se evalúa al importar app.main.
# Las variables de entorno tienen prioridad sobre el `.env` local.
os.environ["SERVICE_NAME"] = "service-template"
os.environ["MONGODB_DB_NAME"] = "graphic_tracker_test"
os.environ["JWT_SECRET_KEY"] = "test-secret-key"
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

from collections.abc import AsyncIterator

import httpx
import pytest
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.mongodb import get_db
from app.main import app, lifespan


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    # ASGITransport no dispara el lifespan, así que se ejecuta manualmente.
    async with lifespan(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


async def _clear_collections(db: AsyncIOMotorDatabase) -> None:
    # Se vacían (no se eliminan) para conservar los índices creados al arrancar el servicio.
    for name in await db.list_collection_names():
        if not name.startswith("system."):
            await db[name].delete_many({})


@pytest.fixture
async def test_db(client: httpx.AsyncClient) -> AsyncIterator[AsyncIOMotorDatabase]:
    """Base de datos de test, vacía antes y después de cada test. Requiere MongoDB activo."""
    db = get_db()
    assert db.name.endswith("_test"), f"test_db se negó a limpiar la base '{db.name}'"
    await _clear_collections(db)
    yield db
    await _clear_collections(db)
