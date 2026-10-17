"""Proyectos por grupos: configuración, formación de grupos, versiones del grupo y progreso."""

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from tests.helpers import (
    STUDENT_A_ID,
    STUDENT_B_ID,
    STUDENT_C_ID,
    STUDENT_D_ID,
    add_feedback,
    create_course,
    create_group,
    create_group_project,
    group_settings,
    join_course,
    join_group,
    student,
    teacher,
    upload_version,
)


@pytest.fixture
async def course(client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase) -> dict:
    """Curso con los estudiantes A, B, C y D matriculados."""
    course = await create_course(client)
    for student_id in (STUDENT_A_ID, STUDENT_B_ID, STUDENT_C_ID, STUDENT_D_ID):
        await join_course(client, course["course_code"], student_id)
    return course


@pytest.fixture
async def project(client: httpx.AsyncClient, course: dict) -> dict:
    """Proyecto por grupos de 2 a 3 integrantes, con calificación individual."""
    return await create_group_project(client, course["id"])


async def _group_of(client: httpx.AsyncClient, project_id: str, *members: str) -> dict:
    """Grupo creado por el primer integrante y completado con los demás."""
    group = (await create_group(client, project_id, members[0])).json()
    for member in members[1:]:
        assert (await join_group(client, project_id, group["id"], member)).status_code == 200
    return group


# ---- Configuración del proyecto ----------------------------------------------------------


async def test_create_group_project_stores_settings(
    client: httpx.AsyncClient, course: dict, project: dict
) -> None:
    assert project["work_mode"] == "group"
    assert project["group_min_size"] == 2
    assert project["group_max_size"] == 3
    assert project["grading_mode"] == "individual"
    assert datetime.fromisoformat(project["group_deadline"]) > datetime.now(UTC)

    listed = await client.get(f"/api/v1/courses/{course['id']}/projects", headers=teacher())
    assert listed.json()[0]["work_mode"] == "group"


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"group_min_size": None}, "necesita el mínimo y el máximo"),
        ({"group_min_size": 4, "group_max_size": 3}, "no puede ser mayor que el máximo"),
        ({"group_deadline": None}, "necesita la fecha límite"),
        (
            {"group_deadline": (datetime.now(UTC) - timedelta(hours=1)).isoformat()},
            "debe ser futura",
        ),
        ({"group_min_size": 1}, "greater than or equal to 2"),
        ({"group_max_size": 11}, "less than or equal to 10"),
    ],
)
async def test_create_group_project_validates_settings(
    client: httpx.AsyncClient, course: dict, changes: dict, message: str
) -> None:
    body = {"title": "Campaña", **group_settings(), **changes}
    response = await client.post(
        f"/api/v1/courses/{course['id']}/projects", json=body, headers=teacher()
    )
    assert response.status_code == 422
    assert message in str(response.json()["detail"])


async def test_individual_project_ignores_group_settings(
    client: httpx.AsyncClient, course: dict
) -> None:
    body = {"title": "Afiche", **group_settings(grading_mode="group"), "work_mode": "individual"}
    response = await client.post(
        f"/api/v1/courses/{course['id']}/projects", json=body, headers=teacher()
    )
    assert response.status_code == 201
    created = response.json()
    assert created["work_mode"] == "individual"
    assert created["grading_mode"] == "individual"
    assert created["group_min_size"] is None
    assert created["group_deadline"] is None


async def test_legacy_project_reads_as_individual(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, course: dict
) -> None:
    # Proyectos creados antes de los grupos no tienen los campos nuevos.
    await test_db.projects.insert_one(
        {
            "course_id": course["id"],
            "title": "Antiguo",
            "description": "",
            "created_by": course["teacher_id"],
            "created_at": datetime.now(UTC),
        }
    )
    listed = await client.get(f"/api/v1/courses/{course['id']}/projects", headers=teacher())
    assert listed.json()[0]["work_mode"] == "individual"
    assert listed.json()[0]["group_deadline"] is None


# ---- Formación de grupos -----------------------------------------------------------------


async def test_student_creates_and_others_join(client: httpx.AsyncClient, project: dict) -> None:
    created = await create_group(client, project["id"], STUDENT_A_ID, name="Los tipógrafos")
    assert created.status_code == 201
    group = created.json()
    assert group["name"] == "Los tipógrafos"
    assert group["member_ids"] == [STUDENT_A_ID]

    joined = await join_group(client, project["id"], group["id"], STUDENT_B_ID)
    assert joined.status_code == 200
    assert joined.json()["member_ids"] == [STUDENT_A_ID, STUDENT_B_ID]

    # Unirse dos veces no duplica al integrante.
    again = await join_group(client, project["id"], group["id"], STUDENT_B_ID)
    assert again.json()["member_ids"] == [STUDENT_A_ID, STUDENT_B_ID]

    listed = await client.get(f"/api/v1/projects/{project['id']}/groups", headers=teacher())
    assert [g["member_ids"] for g in listed.json()] == [[STUDENT_A_ID, STUDENT_B_ID]]


