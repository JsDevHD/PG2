import httpx

from app.core.config import get_settings


async def test_health_returns_ok_with_service_name(client: httpx.AsyncClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": get_settings().service_name}


async def test_cors_exposes_content_disposition(client: httpx.AsyncClient) -> None:
    # El frontend necesita leer el nombre del PDF exportado desde otro origen.
    response = await client.get("/health", headers={"Origin": "http://localhost:5173"})

    assert "content-disposition" in response.headers["access-control-expose-headers"].lower()
