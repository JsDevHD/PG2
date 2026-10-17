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
STUDENT_C_ID = str(ObjectId())
STUDENT_D_ID = str(ObjectId())

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


def group_settings(
    *,
    min_size: int = 2,
    max_size: int = 3,
    deadline: datetime | None = None,
    grading_mode: str = "individual",
) -> dict:
    deadline = deadline or datetime.now(UTC) + timedelta(days=7)
    return {
        "work_mode": "group",
        "group_min_size": min_size,
        "group_max_size": max_size,
        "group_deadline": deadline.isoformat(),
        "grading_mode": grading_mode,
    }


async def create_group_project(
    client: httpx.AsyncClient, course_id: str, teacher_id: str = TEACHER_ID, **settings
) -> dict:
    response = await client.post(
        f"/api/v1/courses/{course_id}/projects",
        json={"title": "Campaña en equipo", **group_settings(**settings)},
        headers=teacher(teacher_id),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_group(
    client: httpx.AsyncClient, project_id: str, student_id: str, name: str | None = None
) -> httpx.Response:
    return await client.post(
        f"/api/v1/projects/{project_id}/groups",
        json={"name": name} if name else {},
        headers=student(student_id),
    )


async def join_group(
    client: httpx.AsyncClient, project_id: str, group_id: str, student_id: str
) -> httpx.Response:
    return await client.post(
        f"/api/v1/projects/{project_id}/groups/{group_id}/join", headers=student(student_id)
    )


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
        data={"description": description, "rights_declaration": "true"},
        headers=student(student_id),
    )


async def add_feedback(
    db: AsyncIOMotorDatabase,
    version_id: str,
    *,
    is_final: bool = False,
    student_id: str | None = None,
    group_id: str | None = None,
) -> None:
    """Simula un documento escrito por Feedback Service (esquema de su especificación).

    `project_id` y `student_id` se copian de la versión, como hace Feedback Service; en una
    calificación final por integrante, `student_id` es el estudiante calificado.
    """
    version = await db.versions.find_one({"_id": ObjectId(version_id)})
    await db.feedback.insert_one(
        {
            "version_id": version_id,
            "project_id": version["project_id"],
            "student_id": student_id or version["student_id"],
            "group_id": group_id if group_id is not None else version.get("group_id"),
            "teacher_id": TEACHER_ID,
            "comment": "Buen uso de la jerarquía",
            "score": 4.0,
            "is_final": is_final,
            "created_at": datetime.now(UTC),
        }
    )