async def test_default_group_names_are_numbered(client: httpx.AsyncClient, project: dict) -> None:
    first = (await create_group(client, project["id"], STUDENT_A_ID)).json()
    second = (await create_group(client, project["id"], STUDENT_B_ID)).json()
    assert (first["name"], second["name"]) == ("Grupo 1", "Grupo 2")


async def test_student_belongs_to_one_group_per_project(
    client: httpx.AsyncClient, project: dict
) -> None:
    group = (await create_group(client, project["id"], STUDENT_A_ID)).json()
    other = (await create_group(client, project["id"], STUDENT_B_ID)).json()

    second_create = await create_group(client, project["id"], STUDENT_A_ID)
    join_other = await join_group(client, project["id"], other["id"], STUDENT_A_ID)

    for response in (second_create, join_other):
        assert response.status_code == 409
        assert response.json() == {"detail": "Ya perteneces a un grupo de este proyecto"}
    listed = await client.get(f"/api/v1/projects/{project['id']}/groups", headers=teacher())
    assert {g["id"]: g["member_ids"] for g in listed.json()} == {
        group["id"]: [STUDENT_A_ID],
        other["id"]: [STUDENT_B_ID],
    }


async def test_concurrent_joins_respect_one_group_per_student(
    client: httpx.AsyncClient, project: dict
) -> None:
    first = (await create_group(client, project["id"], STUDENT_A_ID)).json()
    second = (await create_group(client, project["id"], STUDENT_B_ID)).json()

    responses = await asyncio.gather(
        join_group(client, project["id"], first["id"], STUDENT_C_ID),
        join_group(client, project["id"], second["id"], STUDENT_C_ID),
    )

    assert sorted(r.status_code for r in responses) == [200, 409]
    listed = await client.get(f"/api/v1/projects/{project['id']}/groups", headers=teacher())
    assert sum(STUDENT_C_ID in g["member_ids"] for g in listed.json()) == 1


async def test_group_cannot_exceed_max_size(client: httpx.AsyncClient, project: dict) -> None:
    group = await _group_of(client, project["id"], STUDENT_A_ID, STUDENT_B_ID)

    # Un cupo libre (máximo 3) y dos estudiantes intentando ocuparlo a la vez.
    responses = await asyncio.gather(
        join_group(client, project["id"], group["id"], STUDENT_C_ID),
        join_group(client, project["id"], group["id"], STUDENT_D_ID),
    )

    assert sorted(r.status_code for r in responses) == [200, 409]
    assert any(r.json() == {"detail": "El grupo está completo"} for r in responses)
    listed = await client.get(f"/api/v1/projects/{project['id']}/groups", headers=teacher())
    assert len(listed.json()[0]["member_ids"]) == 3


async def test_group_actions_require_enrolled_student(
    client: httpx.AsyncClient, project: dict
) -> None:
    outsider = str(ObjectId())
    as_teacher = await client.post(
        f"/api/v1/projects/{project['id']}/groups", json={}, headers=teacher()
    )
    not_enrolled = await create_group(client, project["id"], outsider)
    listing = await client.get(
        f"/api/v1/projects/{project['id']}/groups", headers=student(outsider)
    )

    assert as_teacher.status_code == 403
    assert not_enrolled.status_code == 403
    assert listing.status_code == 403


async def test_individual_project_has_no_groups(client: httpx.AsyncClient, course: dict) -> None:
    project = (
        await client.post(
            f"/api/v1/courses/{course['id']}/projects", json={"title": "Solo"}, headers=teacher()
        )
    ).json()

    listed = await client.get(f"/api/v1/projects/{project['id']}/groups", headers=teacher())
    created = await create_group(client, project["id"], STUDENT_A_ID)

    assert listed.json() == []
    assert created.status_code == 422
    assert created.json() == {"detail": "Este proyecto es individual: no tiene grupos"}


