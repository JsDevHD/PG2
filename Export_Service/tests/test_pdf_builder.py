"""Tests unitarios de `build_portfolio_pdf`: datos planos, sin MongoDB ni Blob Storage."""

import base64
from datetime import UTC, datetime, timedelta
from io import BytesIO

import pytest
from pypdf import PdfReader

from app.core.pdf_builder import (
    FILE_UNAVAILABLE_MESSAGE,
    NO_EVIDENCE_MESSAGE,
    PLATFORM_NAME,
    build_portfolio_pdf,
)
from app.schemas.export import FeedbackData, FileKind, ProjectData, VersionWithFeedback

# PNG válido de 1x1 píxel.
PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)
START = datetime(2026, 3, 2, 14, 30, tzinfo=UTC)
PROJECT = ProjectData(id="p1", title="Identidad visual", description="Logo y manual de marca.")
STUDENT_NAME = "Ana Díaz"
COURSE_NAME = "Diseño Gráfico I"


def _version(number: int, **overrides) -> VersionWithFeedback:
    data = {
        "number": number,
        "description": f"Descripción de la versión {number}",
        "uploaded_at": START + timedelta(days=number),
        "file_name": f"boceto_{number}.png",
        "file_kind": FileKind.IMAGE,
        "image_data": PNG_1X1,
        "feedback": [
            FeedbackData(
                teacher_name="Julián Estupiñán",
                comment=f"Comentario sobre la versión {number}",
                score=4.0,
                created_at=START + timedelta(days=number, hours=2),
            )
        ],
    }
    return VersionWithFeedback(**(data | overrides))


def _pages_text(pdf: bytes) -> list[str]:
    return [page.extract_text() for page in PdfReader(BytesIO(pdf)).pages]


@pytest.mark.parametrize("version_count", [1, 3])
def test_pdf_builder_structure(version_count: int) -> None:
    versions = [_version(number) for number in range(1, version_count + 1)]

    pdf = build_portfolio_pdf(PROJECT, versions, STUDENT_NAME, COURSE_NAME)

    assert pdf.startswith(b"%PDF")
    pages = _pages_text(pdf)
    assert len(pages) >= 1
    # Portada + una página por versión (sin calificación final).
    assert len(pages) == 1 + version_count
    cover = pages[0]
    assert PROJECT.title in cover
    assert STUDENT_NAME in cover
    assert COURSE_NAME in cover
    for number in range(1, version_count + 1):
        assert f"Versión {number}" in pages[number]
        assert f"Comentario sobre la versión {number}" in pages[number]
        assert "4.0 / 5.0" in pages[number]
    for page_number, text in enumerate(pages, start=1):
        assert f"Página {page_number}" in text
        assert PLATFORM_NAME in text


def test_pdf_builder_empty_project_shows_no_evidence_message() -> None:
    pdf = build_portfolio_pdf(PROJECT, [], STUDENT_NAME, COURSE_NAME)

    pages = _pages_text(pdf)
    assert len(pages) == 1
    assert NO_EVIDENCE_MESSAGE in pages[0]


def test_pdf_builder_final_grade_section() -> None:
    final = FeedbackData(
        teacher_name="Julián Estupiñán",
        comment="Proyecto sólido y coherente.",
        score=4.5,
        is_final=True,
        created_at=START + timedelta(days=10),
    )
    versions = [_version(1), _version(2)]
    versions[1].feedback.append(final)

    pages = _pages_text(build_portfolio_pdf(PROJECT, versions, STUDENT_NAME, COURSE_NAME))

    # Portada + 2 versiones + página final destacada.
    assert len(pages) == 4
    assert "Calificación final" in pages[-1]
    assert "4.5 / 5.0" in pages[-1]
    assert "Proyecto sólido y coherente." in pages[-1]
    assert "Versión evaluada: 2" in pages[-1]
    # La nota final no se repite como retroalimentación parcial de la versión.
    assert "4.5 / 5.0" not in pages[2]


def test_pdf_builder_does_not_abort_on_unusable_files() -> None:
    versions = [
        _version(1, image_data=None),  # ya no está en Blob Storage
        _version(2, image_data=PNG_1X1[:40]),  # imagen truncada
        _version(3, image_data=b"no es una imagen"),
        _version(4, file_name="afiche.pdf", file_kind=FileKind.DOCUMENT, image_data=None),
    ]

    pages = _pages_text(build_portfolio_pdf(PROJECT, versions, STUDENT_NAME, COURSE_NAME))

    assert len(pages) == 5
    for page in pages[1:4]:
        assert FILE_UNAVAILABLE_MESSAGE in page
    assert "afiche.pdf" in pages[4]
    assert "disponible en la plataforma" in pages[4]


def test_pdf_builder_escapes_user_markup() -> None:
    # Paragraph interpreta XML: texto de usuario con < o & no debe romper la generación.
    project = ProjectData(id="p1", title="Logo <b>A & B</b>", description="Uso de <br> & <i>")
    version = _version(1, description='Versión con <script> & comillas "dobles"')

    pages = _pages_text(build_portfolio_pdf(project, [version], STUDENT_NAME, COURSE_NAME))

    assert "Logo <b>A & B</b>" in pages[0]
    assert "<script> &" in pages[1]
