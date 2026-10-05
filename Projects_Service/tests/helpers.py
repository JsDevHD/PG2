"""Utilidades compartidas por los tests: tokens y creación de recursos vía API."""

from datetime import UTC, datetime, timedelta

import httpx
from bson import ObjectId
from jose import jwt
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings

# Ids con el formato que emite Auth Service (ObjectId serializado como string).
TEACHER_ID = str(ObjectId())
OTHER_TEACHER_ID = str(ObjectId())
STUDENT_A_ID = str(ObjectId())
STUDENT_B_ID = str(ObjectId())

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def auth_headers(user_id: str, role: str) -> dict[str, str]:
    settings = get_settings()
    payload = {"sub": user_id, "role": role, "exp": datetime.now(UTC) + timedelta(minutes=5)}
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


def teacher(user_id: str = TEACHER_ID) -> dict[str, str]:
    return auth_headers(user_id, "docente")


def student(user_id: str) -> dict[str, str]:
    return auth_headers(user_id, "estudiante")


async def create_course(
    client: httpx.AsyncClient, teacher_id: str = TEACHER_ID, name: str = "Diseño Gráfico I"
) -> dict:
    response = await client.post(
        "/api/v1/courses", json={"name": name}, headers=teacher(teacher_id)
    )
    assert response.status_code == 201, response.text
    return response.json()


async def join_course(client: httpx.AsyncClient, course_code: str, student_id: str) -> None:
    response = await client.post(
        "/api/v1/courses/join", json={"course_code": course_code}, headers=student(student_id)
    )
    assert response.status_code == 200, response.text


async def create_project(
    client: httpx.AsyncClient, course_id: str, teacher_id: str = TEACHER_ID
) -> dict:
    response = await client.post(
        f"/api/v1/courses/{course_id}/projects",
        json={"title": "Afiche tipográfico", "description": "Composición con una sola familia"},
        headers=teacher(teacher_id),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def upload_version(
    client: httpx.AsyncClient,
    project_id: str,
    student_id: str,
    *,
    content: bytes = PNG_BYTES,
    content_type: str = "image/png",
    filename: str = "boceto.png",
    description: str = "Primera propuesta",
) -> httpx.Response:
    return await client.post(
        f"/api/v1/projects/{project_id}/versions",
        files={"file": (filename, content, content_type)},
        data={"description": description},
        headers=student(student_id),
    )


async def add_feedback(
    db: AsyncIOMotorDatabase, version_id: str, *, is_final: bool = False
) -> None:
    """Simula un documento escrito por Feedback Service (esquema de su especificación)."""
    await db.feedback.insert_one(
        {
            "version_id": version_id,
            "teacher_id": TEACHER_ID,
            "comment": "Buen uso de la jerarquía",
            "score": 4.0,
            "is_final": is_final,
            "created_at": datetime.now(UTC),
        }
    )
