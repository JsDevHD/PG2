"""Tests de Feedback Service (sección 7 de la especificación).

Los documentos de Projects Service (`courses`, `projects`, `versions`) se siembran directamente
en la base de test: en producción este servicio solo los lee, nunca los crea.
"""

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from bson import ObjectId
from jose import jwt
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings

Headers = dict[str, str]


def _auth(user_id: str, role: str) -> Headers:
    """Headers con un JWT como el que emite Auth Service (claims `sub`, `role`, `exp`)."""
    settings = get_settings()
    claims = {"sub": user_id, "role": role, "exp": datetime.now(UTC) + timedelta(minutes=5)}
    token = jwt.encode(claims, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


@dataclass
class Scenario:
    teacher_id: str
    student_a_id: str
    student_b_id: str
    project_id: str
    second_project_id: str  # otro proyecto del mismo curso
    version_a: str  # versión de student_a en project_id
    version_b: str  # versión de student_b en project_id
    second_project_version: str  # versión de student_a en second_project_id
    teacher: Headers  # docente titular del curso
    other_teacher: Headers  # docente que no dicta el curso
    student_a: Headers
    student_b: Headers
    outsider: Headers  # estudiante no matriculado en el curso


@pytest.fixture
async def scenario(test_db: AsyncIOMotorDatabase) -> Scenario:
    teacher_id, student_a_id, student_b_id = (str(ObjectId()) for _ in range(3))
    course_id, project_id, second_project_id = ObjectId(), ObjectId(), ObjectId()
    version_a, version_b, second_project_version = ObjectId(), ObjectId(), ObjectId()
    now = datetime.now(UTC)

    await test_db.courses.insert_one(
        {
            "_id": course_id,
            "name": "Diseño Gráfico I",
            "course_code": "ABC123",
            "teacher_id": teacher_id,
            "student_ids": [student_a_id, student_b_id],
        }
    )
    await test_db.projects.insert_many(
        [
            {
                "_id": pid,
                "course_id": str(course_id),
                "title": title,
                "description": "",
                "created_by": teacher_id,
                "created_at": now,
            }
            for pid, title in [(project_id, "Afiche"), (second_project_id, "Logotipo")]
        ]
    )
    await test_db.versions.insert_many(
        [
            {
                "_id": vid,
                "project_id": str(pid),
                "student_id": sid,
                "file_url": f"https://blob.example/{vid}.png",
                "description": "",
                "uploaded_at": now,
            }
            for vid, pid, sid in [
                (version_a, project_id, student_a_id),
                (version_b, project_id, student_b_id),
                (second_project_version, second_project_id, student_a_id),
            ]
        ]
    )

    return Scenario(
        teacher_id=teacher_id,
        student_a_id=student_a_id,
        student_b_id=student_b_id,
        project_id=str(project_id),
        second_project_id=str(second_project_id),
        version_a=str(version_a),
        version_b=str(version_b),
        second_project_version=str(second_project_version),
        teacher=_auth(teacher_id, "docente"),
        other_teacher=_auth(str(ObjectId()), "docente"),
        student_a=_auth(student_a_id, "estudiante"),
        student_b=_auth(student_b_id, "estudiante"),
        outsider=_auth(str(ObjectId()), "estudiante"),
    )


async def _post_feedback(
    client: httpx.AsyncClient,
    version_id: str,
    headers: Headers,
    comment: str = "Buen manejo de la jerarquía visual",
    score: float | None = 4.0,
) -> httpx.Response:
    body: dict = {"comment": comment}
    if score is not None:
        body["score"] = score
    return await client.post(f"/api/v1/versions/{version_id}/feedback", json=body, headers=headers)


async def _post_final_grade(
    client: httpx.AsyncClient, project_id: str, version_id: str, headers: Headers
) -> httpx.Response:
    return await client.post(
        f"/api/v1/projects/{project_id}/final-grade",
        json={"version_id": version_id, "comment": "Proceso sólido", "score": 4.6},
        headers=headers,
    )


# ---- POST /versions/{version_id}/feedback -------------------------------------------------------


async def test_create_feedback_success(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, scenario: Scenario
) -> None:
    response = await _post_feedback(client, scenario.version_a, scenario.teacher, score=4.5)

    assert response.status_code == 201
    body = response.json()
    assert body["version_id"] == scenario.version_a
    assert body["project_id"] == scenario.project_id
    assert body["student_id"] == scenario.student_a_id
    assert body["teacher_id"] == scenario.teacher_id
    assert body["comment"] == "Buen manejo de la jerarquía visual"
    assert body["score"] == 4.5
    assert body["score_replaced"] is False
    assert body["is_final"] is False
    assert await test_db.feedback.count_documents({"_id": ObjectId(body["id"])}) == 1


async def test_create_feedback_not_titular(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, scenario: Scenario
) -> None:
    response = await _post_feedback(client, scenario.version_a, scenario.other_teacher)

    assert response.status_code == 403
    assert await test_db.feedback.count_documents({}) == 0


async def test_create_feedback_requires_teacher_role(
    client: httpx.AsyncClient, scenario: Scenario
) -> None:
    response = await _post_feedback(client, scenario.version_a, scenario.student_a)

    assert response.status_code == 403


@pytest.mark.parametrize("version_id", [str(ObjectId()), "no-es-un-object-id"])
async def test_create_feedback_version_not_found(
    client: httpx.AsyncClient, scenario: Scenario, version_id: str
) -> None:
    response = await _post_feedback(client, version_id, scenario.teacher)

    assert response.status_code == 404
    assert response.json() == {"detail": "Versión no encontrada"}


@pytest.mark.parametrize("score", [-0.1, 5.1])
async def test_score_out_of_range(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, scenario: Scenario, score: float
) -> None:
    response = await _post_feedback(client, scenario.version_a, scenario.teacher, score=score)

    assert response.status_code == 422
    assert await test_db.feedback.count_documents({}) == 0


@pytest.mark.parametrize("score", [0.0, 5.0])
async def test_score_limits_are_accepted(
    client: httpx.AsyncClient, scenario: Scenario, score: float
) -> None:
    response = await _post_feedback(client, scenario.version_a, scenario.teacher, score=score)

    assert response.status_code == 201
    assert response.json()["score"] == score


async def test_comment_without_score(client: httpx.AsyncClient, scenario: Scenario) -> None:
    response = await _post_feedback(client, scenario.version_a, scenario.teacher, score=None)

    assert response.status_code == 201
    assert response.json()["score"] is None
    assert response.json()["score_replaced"] is False


async def _version_feedback(client: httpx.AsyncClient, scenario: Scenario) -> list[dict]:
    response = await client.get(
        f"/api/v1/versions/{scenario.version_a}/feedback", headers=scenario.teacher
    )
    return response.json()


async def test_new_score_replaces_current_partial_grade(
    client: httpx.AsyncClient, scenario: Scenario
) -> None:
    await _post_feedback(client, scenario.version_a, scenario.teacher, "Primera", score=3.5)
    await _post_feedback(client, scenario.version_a, scenario.teacher, "Sin nota", score=None)
    await _post_feedback(client, scenario.version_a, scenario.teacher, "Corregida", score=4.2)

    feedback = await _version_feedback(client, scenario)

    # Los tres comentarios se conservan; solo la última calificación queda vigente.
    assert [(f["comment"], f["score"], f["score_replaced"]) for f in feedback] == [
        ("Primera", 3.5, True),
        ("Sin nota", None, False),
        ("Corregida", 4.2, False),
    ]


async def test_comment_without_score_keeps_current_grade(
    client: httpx.AsyncClient, scenario: Scenario
) -> None:
    await _post_feedback(client, scenario.version_a, scenario.teacher, "Con nota", score=4.0)
    await _post_feedback(
        client, scenario.version_a, scenario.teacher, "Otro comentario", score=None
    )

    feedback = await _version_feedback(client, scenario)

    assert [f["score_replaced"] for f in feedback] == [False, False]


async def test_partial_grade_is_per_version(client: httpx.AsyncClient, scenario: Scenario) -> None:
    await _post_feedback(client, scenario.version_a, scenario.teacher, score=3.0)
    await _post_feedback(client, scenario.version_b, scenario.teacher, score=4.0)

    response = await client.get(
        f"/api/v1/projects/{scenario.project_id}/feedback", headers=scenario.teacher
    )

    assert [f["score_replaced"] for f in response.json()] == [False, False]


async def test_concurrent_scores_leave_one_current_grade(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, scenario: Scenario
) -> None:
    responses = await asyncio.gather(
        *(
            _post_feedback(client, scenario.version_a, scenario.teacher, f"Nota {n}", score=n)
            for n in (3.0, 4.0, 5.0)
        )
    )

    assert {r.status_code for r in responses} <= {201, 409}
    current = {"version_id": scenario.version_a, "is_final": False, "score_replaced": False}
    assert await test_db.feedback.count_documents({**current, "score": {"$ne": None}}) == 1


async def test_migration_keeps_latest_legacy_partial_grade(
    test_db: AsyncIOMotorDatabase, scenario: Scenario
) -> None:
    from app.db.init_indexes import init_indexes

    await test_db.feedback.drop_index("unique_current_partial_grade")
    base = {
        "version_id": scenario.version_a,
        "project_id": scenario.project_id,
        "student_id": scenario.student_a_id,
        "teacher_id": scenario.teacher_id,
        "comment": "Antes del cambio",
        "is_final": False,
    }
    now = datetime.now(UTC)
    # Documentos con el formato anterior: sin `score_replaced` y dos notas en la misma versión.
    await test_db.feedback.insert_many(
        [
            {**base, "score": 3.0, "created_at": now - timedelta(days=2)},
            {**base, "score": 4.0, "created_at": now - timedelta(days=1)},
        ]
    )

    await init_indexes(test_db)

    docs = await test_db.feedback.find({}).sort("created_at", 1).to_list(None)
    assert [(d["score"], d["score_replaced"]) for d in docs] == [(3.0, True), (4.0, False)]


async def test_feedback_requires_authentication(
    client: httpx.AsyncClient, scenario: Scenario
) -> None:
    response = await client.get(f"/api/v1/versions/{scenario.version_a}/feedback")

    assert response.status_code == 401


# ---- GET /versions/{version_id}/feedback y GET /projects/{project_id}/feedback ------------------


async def test_feedback_scoped_by_role(client: httpx.AsyncClient, scenario: Scenario) -> None:
    for comment in ("Primera revisión", "Segunda revisión"):
        assert (
            await _post_feedback(client, scenario.version_a, scenario.teacher, comment)
        ).is_success
    assert (await _post_feedback(client, scenario.version_b, scenario.teacher)).is_success

    # El estudiante A no puede ver la retroalimentación de la versión del estudiante B...
    response = await client.get(
        f"/api/v1/versions/{scenario.version_b}/feedback", headers=scenario.student_a
    )
    assert response.status_code == 403

    # ...pero sí la de la suya, en orden cronológico.
    response = await client.get(
        f"/api/v1/versions/{scenario.version_a}/feedback", headers=scenario.student_a
    )
    assert response.status_code == 200
    assert [f["comment"] for f in response.json()] == ["Primera revisión", "Segunda revisión"]

    # En el historial del proyecto, el estudiante solo recibe lo de sus propias versiones.
    response = await client.get(
        f"/api/v1/projects/{scenario.project_id}/feedback", headers=scenario.student_a
    )
    assert response.status_code == 200
    assert {f["student_id"] for f in response.json()} == {scenario.student_a_id}
    assert len(response.json()) == 2

    # El docente titular ve la de todos los estudiantes.
    response = await client.get(
        f"/api/v1/projects/{scenario.project_id}/feedback", headers=scenario.teacher
    )
    assert response.status_code == 200
    assert len(response.json()) == 3


async def test_version_feedback_not_titular(client: httpx.AsyncClient, scenario: Scenario) -> None:
    response = await client.get(
        f"/api/v1/versions/{scenario.version_a}/feedback", headers=scenario.other_teacher
    )

    assert response.status_code == 403


@pytest.mark.parametrize("who", ["other_teacher", "outsider"])
async def test_project_feedback_requires_membership(
    client: httpx.AsyncClient, scenario: Scenario, who: str
) -> None:
    response = await client.get(
        f"/api/v1/projects/{scenario.project_id}/feedback", headers=getattr(scenario, who)
    )

    assert response.status_code == 403


async def test_project_feedback_project_not_found(
    client: httpx.AsyncClient, scenario: Scenario
) -> None:
    response = await client.get(f"/api/v1/projects/{ObjectId()}/feedback", headers=scenario.teacher)

    assert response.status_code == 404
    assert response.json() == {"detail": "Proyecto no encontrado"}


# ---- POST /projects/{project_id}/final-grade ----------------------------------------------------


async def test_final_grade_success(client: httpx.AsyncClient, scenario: Scenario) -> None:
    response = await _post_final_grade(
        client, scenario.project_id, scenario.version_a, scenario.teacher
    )

    assert response.status_code == 201
    [body] = response.json()  # un solo registro en un proyecto individual
    assert body["is_final"] is True
    assert body["group_id"] is None
    assert body["version_id"] == scenario.version_a
    assert body["student_id"] == scenario.student_a_id
    assert body["score"] == 4.6


@pytest.mark.parametrize("who", ["other_teacher", "student_a"])
async def test_final_grade_requires_titular_teacher(
    client: httpx.AsyncClient, scenario: Scenario, who: str
) -> None:
    response = await _post_final_grade(
        client, scenario.project_id, scenario.version_a, getattr(scenario, who)
    )

    assert response.status_code == 403


async def test_final_grade_version_not_found(client: httpx.AsyncClient, scenario: Scenario) -> None:
    response = await _post_final_grade(
        client, scenario.project_id, str(ObjectId()), scenario.teacher
    )

    assert response.status_code == 404


async def test_final_grade_version_mismatch(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, scenario: Scenario
) -> None:
    response = await _post_final_grade(
        client, scenario.project_id, scenario.second_project_version, scenario.teacher
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "La versión no pertenece a este proyecto"}
    assert await test_db.feedback.count_documents({}) == 0


async def test_final_grade_already_exists(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, scenario: Scenario
) -> None:
    first = await _post_final_grade(
        client, scenario.project_id, scenario.version_a, scenario.teacher
    )
    assert first.status_code == 201

    second = await _post_final_grade(
        client, scenario.project_id, scenario.version_a, scenario.teacher
    )

    assert second.status_code == 409
    assert second.json() == {
        "detail": "El estudiante ya tiene una calificación final en este proyecto"
    }
    assert await test_db.feedback.count_documents({"is_final": True}) == 1


async def test_final_grade_concurrent_requests(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, scenario: Scenario
) -> None:
    responses = await asyncio.gather(
        *(
            _post_final_grade(client, scenario.project_id, scenario.version_a, scenario.teacher)
            for _ in range(2)
        )
    )

    assert sorted(r.status_code for r in responses) == [201, 409]
    assert await test_db.feedback.count_documents({"is_final": True}) == 1


async def test_final_grade_is_per_student(client: httpx.AsyncClient, scenario: Scenario) -> None:
    for version_id in (scenario.version_a, scenario.version_b):
        response = await _post_final_grade(
            client, scenario.project_id, version_id, scenario.teacher
        )
        assert response.status_code == 201


async def test_feedback_allowed_after_final_grade(
    client: httpx.AsyncClient, scenario: Scenario
) -> None:
    await _post_final_grade(client, scenario.project_id, scenario.version_a, scenario.teacher)

    response = await _post_feedback(client, scenario.version_a, scenario.teacher)

    assert response.status_code == 201
    assert response.json()["is_final"] is False


# ---- GET /projects/{project_id}/final-grade -----------------------------------------------------


async def test_get_final_grade_scoped_by_role(
    client: httpx.AsyncClient, scenario: Scenario
) -> None:
    url = f"/api/v1/projects/{scenario.project_id}/final-grade"
    assert (await client.get(url, headers=scenario.student_a)).json() == []

    await _post_feedback(client, scenario.version_a, scenario.teacher)  # parcial: no cuenta
    await _post_final_grade(client, scenario.project_id, scenario.version_a, scenario.teacher)

    student_a = (await client.get(url, headers=scenario.student_a)).json()
    assert [(g["student_id"], g["is_final"]) for g in student_a] == [(scenario.student_a_id, True)]
    assert (await client.get(url, headers=scenario.student_b)).json() == []

    await _post_final_grade(client, scenario.project_id, scenario.version_b, scenario.teacher)
    teacher = (await client.get(url, headers=scenario.teacher)).json()
    assert {g["student_id"] for g in teacher} == {scenario.student_a_id, scenario.student_b_id}


async def test_get_final_grade_requires_membership(
    client: httpx.AsyncClient, scenario: Scenario
) -> None:
    response = await client.get(
        f"/api/v1/projects/{scenario.project_id}/final-grade", headers=scenario.outsider
    )

    assert response.status_code == 403
