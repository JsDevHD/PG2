import os

# Deben definirse antes de importar la app: `get_settings()` se evalúa al importar app.main.
# Las variables de entorno tienen prioridad sobre el `.env` local.
os.environ["SERVICE_NAME"] = "export-service"
os.environ["MONGODB_DB_NAME"] = "graphic_tracker_test"
os.environ["JWT_SECRET_KEY"] = "test-secret-key"
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")
# Blob Storage y Auth Service nunca se contactan en los tests: se reemplazan con mocks.
os.environ["AZURE_STORAGE_CONNECTION_STRING"] = "UseDevelopmentStorage=true"
os.environ["AUTH_SERVICE_URL"] = "http://auth-service.test"

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


@pytest.fixture
def external_services(monkeypatch: pytest.MonkeyPatch) -> dict[str, list[str]]:
    """Mocks de Auth Service y Blob Storage; registra qué se les pidió."""
    # Import diferido: los datos de prueba viven en test_export (nombres e imagen de 1x1).
    from app.api.v1 import export as export_module
    from app.api.v1 import portfolio as portfolio_module
    from app.core import portfolio as portfolio_core
    from tests.test_export import NAMES, PNG_1X1

    calls: dict[str, list[str]] = {"user_ids": [], "file_urls": []}

    async def fake_fetch_user_names(user_ids, token: str) -> dict[str, str]:
        ids = list(user_ids)
        calls["user_ids"] += ids
        return {user_id: NAMES[user_id] for user_id in ids if user_id in NAMES}

    async def fake_download_file(file_url: str) -> bytes | None:
        calls["file_urls"].append(file_url)
        return PNG_1X1

    monkeypatch.setattr(export_module, "fetch_user_names", fake_fetch_user_names)
    monkeypatch.setattr(portfolio_module, "fetch_user_names", fake_fetch_user_names)
    monkeypatch.setattr(portfolio_core, "download_file", fake_download_file)
    return calls