async def test_groups_close_at_deadline(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, project: dict
) -> None:
    group = (await create_group(client, project["id"], STUDENT_A_ID)).json()
    await test_db.projects.update_one(
        {"_id": ObjectId(project["id"])},
        {"$set": {"group_deadline": datetime.now(UTC) - timedelta(minutes=1)}},
    )

    for response in (
        await create_group(client, project["id"], STUDENT_B_ID),
        await join_group(client, project["id"], group["id"], STUDENT_B_ID),
        await client.post(
            f"/api/v1/projects/{project['id']}/groups/{group['id']}/leave",
            headers=student(STUDENT_A_ID),
        ),
    ):
        assert response.status_code == 403
        assert response.json() == {"detail": "El plazo para formar grupos terminó"}


async def test_teacher_changes_deadline(client: httpx.AsyncClient, project: dict) -> None:
    url = f"/api/v1/projects/{project['id']}/group-deadline"
    past = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()
    future = (datetime.now(UTC) + timedelta(days=30)).isoformat()

    as_student = await client.post(
        url, json={"group_deadline": future}, headers=student(STUDENT_A_ID)
    )
    closed = await client.post(url, json={"group_deadline": past}, headers=teacher())
    blocked = await create_group(client, project["id"], STUDENT_A_ID)
    reopened = await client.post(url, json={"group_deadline": future}, headers=teacher())
    allowed = await create_group(client, project["id"], STUDENT_A_ID)

    assert as_student.status_code == 403
    assert closed.status_code == 200
    assert blocked.status_code == 403
    assert reopened.status_code == 200
    assert datetime.fromisoformat(reopened.json()["group_deadline"]) > datetime.now(UTC)
    assert allowed.status_code == 201


async def test_leave_group_and_empty_group_is_removed(
    client: httpx.AsyncClient, project: dict
) -> None:
    group = await _group_of(client, project["id"], STUDENT_A_ID, STUDENT_B_ID)
    leave_url = f"/api/v1/projects/{project['id']}/groups/{group['id']}/leave"

    assert (await client.post(leave_url, headers=student(STUDENT_B_ID))).status_code == 204
    listed = await client.get(f"/api/v1/projects/{project['id']}/groups", headers=teacher())
    assert listed.json()[0]["member_ids"] == [STUDENT_A_ID]

    assert (await client.post(leave_url, headers=student(STUDENT_A_ID))).status_code == 204
    listed = await client.get(f"/api/v1/projects/{project['id']}/groups", headers=teacher())
    assert listed.json() == []


async def test_cannot_leave_group_with_versions(
    client: httpx.AsyncClient, project: dict, mock_upload: AsyncMock
) -> None:
    group = await _group_of(client, project["id"], STUDENT_A_ID, STUDENT_B_ID)
    await upload_version(client, project["id"], STUDENT_A_ID)

    response = await client.post(
        f"/api/v1/projects/{project['id']}/groups/{group['id']}/leave",
        headers=student(STUDENT_B_ID),
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "El grupo ya subió versiones: no puedes salir de él"}


async def test_cannot_join_graded_group(
    client: httpx.AsyncClient,
    test_db: AsyncIOMotorDatabase,
    project: dict,
    mock_upload: AsyncMock,
) -> None:
    group = await _group_of(client, project["id"], STUDENT_A_ID, STUDENT_B_ID)
    version = (await upload_version(client, project["id"], STUDENT_A_ID)).json()
    await add_feedback(test_db, version["id"], is_final=True, student_id=STUDENT_A_ID)

    response = await join_group(client, project["id"], group["id"], STUDENT_C_ID)

    assert response.status_code == 403
    assert response.json() == {"detail": "El grupo ya tiene calificación final: no admite cambios"}


# ---- Versiones del grupo -----------------------------------------------------------------


async def test_upload_requires_group(
    client: httpx.AsyncClient, project: dict, mock_upload: AsyncMock
) -> None:
    response = await upload_version(client, project["id"], STUDENT_A_ID)

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Este proyecto es por grupos: únete a un grupo para subir versiones"
    }
    mock_upload.assert_not_awaited()


