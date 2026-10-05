import httpx
import pytest
from bson import ObjectId
from jose import jwt
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings

pytestmark = pytest.mark.usefixtures("test_db")

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
ME_URL = "/api/v1/auth/me"
BATCH_URL = "/api/v1/users/batch"

PASSWORD = "clave-segura-123"
INVALID_CREDENTIALS = "Credenciales inválidas"


def user_payload(**overrides: str) -> dict:
    payload = {
        "name": "Ana Díaz",
        "email": "ana@example.com",
        "password": PASSWORD,
        "role": "estudiante",
    }
    return payload | overrides


async def register(client: httpx.AsyncClient, **overrides: str) -> dict:
    response = await client.post(REGISTER_URL, json=user_payload(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


async def login_token(
    client: httpx.AsyncClient, email: str = "ana@example.com", password: str = PASSWORD
) -> str:
    response = await client.post(LOGIN_URL, json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---- register ----


async def test_register_success(client: httpx.AsyncClient) -> None:
    response = await client.post(REGISTER_URL, json=user_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["id"]
    assert body["name"] == "Ana Díaz"
    assert body["email"] == "ana@example.com"
    assert body["role"] == "estudiante"
    assert body["created_at"]
    assert "password_hash" not in body
    assert "password" not in body


async def test_register_duplicate_email(client: httpx.AsyncClient) -> None:
    await register(client)

    response = await client.post(REGISTER_URL, json=user_payload(name="Otra Persona"))

    assert response.status_code == 409
    assert response.json() == {"detail": "El correo ya está registrado"}


async def test_register_invalid_role(client: httpx.AsyncClient) -> None:
    response = await client.post(REGISTER_URL, json=user_payload(role="admin"))

    assert response.status_code == 422


async def test_register_rejects_password_over_72_bytes(client: httpx.AsyncClient) -> None:
    # 40 caracteres (pasa max_length=72) pero 80 bytes en UTF-8: bcrypt no lo admite.
    response = await client.post(REGISTER_URL, json=user_payload(password="ñ" * 40))

    assert response.status_code == 422


async def test_email_is_case_insensitive(client: httpx.AsyncClient) -> None:
    await register(client, email="Ana@Example.com")

    duplicate = await client.post(REGISTER_URL, json=user_payload(email="ANA@example.COM"))
    assert duplicate.status_code == 409

    assert await login_token(client, email="aNa@EXAMPLE.com")


# ---- login ----


async def test_login_success(client: httpx.AsyncClient) -> None:
    user = await register(client)

    response = await client.post(LOGIN_URL, json={"email": "ana@example.com", "password": PASSWORD})

    assert response.status_code == 200
    body = response.json()
    settings = get_settings()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == settings.jwt_expire_minutes * 60
    claims = jwt.decode(
        body["access_token"], settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
    )
    assert claims["sub"] == user["id"]
    assert claims["role"] == "estudiante"
    assert "exp" in claims


async def test_login_wrong_password(client: httpx.AsyncClient) -> None:
    await register(client)

    response = await client.post(
        LOGIN_URL, json={"email": "ana@example.com", "password": "otra-clave-999"}
    )

    assert response.status_code == 401
    assert response.json() == {"detail": INVALID_CREDENTIALS}


async def test_login_nonexistent_email(client: httpx.AsyncClient) -> None:
    await register(client)
    wrong_password = await client.post(
        LOGIN_URL, json={"email": "ana@example.com", "password": "otra-clave-999"}
    )

    response = await client.post(
        LOGIN_URL, json={"email": "nadie@example.com", "password": PASSWORD}
    )

    assert response.status_code == 401
    # Requisito de seguridad: el texto debe ser idéntico al de contraseña incorrecta.
    assert response.json()["detail"] == wrong_password.json()["detail"] == INVALID_CREDENTIALS


async def test_login_password_over_72_bytes_is_invalid_credentials(
    client: httpx.AsyncClient,
) -> None:
    await register(client)

    response = await client.post(LOGIN_URL, json={"email": "ana@example.com", "password": "ñ" * 40})

    assert response.status_code == 401
    assert response.json() == {"detail": INVALID_CREDENTIALS}


# ---- me ----


async def test_me_requires_token(client: httpx.AsyncClient) -> None:
    response = await client.get(ME_URL)

    assert response.status_code == 401


async def test_me_returns_current_user(client: httpx.AsyncClient) -> None:
    user = await register(client, name="Carlos Ruiz", email="carlos@example.com", role="docente")
    token = await login_token(client, email="carlos@example.com")

    response = await client.get(ME_URL, headers=bearer(token))

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == user["id"]
    assert body["name"] == "Carlos Ruiz"
    assert body["email"] == "carlos@example.com"
    assert body["role"] == "docente"
    assert "password_hash" not in body


async def test_me_returns_404_when_user_no_longer_exists(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase
) -> None:
    user = await register(client)
    token = await login_token(client)
    await test_db.users.delete_one({"_id": ObjectId(user["id"])})

    response = await client.get(ME_URL, headers=bearer(token))

    assert response.status_code == 404
    assert response.json() == {"detail": "Usuario no encontrado"}


# ---- users/batch ----


async def test_users_batch_returns_public_fields(client: httpx.AsyncClient) -> None:
    ana = await register(client)
    carlos = await register(client, name="Carlos Ruiz", email="carlos@example.com", role="docente")
    token = await login_token(client)

    response = await client.get(
        BATCH_URL, params={"ids": f"{ana['id']},{carlos['id']}"}, headers=bearer(token)
    )

    assert response.status_code == 200
    assert response.json() == [
        {"id": ana["id"], "name": "Ana Díaz", "role": "estudiante"},
        {"id": carlos["id"], "name": "Carlos Ruiz", "role": "docente"},
    ]
    for item in response.json():
        assert set(item) == {"id", "name", "role"}


async def test_users_batch_ignores_unknown_ids(client: httpx.AsyncClient) -> None:
    ana = await register(client)
    token = await login_token(client)
    unknown = str(ObjectId())

    response = await client.get(
        BATCH_URL, params={"ids": f"{unknown},{ana['id']},no-es-un-id"}, headers=bearer(token)
    )

    assert response.status_code == 200
    assert response.json() == [{"id": ana["id"], "name": "Ana Díaz", "role": "estudiante"}]


async def test_users_batch_requires_token(client: httpx.AsyncClient) -> None:
    response = await client.get(BATCH_URL, params={"ids": str(ObjectId())})

    assert response.status_code == 401


async def test_users_batch_rejects_more_than_100_ids(client: httpx.AsyncClient) -> None:
    await register(client)
    token = await login_token(client)
    ids = ",".join(str(ObjectId()) for _ in range(101))

    response = await client.get(BATCH_URL, params={"ids": ids}, headers=bearer(token))

    assert response.status_code == 422
