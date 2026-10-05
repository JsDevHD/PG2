import os

# Deben definirse antes de importar la app: `get_settings()` se evalúa al importar app.main.
# Las variables de entorno tienen prioridad sobre el `.env` local.
os.environ["SERVICE_NAME"] = "projects-service"
os.environ["MONGODB_DB_NAME"] = "graphic_tracker_test"
os.environ["JWT_SECRET_KEY"] = "test-secret-key"
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")
# Blob Storage y Auth Service nunca se contactan en los tests (se mockean); estos valores solo
# permiten construir la configuración y los clientes.
os.environ["AZURE_STORAGE_CONNECTION_STRING"] = (
    "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;"
    "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;"
    "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;"
)
os.environ["AUTH_SERVICE_URL"] = "http://auth-service.test"

from collections.abc import AsyncIterator
from unittest.mock import AsyncMock

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
def mock_upload(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """Reemplaza la subida a Blob Storage; retorna una URL determinista por proyecto/estudiante."""

    async def fake_upload(file, project_id: str, student_id: str) -> str:
        return f"https://storage.test/versions/{project_id}/{student_id}/{file.filename}"

    mock = AsyncMock(side_effect=fake_upload)
    monkeypatch.setattr("app.api.v1.versions.upload_file", mock)
    return mock
