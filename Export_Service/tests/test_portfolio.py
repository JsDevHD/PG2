"""Portafolio en proyectos por grupos y portafolio académico del estudiante
(`POST /api/v1/portfolio/export`). Auth Service y Blob Storage son mocks (ver test_export)."""

from datetime import timedelta

import httpx
import pytest
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.pdf_builder import IMAGE_OMITTED_MESSAGE, NO_EVIDENCE_MESSAGE
from tests.test_export import (
    NAMES,
    STUDENT_A,
    STUDENT_B,
    T0,
    TEACHER_ID,
    _auth,
    _export_url,
    _file_url,
    _pdf_text,
)

PORTFOLIO_URL = "/api/v1/portfolio/export"
STUDENT_C = str(ObjectId())
NAMES[STUDENT_C] = "Carla Ruiz"


async def _course(db: AsyncIOMotorDatabase, name: str, students: list[str]) -> str:
    result = await db.courses.insert_one(
        {
            "name": name,
            "course_code": str(ObjectId())[-6:],
            "teacher_id": TEACHER_ID,
            "student_ids": students,
        }
    )
    return str(result.inserted_id)


async def _project(db: AsyncIOMotorDatabase, course_id: str, title: str, **extra) -> str:
    result = await db.projects.insert_one(
        {
            "course_id": course_id,
            "title": title,
            "description": f"Enunciado de {title}",
            "created_by": TEACHER_ID,
            "created_at": T0,
            **extra,
        }
    )
    return str(result.inserted_id)


async def _version(
    db: AsyncIOMotorDatabase,
    project_id: str,
    student_id: str,
    description: str,
    file_name: str = "pieza.png",
    group_id: str | None = None,
    days: int = 1,
) -> str:
    result = await db.versions.insert_one(
        {
            "project_id": project_id,
            "student_id": student_id,
            "group_id": group_id,
            "file_url": _file_url(project_id, student_id, file_name),
            "description": description,
            "uploaded_at": T0 + timedelta(days=days),
        }
    )
    return str(result.inserted_id)


async def _feedback(
    db: AsyncIOMotorDatabase,
    version_id: str,
    comment: str,
    *,
    student_id: str,
    score: float | None = 3.5,
    is_final: bool = False,
) -> None:
    await db.feedback.insert_one(
        {
            "version_id": version_id,
            "student_id": student_id,
            "teacher_id": TEACHER_ID,
            "comment": comment,
            "score": score,
            "score_replaced": False,
            "is_final": is_final,
            "created_at": T0 + timedelta(days=2),
        }
    )


@pytest.fixture
async def group_project(test_db: AsyncIOMotorDatabase, external_services) -> dict[str, str]:
    """Proyecto por grupos: A y B en un grupo (versión subida por B), C en otro."""
    course_id = await _course(test_db, "Diseño Editorial", [STUDENT_A, STUDENT_B, STUDENT_C])
    project_id = await _project(test_db, course_id, "Revista", work_mode="group")
    group = await test_db.groups.insert_one(
        {"project_id": project_id, "name": "Los Bauhaus", "member_ids": [STUDENT_A, STUDENT_B]}
    )
    other = await test_db.groups.insert_one(
        {"project_id": project_id, "name": "Otro grupo", "member_ids": [STUDENT_C]}
    )
    shared = await _version(
        test_db, project_id, STUDENT_B, "Maqueta del grupo", group_id=str(group.inserted_id)
    )
    await _version(test_db, project_id, STUDENT_C, "Maqueta ajena", group_id=str(other.inserted_id))
    await _feedback(test_db, shared, "Buena retícula", student_id=STUDENT_B)
    # Calificación individual de B sobre la versión compartida: A no debe verla.
    await _feedback(test_db, shared, "Cierre de Bruno", student_id=STUDENT_B, is_final=True)
    return {"course_id": course_id, "project_id": project_id}


async def test_group_project_export_includes_group_versions(
    client: httpx.AsyncClient, group_project: dict[str, str]
) -> None:
    response = await client.get(
        _export_url(group_project["project_id"]), headers=_auth(STUDENT_A, "estudiante")
    )

    assert response.status_code == 200
    text = "\n".join(_pdf_text(response))
    assert "Los Bauhaus (Ana Díaz, Bruno Gómez)" in text
    assert "Maqueta del grupo" in text
    assert "por Bruno Gómez" in text
    assert "Buena retícula" in text
    assert "Maqueta ajena" not in text
    assert "Cierre de Bruno" not in text  # la calificación final de B es de B


async def test_group_project_export_shows_own_final_grade(
    client: httpx.AsyncClient, group_project: dict[str, str]
) -> None:
    response = await client.get(
        _export_url(group_project["project_id"]),
        params={"student_id": STUDENT_B},
        headers=_auth(TEACHER_ID, "docente"),
    )

    pages = _pdf_text(response)
    assert "Calificación final" in pages[-1]
    assert "Cierre de Bruno" in pages[-1]


@pytest.fixture
async def two_courses(test_db: AsyncIOMotorDatabase, external_services) -> dict[str, str]:
    """A está en dos cursos (B solo en el segundo), con un proyecto calificado y uno vacío."""
    first = await _course(test_db, "Tipografía", [STUDENT_A])
    second = await _course(test_db, "Branding", [STUDENT_A, STUDENT_B])
    poster = await _project(test_db, first, "Afiche")
    empty = await _project(test_db, first, "Sin entregas")
    logo = await _project(test_db, second, "Logotipo")
    others = await _project(test_db, second, "Solo de B")
    version = await _version(test_db, poster, STUDENT_A, "Afiche final", "afiche.png")
    await _feedback(test_db, version, "Gran contraste", student_id=STUDENT_A, score=4.5)
    await _feedback(test_db, version, "Cierre", student_id=STUDENT_A, score=4.8, is_final=True)
    await _version(test_db, logo, STUDENT_A, "Logo vectorial", "logo.pdf")
    await _version(test_db, others, STUDENT_B, "Trabajo de B")
    return {"poster": poster, "empty": empty, "logo": logo, "others": others}


