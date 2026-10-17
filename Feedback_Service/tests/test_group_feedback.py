"""Retroalimentación y calificación final en proyectos por grupos.

Los documentos de Projects Service (`courses`, `projects`, `groups`, `versions`) se siembran
directamente: este servicio solo los lee.
"""

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
import pytest
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from tests.test_feedback import Headers, _auth


@dataclass
class GroupScenario:
    individual_project: str  # por grupos, calificación individual
    group_project: str  # por grupos, calificación grupal
    version_ind: str  # versión del grupo 1 (subida por A) en individual_project
    version_grp: str  # versión del grupo 1 (subida por A) en group_project
    version_other: str  # versión del grupo 2 (subida por C) en individual_project
    ids: dict[str, str]
    teacher: Headers
    a: Headers
    b: Headers
    c: Headers


@pytest.fixture
async def gs(test_db: AsyncIOMotorDatabase) -> GroupScenario:
    ids = {name: str(ObjectId()) for name in ("teacher", "a", "b", "c")}
    course_id, ind_project, grp_project = ObjectId(), ObjectId(), ObjectId()
    now = datetime.now(UTC)
    await test_db.courses.insert_one(
        {
            "_id": course_id,
            "name": "Diseño Gráfico II",
            "course_code": "GRP123",
            "teacher_id": ids["teacher"],
            "student_ids": [ids["a"], ids["b"], ids["c"]],
        }
    )
    await test_db.projects.insert_many(
        [
            {
                "_id": pid,
                "course_id": str(course_id),
                "title": title,
                "description": "",
                "created_by": ids["teacher"],
                "created_at": now,
                "work_mode": "group",
                "grading_mode": grading,
            }
            for pid, title, grading in [
                (ind_project, "Revista", "individual"),
                (grp_project, "Campaña", "group"),
            ]
        ]
    )
    groups = {}
    for pid in (ind_project, grp_project):
        first = await test_db.groups.insert_one(
            {"project_id": str(pid), "name": "Grupo 1", "member_ids": [ids["a"], ids["b"]]}
        )
        second = await test_db.groups.insert_one(
            {"project_id": str(pid), "name": "Grupo 2", "member_ids": [ids["c"]]}
        )
        groups[pid] = (str(first.inserted_id), str(second.inserted_id))

    versions = {}
    for key, pid, author, group in [
        ("ind", ind_project, ids["a"], groups[ind_project][0]),
        ("grp", grp_project, ids["a"], groups[grp_project][0]),
        ("other", ind_project, ids["c"], groups[ind_project][1]),
    ]:
        result = await test_db.versions.insert_one(
            {
                "project_id": str(pid),
                "student_id": author,
                "group_id": group,
                "file_url": "https://blob.example/x.png",
                "description": "",
                "uploaded_at": now,
            }
        )
        versions[key] = str(result.inserted_id)

    return GroupScenario(
        individual_project=str(ind_project),
        group_project=str(grp_project),
        version_ind=versions["ind"],
        version_grp=versions["grp"],
        version_other=versions["other"],
        ids=ids,
        teacher=_auth(ids["teacher"], "docente"),
        a=_auth(ids["a"], "estudiante"),
        b=_auth(ids["b"], "estudiante"),
        c=_auth(ids["c"], "estudiante"),
    )


async def _final(
    client: httpx.AsyncClient,
    project_id: str,
    version_id: str,
    headers: Headers,
    student_id: str | None = None,
) -> httpx.Response:
    body: dict = {"version_id": version_id, "comment": "Cierre", "score": 4.2}
    if student_id is not None:
        body["student_id"] = student_id
    return await client.post(
        f"/api/v1/projects/{project_id}/final-grade", json=body, headers=headers
    )


async def test_group_members_see_feedback_on_group_versions(
    client: httpx.AsyncClient, gs: GroupScenario
) -> None:
    created = await client.post(
        f"/api/v1/versions/{gs.version_ind}/feedback",
        json={"comment": "Revisen la retícula", "score": 3.5},
        headers=gs.teacher,
    )
    assert created.json()["group_id"] is not None

    # B no subió la versión, pero es del grupo: la ve. C es de otro grupo: no.
    url = f"/api/v1/versions/{gs.version_ind}/feedback"
    as_b = await client.get(url, headers=gs.b)
    as_c = await client.get(url, headers=gs.c)
    project_b = await client.get(f"/api/v1/projects/{gs.individual_project}/feedback", headers=gs.b)
    project_c = await client.get(f"/api/v1/projects/{gs.individual_project}/feedback", headers=gs.c)

    assert [f["comment"] for f in as_b.json()] == ["Revisen la retícula"]
    assert as_c.status_code == 403
    assert [f["comment"] for f in project_b.json()] == ["Revisen la retícula"]
    assert project_c.json() == []


