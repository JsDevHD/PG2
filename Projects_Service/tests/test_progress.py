import httpx
import pytest
import respx
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from tests.helpers import (
    OTHER_TEACHER_ID,
    STUDENT_A_ID,
    STUDENT_B_ID,
    add_feedback,
    create_course,
    create_project,
    join_course,
    student,
    teacher,
    upload_version,
)

STUDENT_C_ID = str(ObjectId())  # matriculado, sin versiones
USERS_BATCH_URL = "http://auth-service.test/api/v1/users/batch"


@pytest.fixture
async def course(client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, mock_upload) -> dict:
    """Curso con dos proyectos y este estado:

    - A: 2 versiones (una con dos comentarios, otra sin comentarios) -> 50 %
    - B: 1 versión con un comentario -> 100 %
    - C: matriculado sin versiones -> 0 %
    Total del curso: 2 de 3 versiones con retroalimentación -> 66.67 %
    """
    course = await create_course(client)
    for student_id in (STUDENT_A_ID, STUDENT_B_ID, STUDENT_C_ID):
        await join_course(client, course["course_code"], student_id)
    p1 = await create_project(client, course["id"])
    p2 = await create_project(client, course["id"])

    a1 = (await upload_version(client, p1["id"], STUDENT_A_ID)).json()
    await upload_version(client, p2["id"], STUDENT_A_ID)
    b1 = (await upload_version(client, p1["id"], STUDENT_B_ID)).json()
    await add_feedback(test_db, a1["id"])
    await add_feedback(test_db, a1["id"])
    await add_feedback(test_db, b1["id"])
    return course


async def test_progress_student_view(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, course: dict
) -> None:
    # Versiones de A en otro curso no deben contar en este.
    other_course = await create_course(client, teacher_id=OTHER_TEACHER_ID)
    await join_course(client, other_course["course_code"], STUDENT_A_ID)
    other_project = await create_project(client, other_course["id"], teacher_id=OTHER_TEACHER_ID)
    other_version = (await upload_version(client, other_project["id"], STUDENT_A_ID)).json()
    await add_feedback(test_db, other_version["id"])

    response = await client.get(
        f"/api/v1/courses/{course['id']}/progress", headers=student(STUDENT_A_ID)
    )

    assert response.status_code == 200
    assert response.json() == {
        "course_id": course["id"],
        "student_id": STUDENT_A_ID,
        "versions_count": 2,
        "versions_with_feedback": 1,
        "progress_percentage": 50.0,
    }


async def test_progress_student_without_versions(client: httpx.AsyncClient, course: dict) -> None:
    response = await client.get(
        f"/api/v1/courses/{course['id']}/progress", headers=student(STUDENT_C_ID)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["versions_count"] == 0
    assert body["progress_percentage"] == 0.0


async def test_progress_teacher_view(
    client: httpx.AsyncClient, course: dict, respx_mock: respx.MockRouter
) -> None:
    batch = respx_mock.get(USERS_BATCH_URL).mock(
        return_value=httpx.Response(
            200,
            json=[
                {"id": STUDENT_A_ID, "name": "Ana Díaz", "role": "estudiante"},
                {"id": STUDENT_B_ID, "name": "Julián Estupiñán", "role": "estudiante"},
                # C no aparece: Auth Service omite los ids que no encuentra.
            ],
        )
    )
    headers = teacher()

    response = await client.get(f"/api/v1/courses/{course['id']}/progress", headers=headers)

    assert response.status_code == 200
    assert response.json() == {
        "course_id": course["id"],
        "versions_count": 3,
        "versions_with_feedback": 2,
        "progress_percentage": 66.67,
        "students": [
            {
                "student_id": STUDENT_A_ID,
                "student_name": "Ana Díaz",
                "versions_count": 2,
                "versions_with_feedback": 1,
                "progress_percentage": 50.0,
            },
            {
                "student_id": STUDENT_B_ID,
                "student_name": "Julián Estupiñán",
                "versions_count": 1,
                "versions_with_feedback": 1,
                "progress_percentage": 100.0,
            },
            {
                "student_id": STUDENT_C_ID,
                "student_name": None,
                "versions_count": 0,
                "versions_with_feedback": 0,
                "progress_percentage": 0.0,
            },
        ],
    }
    request = batch.calls.last.request
    assert request.url.params["ids"] == f"{STUDENT_A_ID},{STUDENT_B_ID},{STUDENT_C_ID}"
    # Se reenvía el JWT del docente: Auth Service exige autenticación en /users/batch.
    assert request.headers["Authorization"] == headers["Authorization"]


@pytest.mark.parametrize(
    "auth_response",
    [httpx.ConnectError("Auth Service caído"), httpx.Response(500, json={"detail": "error"})],
    ids=["connection-error", "server-error"],
)
async def test_progress_teacher_view_degrades_when_auth_service_fails(
    client: httpx.AsyncClient,
    course: dict,
    respx_mock: respx.MockRouter,
    auth_response: Exception | httpx.Response,
) -> None:
    respx_mock.get(USERS_BATCH_URL).mock(side_effect=[auth_response])

    response = await client.get(f"/api/v1/courses/{course['id']}/progress", headers=teacher())

    assert response.status_code == 200
    body = response.json()
    assert body["progress_percentage"] == 66.67
    assert [s["student_name"] for s in body["students"]] == [None, None, None]
    assert [s["progress_percentage"] for s in body["students"]] == [50.0, 100.0, 0.0]


async def test_progress_requires_membership(client: httpx.AsyncClient, course: dict) -> None:
    url = f"/api/v1/courses/{course['id']}/progress"

    assert (await client.get(url, headers=teacher(OTHER_TEACHER_ID))).status_code == 403
    assert (await client.get(url, headers=student(str(ObjectId())))).status_code == 403


async def test_progress_course_not_found(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase
) -> None:
    response = await client.get(f"/api/v1/courses/{ObjectId()}/progress", headers=teacher())

    assert response.status_code == 404
