import io
import re
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from bson import ObjectId
from fastapi import UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase
from starlette.datastructures import Headers

from app.core import storage
from app.core.config import get_settings
from app.exceptions import NotFoundError
from tests.helpers import (
    PNG_BYTES,
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


@pytest.fixture
async def project(client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase) -> dict:
    """Proyecto de un curso con los estudiantes A y B matriculados."""
    course = await create_course(client)
    await join_course(client, course["course_code"], STUDENT_A_ID)
    await join_course(client, course["course_code"], STUDENT_B_ID)
    return await create_project(client, course["id"])


async def test_upload_version_success(
    client: httpx.AsyncClient,
    test_db: AsyncIOMotorDatabase,
    project: dict,
    mock_upload: AsyncMock,
) -> None:
    response = await upload_version(client, project["id"], STUDENT_A_ID)

    assert response.status_code == 201
    body = response.json()
    assert body["project_id"] == project["id"]
    assert body["student_id"] == STUDENT_A_ID
    assert body["description"] == "Primera propuesta"
    assert body["file_url"] == (
        f"https://storage.test/versions/{project['id']}/{STUDENT_A_ID}/boceto.png"
    )
    mock_upload.assert_awaited_once()
    assert mock_upload.await_args.args[1:] == (project["id"], STUDENT_A_ID)
    stored = await test_db.versions.find_one({"_id": ObjectId(body["id"])})
    assert stored["file_url"] == body["file_url"]


async def test_upload_version_not_enrolled(
    client: httpx.AsyncClient,
    test_db: AsyncIOMotorDatabase,
    project: dict,
    mock_upload: AsyncMock,
) -> None:
    outsider = str(ObjectId())

    response = await upload_version(client, project["id"], outsider)

    assert response.status_code == 403
    mock_upload.assert_not_awaited()
    assert await test_db.versions.count_documents({}) == 0


async def test_upload_version_requires_estudiante(
    client: httpx.AsyncClient, project: dict, mock_upload: AsyncMock
) -> None:
    response = await client.post(
        f"/api/v1/projects/{project['id']}/versions",
        files={"file": ("boceto.png", b"data", "image/png")},
        data={"description": "Intento del docente"},
        headers=teacher(),
    )

    assert response.status_code == 403
    mock_upload.assert_not_awaited()


async def test_upload_version_project_not_found(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, mock_upload: AsyncMock
) -> None:
    response = await upload_version(client, str(ObjectId()), STUDENT_A_ID)

    assert response.status_code == 404
    assert response.json() == {"detail": "Proyecto no encontrado"}


async def test_upload_version_invalid_format(
    client: httpx.AsyncClient,
    test_db: AsyncIOMotorDatabase,
    project: dict,
    mock_upload: AsyncMock,
) -> None:
    response = await upload_version(
        client,
        project["id"],
        STUDENT_A_ID,
        content=b"GIF89a",
        content_type="image/gif",
        filename="animacion.gif",
    )

    assert response.status_code == 422
    assert "Formato de archivo no permitido" in response.json()["detail"]
    mock_upload.assert_not_awaited()
    assert await test_db.versions.count_documents({}) == 0


@pytest.mark.parametrize(
    ("content_type", "content"),
    [
        ("image/jpeg", b"\xff\xd8\xff\xe0contenido"),
        ("application/pdf", b"%PDF-1.7 contenido"),
        ("image/svg+xml", b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'),
    ],
)
async def test_upload_version_accepts_allowed_formats(
    client: httpx.AsyncClient,
    project: dict,
    mock_upload: AsyncMock,
    content_type: str,
    content: bytes,
) -> None:
    response = await upload_version(
        client, project["id"], STUDENT_A_ID, content=content, content_type=content_type
    )

    assert response.status_code == 201


@pytest.mark.parametrize(
    ("content_type", "content"),
    [
        # Un SVG (que puede traer scripts) declarado como PDF o como PNG.
        ("application/pdf", b'<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>'),
        ("image/png", b"<svg/>"),
        ("image/jpeg", b"contenido"),
    ],
)
async def test_upload_version_content_does_not_match_type(
    client: httpx.AsyncClient,
    test_db: AsyncIOMotorDatabase,
    project: dict,
    mock_upload: AsyncMock,
    content_type: str,
    content: bytes,
) -> None:
    response = await upload_version(
        client, project["id"], STUDENT_A_ID, content=content, content_type=content_type
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "El contenido del archivo no corresponde a su formato"}
    mock_upload.assert_not_awaited()
    assert await test_db.versions.count_documents({}) == 0


async def test_upload_version_too_large(
    client: httpx.AsyncClient,
    test_db: AsyncIOMotorDatabase,
    project: dict,
    mock_upload: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(get_settings(), "max_file_size_mb", 1)

    response = await upload_version(
        client, project["id"], STUDENT_A_ID, content=b"\x00" * (1024 * 1024 + 1)
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "El archivo supera el tamaño máximo permitido de 1 MB"}
    mock_upload.assert_not_awaited()


async def test_upload_version_empty_file(
    client: httpx.AsyncClient, project: dict, mock_upload: AsyncMock
) -> None:
    response = await upload_version(client, project["id"], STUDENT_A_ID, content=b"")

    assert response.status_code == 422
    assert response.json() == {"detail": "El archivo está vacío"}


async def test_upload_version_project_finalized(
    client: httpx.AsyncClient,
    test_db: AsyncIOMotorDatabase,
    project: dict,
    mock_upload: AsyncMock,
) -> None:
    first = (await upload_version(client, project["id"], STUDENT_A_ID)).json()
    await add_feedback(test_db, first["id"], is_final=True)

    # La calificación final de A solo bloquea a A: B sigue subiendo hasta que lo califiquen.
    response_a = await upload_version(client, project["id"], STUDENT_A_ID)
    response_b = await upload_version(client, project["id"], STUDENT_B_ID)

    assert response_a.status_code == 403
    assert response_a.json() == {
        "detail": "Ya tienes calificación final en este proyecto: no se aceptan más versiones"
    }
    assert response_b.status_code == 201

    await add_feedback(test_db, response_b.json()["id"], is_final=True)
    assert (await upload_version(client, project["id"], STUDENT_B_ID)).status_code == 403
    assert mock_upload.await_count == 2
    assert await test_db.versions.count_documents({}) == 2


async def test_upload_version_allowed_with_partial_feedback(
    client: httpx.AsyncClient,
    test_db: AsyncIOMotorDatabase,
    project: dict,
    mock_upload: AsyncMock,
) -> None:
    first = (await upload_version(client, project["id"], STUDENT_A_ID)).json()
    await add_feedback(test_db, first["id"], is_final=False)

    response = await upload_version(client, project["id"], STUDENT_A_ID)

    assert response.status_code == 201


async def test_versions_scoped_by_role(
    client: httpx.AsyncClient,
    test_db: AsyncIOMotorDatabase,
    project: dict,
    mock_upload: AsyncMock,
) -> None:
    a1 = (await upload_version(client, project["id"], STUDENT_A_ID, description="A1")).json()
    b1 = (await upload_version(client, project["id"], STUDENT_B_ID, description="B1")).json()
    a2 = (await upload_version(client, project["id"], STUDENT_A_ID, description="A2")).json()
    url = f"/api/v1/projects/{project['id']}/versions"

    # Estudiante A: solo lo suyo, aunque intente pedir el hilo de B por query param.
    own = await client.get(url, headers=student(STUDENT_A_ID))
    spoofed = await client.get(
        url, params={"student_id": STUDENT_B_ID}, headers=student(STUDENT_A_ID)
    )
    other_by_id = await client.get(f"{url}/{b1['id']}", headers=student(STUDENT_A_ID))
    own_by_id = await client.get(f"{url}/{a1['id']}", headers=student(STUDENT_A_ID))

    assert [v["id"] for v in own.json()] == [a1["id"], a2["id"]]
    assert [v["id"] for v in spoofed.json()] == [a1["id"], a2["id"]]
    assert other_by_id.status_code == 403
    assert own_by_id.status_code == 200
    assert own_by_id.json() == a1

    # Docente titular: todo el proyecto en orden cronológico, o el hilo de un estudiante.
    everything = await client.get(url, headers=teacher())
    only_b = await client.get(url, params={"student_id": STUDENT_B_ID}, headers=teacher())
    b_by_id = await client.get(f"{url}/{b1['id']}", headers=teacher())

    assert [v["id"] for v in everything.json()] == [a1["id"], b1["id"], a2["id"]]
    assert [v["id"] for v in only_b.json()] == [b1["id"]]
    assert b_by_id.json() == b1


async def test_versions_require_membership(
    client: httpx.AsyncClient, project: dict, mock_upload: AsyncMock
) -> None:
    version = (await upload_version(client, project["id"], STUDENT_A_ID)).json()
    url = f"/api/v1/projects/{project['id']}/versions"
    outsider_teacher = teacher(str(ObjectId()))

    assert (await client.get(url, headers=outsider_teacher)).status_code == 403
    assert (await client.get(f"{url}/{version['id']}", headers=outsider_teacher)).status_code == 403
    assert (await client.get(url, headers=student(str(ObjectId())))).status_code == 403


async def test_get_version_not_found(
    client: httpx.AsyncClient, project: dict, mock_upload: AsyncMock
) -> None:
    url = f"/api/v1/projects/{project['id']}/versions/{ObjectId()}"

    as_teacher = await client.get(url, headers=teacher())
    as_student = await client.get(url, headers=student(STUDENT_A_ID))

    assert as_teacher.status_code == 404
    assert as_teacher.json() == {"detail": "Versión no encontrada"}
    # Para un estudiante, "no existe" y "no es tuya" son indistinguibles.
    assert as_student.status_code == 403


async def test_upload_file_stores_blob_under_version_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    blob = MagicMock()
    blob.upload_blob = AsyncMock()
    blob.url = "https://account.blob.core.windows.net/versions/blob"
    container = MagicMock()
    container.create_container = AsyncMock()
    container.get_blob_client.return_value = blob
    monkeypatch.setattr(storage, "get_container_client", lambda: container)
    monkeypatch.setattr(storage.storage, "container_ready", False)
    file = UploadFile(
        file=io.BytesIO(b"contenido"),
        filename="../../boceto final.png",
        headers=Headers({"content-type": "image/png"}),
        size=9,
    )

    url = await storage.upload_file(file, "project-1", STUDENT_A_ID)

    assert url == blob.url
    blob_name = container.get_blob_client.call_args.args[0]
    assert re.fullmatch(
        rf"versions/project-1/{STUDENT_A_ID}/[0-9a-f]{{32}}_boceto final\.png", blob_name
    )
    data = blob.upload_blob.await_args.args[0]
    assert data == b"contenido"
    assert blob.upload_blob.await_args.kwargs["overwrite"] is False
    container.create_container.assert_awaited_once()


# ---- GET /projects/{id}/versions/{versionId}/file ----


@pytest.fixture
def mock_download(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """Reemplaza la descarga de Blob Storage; retorna PNG_BYTES como image/png."""
    mock = AsyncMock(return_value=(PNG_BYTES, "image/png"))
    monkeypatch.setattr("app.api.v1.versions.download_file", mock)
    return mock


async def test_get_version_file_owner_and_teacher(
    client: httpx.AsyncClient, project: dict, mock_upload: AsyncMock, mock_download: AsyncMock
) -> None:
    version = (await upload_version(client, project["id"], STUDENT_A_ID)).json()
    url = f"/api/v1/projects/{project['id']}/versions/{version['id']}/file"

    as_owner = await client.get(url, headers=student(STUDENT_A_ID))
    as_teacher = await client.get(url, headers=teacher())

    for response in (as_owner, as_teacher):
        assert response.status_code == 200
        assert response.content == PNG_BYTES
        assert response.headers["content-type"] == "image/png"
        assert response.headers["x-content-type-options"] == "nosniff"
        assert "private" in response.headers["cache-control"]
    mock_download.assert_awaited_with(version["file_url"])


async def test_get_version_file_forbidden_for_other_student(
    client: httpx.AsyncClient, project: dict, mock_upload: AsyncMock, mock_download: AsyncMock
) -> None:
    version = (await upload_version(client, project["id"], STUDENT_A_ID)).json()

    response = await client.get(
        f"/api/v1/projects/{project['id']}/versions/{version['id']}/file",
        headers=student(STUDENT_B_ID),
    )

    assert response.status_code == 403
    mock_download.assert_not_awaited()


async def test_get_version_file_version_not_found(
    client: httpx.AsyncClient, project: dict, mock_download: AsyncMock
) -> None:
    response = await client.get(
        f"/api/v1/projects/{project['id']}/versions/{ObjectId()}/file", headers=teacher()
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Versión no encontrada"}


async def test_get_version_file_blob_missing(
    client: httpx.AsyncClient,
    project: dict,
    mock_upload: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    version = (await upload_version(client, project["id"], STUDENT_A_ID)).json()
    monkeypatch.setattr(
        "app.api.v1.versions.download_file",
        AsyncMock(side_effect=NotFoundError("Archivo no encontrado")),
    )

    response = await client.get(
        f"/api/v1/projects/{project['id']}/versions/{version['id']}/file", headers=teacher()
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Archivo no encontrado"}


async def test_download_file_resolves_blob_name_from_url(monkeypatch: pytest.MonkeyPatch) -> None:
    stream = MagicMock()
    stream.readall = AsyncMock(return_value=b"contenido")
    stream.properties.content_settings.content_type = "image/png"
    blob = MagicMock()
    blob.download_blob = AsyncMock(return_value=stream)
    container = MagicMock()
    container.url = "http://azurite:10000/devstoreaccount1/versions"
    container.container_name = "versions"
    container.get_blob_client.return_value = blob
    monkeypatch.setattr(storage, "get_container_client", lambda: container)

    content, content_type = await storage.download_file(
        "http://azurite:10000/devstoreaccount1/versions/versions/p1/s1/abc_boceto%20final.png"
    )

    assert (content, content_type) == (b"contenido", "image/png")
    container.get_blob_client.assert_called_once_with("versions/p1/s1/abc_boceto final.png")


@pytest.mark.parametrize("declaration", [None, "false"])
async def test_upload_version_requires_rights_declaration(
    client: httpx.AsyncClient,
    test_db: AsyncIOMotorDatabase,
    project: dict,
    mock_upload: AsyncMock,
    declaration: str | None,
) -> None:
    data = {"description": "Sin declarar"}
    if declaration is not None:
        data["rights_declaration"] = declaration

    response = await client.post(
        f"/api/v1/projects/{project['id']}/versions",
        files={"file": ("boceto.png", PNG_BYTES, "image/png")},
        data=data,
        headers=student(STUDENT_A_ID),
    )

    assert response.status_code == 422
    assert "Debes declarar" in response.json()["detail"]
    mock_upload.assert_not_awaited()
    assert await test_db.versions.count_documents({}) == 0


async def test_upload_version_records_rights_declaration(
    client: httpx.AsyncClient, test_db: AsyncIOMotorDatabase, project: dict, mock_upload: AsyncMock
) -> None:
    version = (await upload_version(client, project["id"], STUDENT_A_ID)).json()

    doc = await test_db.versions.find_one({"_id": ObjectId(version["id"])})
    assert doc["rights_declared_at"] == doc["uploaded_at"]