async def test_portfolio_groups_projects_by_course(
    client: httpx.AsyncClient, two_courses: dict[str, str]
) -> None:
    response = await client.post(
        PORTFOLIO_URL,
        json={"project_ids": [two_courses["logo"], two_courses["poster"], two_courses["empty"]]},
        headers=_auth(STUDENT_A, "estudiante"),
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"] == (
        'attachment; filename="portafolio_academico_Ana_Diaz.pdf"'
    )
    pages = _pdf_text(response)
    cover = pages[0]
    assert "Portafolio académico" in cover and "Ana Díaz" in cover
    # Cursos por nombre: Branding antes que Tipografía.
    assert cover.index("Branding") < cover.index("Tipografía")
    text = "\n".join(pages)
    for expected in ("Logo vectorial", "Afiche final", "Gran contraste", "4.8 / 5.0"):
        assert expected in text
    assert NO_EVIDENCE_MESSAGE in text  # "Sin entregas"
    assert "Trabajo de B" not in text


async def test_portfolio_without_feedback_grades_or_images(
    client: httpx.AsyncClient, two_courses: dict[str, str], external_services
) -> None:
    response = await client.post(
        PORTFOLIO_URL,
        json={
            "project_ids": [two_courses["poster"]],
            "include_feedback": False,
            "include_grades": False,
            "include_images": False,
        },
        headers=_auth(STUDENT_A, "estudiante"),
    )

    text = "\n".join(_pdf_text(response))
    assert "Afiche final" in text
    assert "Gran contraste" not in text
    assert "Calificación" not in text
    assert "4.8" not in text
    assert IMAGE_OMITTED_MESSAGE in text
    assert external_services["file_urls"] == []  # sin imágenes no se descarga nada


async def test_portfolio_grades_without_comments(
    client: httpx.AsyncClient, two_courses: dict[str, str]
) -> None:
    response = await client.post(
        PORTFOLIO_URL,
        json={"project_ids": [two_courses["poster"]], "include_feedback": False},
        headers=_auth(STUDENT_A, "estudiante"),
    )

    text = "\n".join(_pdf_text(response))
    assert "Gran contraste" not in text
    assert "Calificación parcial: 4.5 / 5.0" in text
    assert "4.8 / 5.0" in text


async def test_portfolio_rejects_projects_from_other_courses(
    client: httpx.AsyncClient, two_courses: dict[str, str]
) -> None:
    # B no está en "Tipografía": no puede pedir el afiche de ese curso.
    response = await client.post(
        PORTFOLIO_URL,
        json={"project_ids": [two_courses["logo"], two_courses["poster"]]},
        headers=_auth(STUDENT_B, "estudiante"),
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Solo puedes exportar proyectos de tus cursos"}


@pytest.mark.parametrize(
    ("body", "status"),
    [
        ({"project_ids": []}, 422),
        ({"project_ids": ["no-es-un-id"]}, 404),
        ({"project_ids": [str(ObjectId())]}, 404),
    ],
)
async def test_portfolio_validates_projects(
    client: httpx.AsyncClient, two_courses: dict[str, str], body: dict, status: int
) -> None:
    response = await client.post(PORTFOLIO_URL, json=body, headers=_auth(STUDENT_A, "estudiante"))
    assert response.status_code == status


async def test_portfolio_is_for_students_only(
    client: httpx.AsyncClient, two_courses: dict[str, str]
) -> None:
    response = await client.post(
        PORTFOLIO_URL,
        json={"project_ids": [two_courses["poster"]]},
        headers=_auth(TEACHER_ID, "docente"),
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "El portafolio académico es exclusivo de los estudiantes"}


async def test_portfolio_includes_group_projects(
    client: httpx.AsyncClient, group_project: dict[str, str]
) -> None:
    response = await client.post(
        PORTFOLIO_URL,
        json={"project_ids": [group_project["project_id"]]},
        headers=_auth(STUDENT_A, "estudiante"),
    )

    text = "\n".join(_pdf_text(response))
    assert "Grupo: Los Bauhaus" in text
    assert "Maqueta del grupo" in text
    assert "Cierre de Bruno" not in text


async def test_hidden_projects_cannot_be_exported_by_students(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, two_courses: dict[str, str]
) -> None:
    await test_db.projects.update_one(
        {"_id": ObjectId(two_courses["poster"])}, {"$set": {"hidden": True}}
    )

    portfolio = await client.post(
        PORTFOLIO_URL,
        json={"project_ids": [two_courses["poster"]]},
        headers=_auth(STUDENT_A, "estudiante"),
    )
    single = await client.get(
        _export_url(two_courses["poster"]), headers=_auth(STUDENT_A, "estudiante")
    )
    as_teacher = await client.get(
        _export_url(two_courses["poster"]),
        params={"student_id": STUDENT_A},
        headers=_auth(TEACHER_ID, "docente"),
    )

    assert portfolio.status_code == 404
    assert single.status_code == 404
    assert as_teacher.status_code == 200
