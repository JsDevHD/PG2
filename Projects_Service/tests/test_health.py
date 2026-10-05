import httpx

from app.core.config import get_settings


async def test_health_returns_ok_with_service_name(client: httpx.AsyncClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": get_settings().service_name}
