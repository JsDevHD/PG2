"""Tests de `GET /api/v1/projects/{project_id}/export` (RF-07 / CU-04).

Auth Service y Blob Storage se reemplazan con mocks; MongoDB es la base de test del template.
"""

import base64
from datetime import UTC, datetime, timedelta
from io import BytesIO

import httpx
import pytest
from bson import ObjectId
from jose import jwt
from motor.motor_asyncio import AsyncIOMotorDatabase
from pypdf import PdfReader

from app.api.v1 import export as export_module
from app.core.config import get_settings
from app.core.pdf_builder import FILE_UNAVAILABLE_MESSAGE, NO_EVIDENCE_MESSAGE

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)
TEACHER_ID = str(ObjectId())
OTHER_TEACHER_ID = str(ObjectId())
STUDENT_A = str(ObjectId())
STUDENT_B = str(ObjectId())
OUTSIDER_ID = str(ObjectId())
NAMES = {TEACHER_ID: "Julián Estupiñán", STUDENT_A: "Ana Díaz", STUDENT_B: "Bruno Gómez"}
T0 = datetime(2026, 3, 2, 14, 30)  # naive UTC, tal como lo devuelve Motor


def _auth(user_id: str, role: str) -> dict[str, str]:
    settings = get_settings()
    payload = {"sub": user_id, "role": role, "exp": datetime.now(UTC) + timedelta(minutes=5)}
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


def _export_url(project_id: str) -> str:
    return f"/api/v1/projects/{project_id}/export"


def _pdf_text(response: httpx.Response) -> list[str]:
    return [page.extract_text() for page in PdfReader(BytesIO(response.content)).pages]


def _file_url(project_id: str, student_id: str, name: str) -> str:
    return (
        "https://cuenta.blob.core.windows.net/versions/versions/"
        f"{project_id}/{student_id}/0f8fad5b-d9cb-469f-a165-70867728950e_{name}"
    )


@pytest.fixture
def external_services(monkeypatch: pytest.MonkeyPatch) -> dict[str, list[str]]:
    """Mocks de Auth Service y Blob Storage; registra qué se les pidió."""
    calls: dict[str, list[str]] = {"user_ids": [], "file_urls": []}

    async def fake_fetch_user_names(user_ids, token: str) -> dict[str, str]:
        ids = list(user_ids)
        calls["user_ids"] += ids
        return {user_id: NAMES[user_id] for user_id in ids if user_id in NAMES}

    async def fake_download_file(file_url: str) -> bytes | None:
        calls["file_urls"].append(file_url)
        return PNG_1X1

    monkeypatch.setattr(export_module, "fetch_user_names", fake_fetch_user_names)
    monkeypatch.setattr(export_module, "download_file", fake_download_file)
    return calls


@pytest.fixture
async def seeded(test_db: AsyncIOMotorDatabase, external_services) -> dict[str, str]:
    """Curso con A y B matriculados; A tiene dos versiones y B una, con retroalimentación."""
    course = await test_db.courses.insert_one(
        {
            "name": "Diseño Gráfico I",
            "course_code": "ABC123",
            "teacher_id": TEACHER_ID,
            "student_ids": [STUDENT_A, STUDENT_B],
        }
    )
    project = await test_db.projects.insert_one(
        {
            "course_id": str(course.inserted_id),
            "title": "Identidad visual",
            "description": "Logo y manual de marca.",
            "created_by": TEACHER_ID,
            "created_at": T0,
        }
    )
    project_id = str(project.inserted_id)
    versions = [
        (STUDENT_A, "Boceto inicial de A", "a1.png", T0 + timedelta(days=1)),
        (STUDENT_B, "Boceto inicial de B", "b1.png", T0 + timedelta(days=1, hours=1)),
        (STUDENT_A, "Versión final de A", "a2.pdf", T0 + timedelta(days=5)),
    ]
    version_ids = []
    for student_id, description, file_name, uploaded_at in versions:
        result = await test_db.versions.insert_one(
            {
                "project_id": project_id,
                "student_id": student_id,
                "file_url": _file_url(project_id, student_id, file_name),
                "description": description,
                "uploaded_at": uploaded_at,
            }
        )
        version_ids.append(str(result.inserted_id))
    for version_id, comment in [
        (version_ids[0], "Mejorar contraste A"),
        (version_ids[1], "Nota B"),
    ]:
        await test_db.feedback.insert_one(
            {
                "version_id": version_id,
                "teacher_id": TEACHER_ID,
                "comment": comment,
                "score": 3.5,
                "is_final": False,
                "created_at": T0 + timedelta(days=2),
            }
        )
    return {"course_id": str(course.inserted_id), "project_id": project_id}


