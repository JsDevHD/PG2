import re

import httpx
import pytest
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from tests.helpers import (
    OTHER_TEACHER_ID,
    STUDENT_A_ID,
    STUDENT_B_ID,
    TEACHER_ID,
    create_course,
    create_project,
    join_course,
    student,
    teacher,
)


async def test_create_course(client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase) -> None:
    response = await client.post(
        "/api/v1/courses", json={"name": "  Diseño Gráfico I  "}, headers=teacher()
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Diseño Gráfico I"
    assert body["teacher_id"] == TEACHER_ID
    assert re.fullmatch(r"[A-Z0-9]{6}", body["course_code"])
    stored = await test_db.courses.find_one({"_id": ObjectId(body["id"])})
    assert stored["student_ids"] == []


async def test_create_course_requires_docente(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase
) -> None:
    response = await client.post(
        "/api/v1/courses", json={"name": "Curso"}, headers=student(STUDENT_A_ID)
    )

    assert response.status_code == 403
    assert await test_db.courses.count_documents({}) == 0


async def test_create_course_retries_on_code_collision(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    codes = iter(["AAAAAA", "AAAAAA", "BBBBBB"])
    monkeypatch.setattr("app.api.v1.courses.generate_course_code", lambda: next(codes))

    first = await create_course(client)
    second = await create_course(client)

    assert first["course_code"] == "AAAAAA"
    assert second["course_code"] == "BBBBBB"


async def test_list_courses_by_role(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase
) -> None:
    own = await create_course(client, name="Ilustración")
    await create_course(client, teacher_id=OTHER_TEACHER_ID, name="Tipografía")
    await join_course(client, own["course_code"], STUDENT_A_ID)

    teacher_courses = await client.get("/api/v1/courses", headers=teacher())
    student_a_courses = await client.get("/api/v1/courses", headers=student(STUDENT_A_ID))
    student_b_courses = await client.get("/api/v1/courses", headers=student(STUDENT_B_ID))

    assert [c["id"] for c in teacher_courses.json()] == [own["id"]]
    assert [c["id"] for c in student_a_courses.json()] == [own["id"]]
    assert student_b_courses.json() == []


async def test_join_course_success(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase
) -> None:
    course = await create_course(client)

    # El código se normaliza: espacios y minúsculas no impiden unirse.
    response = await client.post(
        "/api/v1/courses/join",
        json={"course_code": f" {course['course_code'].lower()} "},
        headers=student(STUDENT_A_ID),
    )

    assert response.status_code == 200
    assert response.json() == course
    stored = await test_db.courses.find_one({"_id": ObjectId(course["id"])})
    assert stored["student_ids"] == [STUDENT_A_ID]


async def test_join_course_invalid_code(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase
) -> None:
    response = await client.post(
        "/api/v1/courses/join", json={"course_code": "ZZZZZZ"}, headers=student(STUDENT_A_ID)
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Código de curso no válido"}


async def test_join_course_idempotent(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase
) -> None:
    course = await create_course(client)

    await join_course(client, course["course_code"], STUDENT_A_ID)
    await join_course(client, course["course_code"], STUDENT_A_ID)

    stored = await test_db.courses.find_one({"_id": ObjectId(course["id"])})
    assert stored["student_ids"] == [STUDENT_A_ID]


async def test_join_course_requires_estudiante(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase
) -> None:
    course = await create_course(client)

    response = await client.post(
        "/api/v1/courses/join",
        json={"course_code": course["course_code"]},
        headers=teacher(OTHER_TEACHER_ID),
    )

    assert response.status_code == 403


async def test_create_project_requires_titular(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase
) -> None:
    course = await create_course(client)
    await join_course(client, course["course_code"], STUDENT_A_ID)
    url = f"/api/v1/courses/{course['id']}/projects"
    body = {"title": "Afiche", "description": "Brief"}

    other_teacher = await client.post(url, json=body, headers=teacher(OTHER_TEACHER_ID))
    enrolled_student = await client.post(url, json=body, headers=student(STUDENT_A_ID))
    titular = await client.post(url, json=body, headers=teacher())

    assert other_teacher.status_code == 403
    assert enrolled_student.status_code == 403
    assert titular.status_code == 201
    project = titular.json()
    assert project["course_id"] == course["id"]
    assert project["created_by"] == TEACHER_ID
    assert await test_db.projects.count_documents({}) == 1


async def test_create_project_course_not_found(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase
) -> None:
    for course_id in (str(ObjectId()), "no-es-un-id"):
        response = await client.post(
            f"/api/v1/courses/{course_id}/projects", json={"title": "Afiche"}, headers=teacher()
        )
        assert response.status_code == 404
        assert response.json() == {"detail": "Curso no encontrado"}


async def test_list_projects_requires_membership(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase
) -> None:
    course = await create_course(client)
    await join_course(client, course["course_code"], STUDENT_A_ID)
    project = await create_project(client, course["id"])
    url = f"/api/v1/courses/{course['id']}/projects"

    as_titular = await client.get(url, headers=teacher())
    as_enrolled = await client.get(url, headers=student(STUDENT_A_ID))
    as_outsider_student = await client.get(url, headers=student(STUDENT_B_ID))
    as_other_teacher = await client.get(url, headers=teacher(OTHER_TEACHER_ID))

    assert as_titular.status_code == 200
    assert as_titular.json() == [project]
    assert as_enrolled.json() == [project]
    assert as_outsider_student.status_code == 403
    assert as_other_teacher.status_code == 403