async def test_individual_grading_requires_a_group_member(
    client: httpx.AsyncClient, gs: GroupScenario
) -> None:
    missing = await _final(client, gs.individual_project, gs.version_ind, gs.teacher)
    outsider = await _final(
        client, gs.individual_project, gs.version_ind, gs.teacher, student_id=gs.ids["c"]
    )

    assert missing.status_code == 422
    assert missing.json() == {"detail": "Indica qué integrante del grupo estás calificando"}
    assert outsider.status_code == 422
    assert outsider.json() == {"detail": "El estudiante no pertenece al grupo de esta versión"}


async def test_individual_grading_grades_each_member_separately(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, gs: GroupScenario
) -> None:
    # B no subió la versión, pero se le puede calificar sobre ella.
    graded_b = await _final(
        client, gs.individual_project, gs.version_ind, gs.teacher, student_id=gs.ids["b"]
    )
    again_b = await _final(
        client, gs.individual_project, gs.version_ind, gs.teacher, student_id=gs.ids["b"]
    )
    graded_a = await _final(
        client, gs.individual_project, gs.version_ind, gs.teacher, student_id=gs.ids["a"]
    )

    assert graded_b.status_code == 201
    assert [g["student_id"] for g in graded_b.json()] == [gs.ids["b"]]
    assert again_b.status_code == 409
    assert graded_a.status_code == 201

    # Cada integrante ve solo su propia calificación final, aunque la versión sea compartida.
    finals_a = await client.get(
        f"/api/v1/projects/{gs.individual_project}/final-grade", headers=gs.a
    )
    version_feedback_a = await client.get(
        f"/api/v1/versions/{gs.version_ind}/feedback", headers=gs.a
    )
    assert [g["student_id"] for g in finals_a.json()] == [gs.ids["a"]]
    assert [f["student_id"] for f in version_feedback_a.json()] == [gs.ids["a"]]
    assert await test_db.feedback.count_documents({"is_final": True}) == 2


async def test_group_grading_grades_every_member_at_once(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, gs: GroupScenario
) -> None:
    with_student = await _final(
        client, gs.group_project, gs.version_grp, gs.teacher, student_id=gs.ids["a"]
    )
    graded = await _final(client, gs.group_project, gs.version_grp, gs.teacher)
    again = await _final(client, gs.group_project, gs.version_grp, gs.teacher)

    # Mutuamente excluyentes: en calificación grupal no se califica a un integrante suelto.
    assert with_student.status_code == 422
    assert with_student.json() == {
        "detail": "Este proyecto se califica por grupo: no se indica un estudiante"
    }
    assert graded.status_code == 201
    records = graded.json()
    assert {r["student_id"] for r in records} == {gs.ids["a"], gs.ids["b"]}
    assert {r["score"] for r in records} == {4.2}
    assert len({r["group_id"] for r in records}) == 1
    assert again.status_code == 409
    assert again.json() == {"detail": "El grupo ya tiene una calificación final en este proyecto"}
    assert await test_db.feedback.count_documents({"is_final": True}) == 2

    finals_b = await client.get(f"/api/v1/projects/{gs.group_project}/final-grade", headers=gs.b)
    assert [g["student_id"] for g in finals_b.json()] == [gs.ids["b"]]


async def test_group_grading_concurrent_requests(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, gs: GroupScenario
) -> None:
    responses = await asyncio.gather(
        *(_final(client, gs.group_project, gs.version_grp, gs.teacher) for _ in range(2))
    )

    assert sorted(r.status_code for r in responses) == [201, 409]
    assert await test_db.feedback.count_documents({"is_final": True}) == 2


async def test_hidden_project_feedback_is_invisible_to_students(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, gs: GroupScenario
) -> None:
    await client.post(
        f"/api/v1/versions/{gs.version_ind}/feedback",
        json={"comment": "Revisen la retícula"},
        headers=gs.teacher,
    )
    await test_db.projects.update_one(
        {"_id": ObjectId(gs.individual_project)}, {"$set": {"hidden": True}}
    )

    version = await client.get(f"/api/v1/versions/{gs.version_ind}/feedback", headers=gs.a)
    project = await client.get(f"/api/v1/projects/{gs.individual_project}/feedback", headers=gs.a)
    finals = await client.get(f"/api/v1/projects/{gs.individual_project}/final-grade", headers=gs.a)
    as_teacher = await client.get(f"/api/v1/versions/{gs.version_ind}/feedback", headers=gs.teacher)

    assert version.status_code == 404
    assert project.status_code == 404
    assert finals.status_code == 404
    assert [f["comment"] for f in as_teacher.json()] == ["Revisen la retícula"]