async def test_export_student_own_project(
    client: httpx.AsyncClient, seeded: dict[str, str], external_services: dict[str, list[str]]
) -> None:
    response = await client.get(
        _export_url(seeded["project_id"]), headers=_auth(STUDENT_A, "estudiante")
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"] == (
        'attachment; filename="portafolio_Identidad_visual_Ana_Diaz.pdf"'
    )
    pages = _pdf_text(response)
    assert len(pages) == 3  # portada + 2 versiones de A
    assert "Ana Díaz" in pages[0]
    assert "Boceto inicial de A" in pages[1]
    assert "Mejorar contraste A" in pages[1]
    assert "Julián Estupiñán" in pages[1]
    assert "Versión final de A" in pages[2]
    # Solo se descargan imágenes; el PDF de la versión 2 se lista por nombre.
    assert external_services["file_urls"] == [_file_url(seeded["project_id"], STUDENT_A, "a1.png")]
    assert "a2.pdf" in pages[2]


async def test_export_student_cannot_specify_other(
    client: httpx.AsyncClient, seeded: dict[str, str], external_services: dict[str, list[str]]
) -> None:
    response = await client.get(
        _export_url(seeded["project_id"]),
        params={"student_id": STUDENT_B},
        headers=_auth(STUDENT_A, "estudiante"),
    )

    assert response.status_code == 200
    assert "Ana_Diaz" in response.headers["content-disposition"]
    text = "\n".join(_pdf_text(response))
    assert "Boceto inicial de A" in text
    assert "Boceto inicial de B" not in text
    assert "Nota B" not in text
    assert STUDENT_B not in external_services["user_ids"]
    assert all(f"/{STUDENT_B}/" not in url for url in external_services["file_urls"])


async def test_export_teacher_exports_enrolled_student(
    client: httpx.AsyncClient, seeded: dict[str, str]
) -> None:
    response = await client.get(
        _export_url(seeded["project_id"]),
        params={"student_id": STUDENT_B},
        headers=_auth(TEACHER_ID, "docente"),
    )

    assert response.status_code == 200
    assert "Bruno_Gomez" in response.headers["content-disposition"]
    pages = _pdf_text(response)
    assert len(pages) == 2
    assert "Boceto inicial de B" in pages[1]
    assert "Boceto inicial de A" not in "\n".join(pages)


async def test_export_teacher_requires_student_id(
    client: httpx.AsyncClient, seeded: dict[str, str]
) -> None:
    response = await client.get(
        _export_url(seeded["project_id"]), headers=_auth(TEACHER_ID, "docente")
    )

    assert response.status_code == 422
    assert "student_id" in response.json()["detail"]


async def test_export_teacher_student_not_enrolled(
    client: httpx.AsyncClient, seeded: dict[str, str]
) -> None:
    response = await client.get(
        _export_url(seeded["project_id"]),
        params={"student_id": OUTSIDER_ID},
        headers=_auth(TEACHER_ID, "docente"),
    )

    assert response.status_code == 403


async def test_export_teacher_not_titular(
    client: httpx.AsyncClient, seeded: dict[str, str]
) -> None:
    response = await client.get(
        _export_url(seeded["project_id"]),
        params={"student_id": STUDENT_A},
        headers=_auth(OTHER_TEACHER_ID, "docente"),
    )

    assert response.status_code == 403


async def test_export_student_not_enrolled(
    client: httpx.AsyncClient, seeded: dict[str, str]
) -> None:
    response = await client.get(
        _export_url(seeded["project_id"]), headers=_auth(OUTSIDER_ID, "estudiante")
    )

    assert response.status_code == 403


@pytest.mark.parametrize("project_id", [str(ObjectId()), "no-es-un-object-id"])
async def test_export_project_not_found(
    client: httpx.AsyncClient, seeded: dict[str, str], project_id: str
) -> None:
    response = await client.get(_export_url(project_id), headers=_auth(STUDENT_A, "estudiante"))

    assert response.status_code == 404
    assert response.json() == {"detail": "Proyecto no encontrado"}


async def test_export_requires_token(client: httpx.AsyncClient, seeded: dict[str, str]) -> None:
    response = await client.get(_export_url(seeded["project_id"]))

    assert response.status_code == 401


async def test_export_empty_project(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, seeded: dict[str, str]
) -> None:
    project = await test_db.projects.insert_one(
        {
            "course_id": seeded["course_id"],
            "title": "Proyecto sin entregas",
            "description": "Aún no hay versiones.",
            "created_by": TEACHER_ID,
            "created_at": T0,
        }
    )

    response = await client.get(
        _export_url(str(project.inserted_id)), headers=_auth(STUDENT_A, "estudiante")
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    pages = _pdf_text(response)
    assert len(pages) == 1
    assert NO_EVIDENCE_MESSAGE in pages[0]


async def test_export_missing_blob_does_not_abort(
    client: httpx.AsyncClient, seeded: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def blob_not_found(file_url: str) -> bytes | None:
        return None

    monkeypatch.setattr(export_module, "download_file", blob_not_found)

    response = await client.get(
        _export_url(seeded["project_id"]), headers=_auth(STUDENT_A, "estudiante")
    )

    assert response.status_code == 200
    assert FILE_UNAVAILABLE_MESSAGE in _pdf_text(response)[1]