async def test_group_shares_versions(
    client: httpx.AsyncClient, project: dict, mock_upload: AsyncMock
) -> None:
    group = await _group_of(client, project["id"], STUDENT_A_ID, STUDENT_B_ID)
    other = await _group_of(client, project["id"], STUDENT_C_ID, STUDENT_D_ID)
    by_a = (await upload_version(client, project["id"], STUDENT_A_ID)).json()
    by_b = (await upload_version(client, project["id"], STUDENT_B_ID, description="Ajustes")).json()
    by_c = (await upload_version(client, project["id"], STUDENT_C_ID)).json()
    assert by_a["group_id"] == by_b["group_id"] == group["id"]
    assert by_c["group_id"] == other["id"]

    # Cada integrante ve todo el historial de su grupo, y nada del otro grupo.
    url = f"/api/v1/projects/{project['id']}/versions"
    for member in (STUDENT_A_ID, STUDENT_B_ID):
        listed = await client.get(url, headers=student(member))
        assert [v["id"] for v in listed.json()] == [by_a["id"], by_b["id"]]
    detail = await client.get(f"{url}/{by_a['id']}", headers=student(STUDENT_B_ID))
    foreign = await client.get(f"{url}/{by_a['id']}", headers=student(STUDENT_C_ID))
    assert detail.status_code == 200
    assert foreign.status_code == 403

    # El docente ve todo y puede filtrar por grupo.
    everything = await client.get(url, headers=teacher())
    filtered = await client.get(url, params={"group_id": other["id"]}, headers=teacher())
    assert len(everything.json()) == 3
    assert [v["id"] for v in filtered.json()] == [by_c["id"]]


async def test_student_without_group_sees_no_versions(
    client: httpx.AsyncClient, project: dict, mock_upload: AsyncMock
) -> None:
    await _group_of(client, project["id"], STUDENT_A_ID, STUDENT_B_ID)
    await upload_version(client, project["id"], STUDENT_A_ID)

    listed = await client.get(
        f"/api/v1/projects/{project['id']}/versions", headers=student(STUDENT_C_ID)
    )

    assert listed.json() == []


async def test_individual_final_grade_blocks_only_that_member(
    client: httpx.AsyncClient,
    test_db: AsyncIOMotorDatabase,
    project: dict,
    mock_upload: AsyncMock,
) -> None:
    await _group_of(client, project["id"], STUDENT_A_ID, STUDENT_B_ID)
    version = (await upload_version(client, project["id"], STUDENT_A_ID)).json()
    await add_feedback(test_db, version["id"], is_final=True, student_id=STUDENT_A_ID)

    graded = await upload_version(client, project["id"], STUDENT_A_ID)
    teammate = await upload_version(client, project["id"], STUDENT_B_ID)

    assert graded.status_code == 403
    assert teammate.status_code == 201


async def test_group_final_grade_blocks_every_member(
    client: httpx.AsyncClient,
    test_db: AsyncIOMotorDatabase,
    course: dict,
    mock_upload: AsyncMock,
) -> None:
    project = await create_group_project(client, course["id"], grading_mode="group")
    await _group_of(client, project["id"], STUDENT_A_ID, STUDENT_B_ID)
    version = (await upload_version(client, project["id"], STUDENT_A_ID)).json()
    # Feedback Service registra la calificación grupal una vez por integrante.
    for member in (STUDENT_A_ID, STUDENT_B_ID):
        await add_feedback(test_db, version["id"], is_final=True, student_id=member)

    for member in (STUDENT_A_ID, STUDENT_B_ID):
        assert (await upload_version(client, project["id"], member)).status_code == 403


# ---- Progreso ----------------------------------------------------------------------------


async def test_progress_counts_group_versions_for_each_member(
    client: httpx.AsyncClient,
    test_db: AsyncIOMotorDatabase,
    course: dict,
    project: dict,
    mock_upload: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.api.v1.progress.fetch_user_names", AsyncMock(return_value={}))
    await _group_of(client, project["id"], STUDENT_A_ID, STUDENT_B_ID)
    first = (await upload_version(client, project["id"], STUDENT_A_ID)).json()
    await upload_version(client, project["id"], STUDENT_B_ID)
    await add_feedback(test_db, first["id"])

    url = f"/api/v1/courses/{course['id']}/progress"
    as_b = (await client.get(url, headers=student(STUDENT_B_ID))).json()
    as_c = (await client.get(url, headers=student(STUDENT_C_ID))).json()
    as_teacher = (await client.get(url, headers=teacher())).json()

    assert (as_b["versions_count"], as_b["versions_with_feedback"]) == (2, 1)
    assert as_b["progress_percentage"] == 50.0
    assert as_c["versions_count"] == 0
    # Totales del curso: versiones distintas, no una por integrante.
    assert (as_teacher["versions_count"], as_teacher["versions_with_feedback"]) == (2, 1)
    by_student = {s["student_id"]: s for s in as_teacher["students"]}
    assert by_student[STUDENT_A_ID]["versions_count"] == 2
    assert by_student[STUDENT_B_ID]["versions_with_feedback"] == 1
    assert by_student[STUDENT_C_ID]["versions_count"] == 0
