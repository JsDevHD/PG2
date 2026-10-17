"""Edición, visibilidad y eliminación de proyectos (PATCH y DELETE /projects/{id})."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from tests.helpers import (
    OTHER_TEACHER_ID,
    STUDENT_A_ID,
    STUDENT_B_ID,
    create_course,
    create_group,
    create_group_project,
    create_project,
    join_course,
    student,
    teacher,
    upload_version,
)


@pytest.fixture
async def course(client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase) -> dict:
    course = await create_course(client)
    for student_id in (STUDENT_A_ID, STUDENT_B_ID):
        await join_course(client, course["course_code"], student_id)
    return course


@pytest.fixture
async def project(client: httpx.AsyncClient, course: dict) -> dict:
    return await create_project(client, course["id"])


def _url(project_id: str) -> str:
    return f"/api/v1/projects/{project_id}"


def _future(days: int = 7) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


# ---- Editar -------------------------------------------------------------------------------


async def test_edit_title_and_description(client: httpx.AsyncClient, project: dict) -> None:
    response = await client.patch(
        _url(project["id"]),
        json={"title": "  Afiche final  ", "description": "Nueva consigna"},
        headers=teacher(),
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["title"], body["description"]) == ("Afiche final", "Nueva consigna")
    assert body["updated_at"] is not None
    assert body["work_mode"] == "individual"


async def test_only_titular_teacher_edits(client: httpx.AsyncClient, project: dict) -> None:
    as_student = await client.patch(
        _url(project["id"]), json={"title": "X"}, headers=student(STUDENT_A_ID)
    )
    as_other = await client.patch(
        _url(project["id"]), json={"title": "X"}, headers=teacher(OTHER_TEACHER_ID)
    )
    missing = await client.patch(_url(str(ObjectId())), json={"title": "X"}, headers=teacher())

    assert as_student.status_code == 403
    assert as_other.status_code == 403
    assert missing.status_code == 404


async def test_edit_validates_fields(client: httpx.AsyncClient, project: dict) -> None:
    empty_title = await client.patch(_url(project["id"]), json={"title": ""}, headers=teacher())
    bad_group = await client.patch(
        _url(project["id"]),
        json={
            "work_mode": "group",
            "group_min_size": 4,
            "group_max_size": 3,
            "group_deadline": _future(),
        },
        headers=teacher(),
    )
    past_deadline = await client.patch(
        _url(project["id"]),
        json={
            "work_mode": "group",
            "group_min_size": 2,
            "group_max_size": 3,
            "group_deadline": (datetime.now(UTC) - timedelta(hours=1)).isoformat(),
        },
        headers=teacher(),
    )

    assert empty_title.status_code == 422
    assert bad_group.json() == {
        "detail": "El mínimo de integrantes no puede ser mayor que el máximo"
    }
    assert past_deadline.json() == {"detail": "La fecha límite para formar grupos debe ser futura"}


async def test_switch_to_group_mode_while_empty(client: httpx.AsyncClient, project: dict) -> None:
    response = await client.patch(
        _url(project["id"]),
        json={
            "work_mode": "group",
            "group_min_size": 2,
            "group_max_size": 4,
            "group_deadline": _future(),
            "grading_mode": "group",
        },
        headers=teacher(),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["work_mode"] == "group"
    assert (body["group_min_size"], body["group_max_size"], body["grading_mode"]) == (2, 4, "group")

    # Y de vuelta a individual: la configuración de grupos se descarta.
    back = await client.patch(
        _url(project["id"]), json={"work_mode": "individual"}, headers=teacher()
    )
    assert back.json()["group_min_size"] is None
    assert back.json()["grading_mode"] == "individual"


async def test_structure_locked_after_versions(
    client: httpx.AsyncClient, project: dict, mock_upload: AsyncMock
) -> None:
    await upload_version(client, project["id"], STUDENT_A_ID)

    locked = await client.patch(
        _url(project["id"]),
        json={
            "work_mode": "group",
            "group_min_size": 2,
            "group_max_size": 3,
            "group_deadline": _future(),
        },
        headers=teacher(),
    )
    # Enviar los mismos valores de estructura (formulario completo) no cuenta como cambio.
    same = await client.patch(
        _url(project["id"]),
        json={"title": "Nuevo título", "work_mode": "individual", "grading_mode": "individual"},
        headers=teacher(),
    )

    assert locked.status_code == 409
    assert "ya no se pueden cambiar" in locked.json()["detail"]
    assert same.status_code == 200
    assert same.json()["title"] == "Nuevo título"


async def test_structure_locked_after_groups_but_deadline_editable(
    client: httpx.AsyncClient, course: dict
) -> None:
    project = await create_group_project(client, course["id"])
    await create_group(client, project["id"], STUDENT_A_ID)

    resize = await client.patch(_url(project["id"]), json={"group_max_size": 5}, headers=teacher())
    close = await client.patch(
        _url(project["id"]),
        json={"group_deadline": (datetime.now(UTC) - timedelta(minutes=1)).isoformat()},
        headers=teacher(),
    )

    assert resize.status_code == 409
    assert close.status_code == 200
    assert datetime.fromisoformat(close.json()["group_deadline"]) < datetime.now(UTC)


# ---- Ocultar ------------------------------------------------------------------------------


async def test_hidden_project_disappears_for_students(
    client: httpx.AsyncClient, course: dict, project: dict, mock_upload: AsyncMock
) -> None:
    version = (await upload_version(client, project["id"], STUDENT_A_ID)).json()
    hidden = await client.patch(_url(project["id"]), json={"hidden": True}, headers=teacher())
    assert hidden.json()["hidden"] is True

    projects_url = f"/api/v1/courses/{course['id']}/projects"
    as_student = await client.get(projects_url, headers=student(STUDENT_A_ID))
    as_teacher = await client.get(projects_url, headers=teacher())
    versions = await client.get(f"{_url(project['id'])}/versions", headers=student(STUDENT_A_ID))
    detail = await client.get(
        f"{_url(project['id'])}/versions/{version['id']}", headers=student(STUDENT_A_ID)
    )
    upload = await upload_version(client, project["id"], STUDENT_A_ID)
    progress = await client.get(
        f"/api/v1/courses/{course['id']}/progress", headers=student(STUDENT_A_ID)
    )

    assert as_student.json() == []
    assert [p["hidden"] for p in as_teacher.json()] == [True]
    for response in (versions, detail, upload):
        assert response.status_code == 404
        assert response.json() == {"detail": "Proyecto no encontrado"}
    assert progress.json()["versions_count"] == 0

    # Al mostrarlo de nuevo, todo vuelve intacto.
    await client.patch(_url(project["id"]), json={"hidden": False}, headers=teacher())
    again = await client.get(f"{_url(project['id'])}/versions", headers=student(STUDENT_A_ID))
    assert [v["id"] for v in again.json()] == [version["id"]]


async def test_create_project_hidden_as_draft(client: httpx.AsyncClient, course: dict) -> None:
    response = await client.post(
        f"/api/v1/courses/{course['id']}/projects",
        json={"title": "Borrador", "hidden": True},
        headers=teacher(),
    )

    assert response.json()["hidden"] is True
    listed = await client.get(
        f"/api/v1/courses/{course['id']}/projects", headers=student(STUDENT_A_ID)
    )
    assert listed.json() == []


# ---- Eliminar -----------------------------------------------------------------------------


async def test_delete_empty_project_and_its_groups(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, course: dict
) -> None:
    project = await create_group_project(client, course["id"])
    await create_group(client, project["id"], STUDENT_A_ID)

    as_student = await client.delete(_url(project["id"]), headers=student(STUDENT_A_ID))
    deleted = await client.delete(_url(project["id"]), headers=teacher())
    again = await client.delete(_url(project["id"]), headers=teacher())

    assert as_student.status_code == 403
    assert deleted.status_code == 204
    assert again.status_code == 404
    assert await test_db.projects.count_documents({}) == 0
    assert await test_db.groups.count_documents({}) == 0


async def test_cannot_delete_project_with_versions(
    client: httpx.AsyncClient,
    test_db: AsyncIOMotorDatabase,
    project: dict,
    mock_upload: AsyncMock,
) -> None:
    await upload_version(client, project["id"], STUDENT_A_ID)

    response = await client.delete(_url(project["id"]), headers=teacher())

    assert response.status_code == 409
    assert response.json() == {
        "detail": "El proyecto tiene versiones: ocúltalo en lugar de eliminarlo"
    }
    assert await test_db.projects.count_documents({}) == 1
    assert await test_db.versions.count_documents({}) == 1
