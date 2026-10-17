"""Composición del PDF del portafolio (RF-07 / CU-04) con ReportLab.

Solo recibe DTOs planos (`app/schemas/export.py`): no conoce MongoDB, Blob Storage ni Auth
Service, de modo que se prueba con datos de prueba sin infraestructura.

Dos documentos:

`build_portfolio_pdf` — portafolio de un estudiante en un proyecto (RF-07):
1. Portada: título del proyecto, estudiante, curso (y grupo) y fecha de generación.
2. Una página por versión, en orden cronológico, con su retroalimentación parcial.
3. Si existe calificación final (`is_final=True`), una página final destacada.

`build_student_portfolio_pdf` — portafolio académico del estudiante: los cursos y proyectos que
elija, con o sin comentarios, calificaciones e imágenes:
1. Portada con el resumen y el índice de cursos y proyectos.
2. Por cada proyecto (agrupados por curso): encabezado, descripción, sus versiones y, si se
   incluyen calificaciones, la calificación final.

Ambos llevan pie de página con el número de página y el nombre de la plataforma.

Todo texto libre de usuario pasa por `_text()`: `Paragraph` interpreta un mini-markup XML y un
`<` o `&` sin escapar rompería la generación completa.
"""

import logging
from datetime import UTC, datetime
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    CondPageBreak,
    Flowable,
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.schemas.export import (
    CoursePortfolio,
    FeedbackData,
    FileKind,
    PortfolioOptions,
    ProjectData,
    VersionWithFeedback,
)

logger = logging.getLogger(__name__)

PLATFORM_NAME = "Sistema de Seguimiento de Proyectos Gráficos"
NO_EVIDENCE_MESSAGE = "No hay evidencias registradas"
FILE_UNAVAILABLE_MESSAGE = "Archivo no disponible"
IMAGE_OMITTED_MESSAGE = "Vista previa omitida en este documento"
ALL_CONTENT = PortfolioOptions()
MAX_SCORE = 5.0

PAGE_MARGIN = 2 * cm
MAX_IMAGE_HEIGHT = 11 * cm
BOX_PADDING = 8

ACCENT = colors.HexColor("#1F4E79")
MUTED = colors.HexColor("#5F6B7A")
RULE = colors.HexColor("#D0D7DE")
HIGHLIGHT_BG = colors.HexColor("#EAF1F8")


def _build_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    body = base["BodyText"]
    return {
        "kicker": ParagraphStyle("kicker", parent=body, fontSize=9, textColor=MUTED),
        "cover_title": ParagraphStyle(
            "cover_title",
            parent=base["Title"],
            fontSize=26,
            leading=32,
            alignment=0,
            textColor=ACCENT,
            spaceBefore=6,
            spaceAfter=20,
        ),
        "h1": ParagraphStyle("h1", parent=base["Heading1"], textColor=ACCENT, spaceAfter=2),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], textColor=ACCENT, spaceBefore=14),
        "h3": ParagraphStyle("h3", parent=base["Heading3"], textColor=ACCENT, spaceBefore=10),
        "toc_course": ParagraphStyle(
            "toc_course", parent=body, fontName="Helvetica-Bold", spaceBefore=8
        ),
        "toc_project": ParagraphStyle("toc_project", parent=body, leftIndent=14, textColor=MUTED),
        "body": body,
        "meta": ParagraphStyle("meta", parent=body, fontSize=9, leading=12, textColor=MUTED),
        "label": ParagraphStyle("label", parent=body, fontName="Helvetica-Bold", textColor=MUTED),
        "note": ParagraphStyle("note", parent=body, fontName="Helvetica-Oblique", textColor=MUTED),
        # Cajas con fondo: se usan Paragraph (no Table) porque un Paragraph se puede partir
        # entre páginas; una celda de tabla más alta que la página aborta el build.
        "notice": ParagraphStyle(
            "notice",
            parent=body,
            backColor=HIGHLIGHT_BG,
            borderColor=ACCENT,
            borderWidth=0.5,
            borderPadding=BOX_PADDING,
            leftIndent=BOX_PADDING,
            rightIndent=BOX_PADDING,
            spaceBefore=BOX_PADDING + 4,
            spaceAfter=BOX_PADDING + 4,
        ),
        "feedback_header": ParagraphStyle(
            "feedback_header", parent=body, fontSize=9, textColor=MUTED, spaceBefore=10
        ),
        "feedback_comment": ParagraphStyle(
            "feedback_comment", parent=body, leftIndent=10, spaceAfter=4
        ),
        "final_score": ParagraphStyle(
            "final_score",
            parent=body,
            fontName="Helvetica-Bold",
            fontSize=40,
            leading=48,
            alignment=TA_CENTER,
            textColor=ACCENT,
            backColor=HIGHLIGHT_BG,
            borderPadding=(18, BOX_PADDING, 12, BOX_PADDING),
            leftIndent=BOX_PADDING,
            rightIndent=BOX_PADDING,
            spaceBefore=30,
            spaceAfter=30,
        ),
        "centered_meta": ParagraphStyle(
            "centered_meta", parent=body, fontSize=10, textColor=MUTED, alignment=TA_CENTER
        ),
        "final_score_inline": ParagraphStyle(
            "final_score_inline",
            parent=body,
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=28,
            textColor=ACCENT,
            spaceBefore=4,
            spaceAfter=4,
        ),
    }


STYLES = _build_styles()


def _text(value: str) -> str:
    """Escapa texto libre para `Paragraph` y conserva los saltos de línea."""
    return escape(value).replace("\n", "<br/>")


def _format_datetime(value: datetime) -> str:
    # Motor devuelve datetimes naive; por convención del sistema están en UTC.
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).strftime("%d/%m/%Y %H:%M UTC")


def _format_score(score: float) -> str:
    return f"{score:.1f} / {MAX_SCORE:.1f}"


def _draw_footer(canvas: Canvas, doc: SimpleDocTemplate) -> None:
    page_width = doc.pagesize[0]
    y = PAGE_MARGIN / 2
    canvas.saveState()
    canvas.setStrokeColor(RULE)
    canvas.line(doc.leftMargin, y + 12, page_width - doc.rightMargin, y + 12)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, y, PLATFORM_NAME)
    canvas.drawRightString(page_width - doc.rightMargin, y, f"Página {doc.page}")
    canvas.restoreState()


def _details_table(rows: list[tuple[str, str]], width: float) -> Table:
    label_width = 4.5 * cm
    table = Table(
        [
            [Paragraph(label, STYLES["label"]), Paragraph(_text(value), STYLES["body"])]
            for label, value in rows
        ],
        colWidths=[label_width, width - label_width],
    )
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, RULE),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def _rights_notice(student_name: str) -> str:
    """Aviso de derechos de autor (Ley 23 de 1982): la obra es del estudiante, no de la app."""
    return (
        f"<b>Derechos de autor.</b> Las obras de este portafolio son de {_text(student_name)}, "
        "quien conserva sus derechos morales y patrimoniales (Ley 23 de 1982). El documento se "
        "generó con fines académicos; reproducirlo, distribuirlo o usarlo con fines comerciales "
        "requiere autorización de su autor."
    )


def _group_label(project: ProjectData) -> str | None:
    if project.group_name is None:
        return None
    members = ", ".join(project.group_members)
    return f"{project.group_name} ({members})" if members else project.group_name


def _cover(
    project: ProjectData,
    student_name: str,
    course_name: str,
    version_count: int,
    width: float,
) -> list[Flowable]:
    rows = [("Estudiante", student_name), ("Curso", course_name)]
    group = _group_label(project)
    if group:
        rows.append(("Grupo", group))
    rows += [
        ("Fecha de generación", _format_datetime(datetime.now(UTC))),
        ("Versiones registradas", str(version_count)),
    ]
    story: list[Flowable] = [
        Paragraph(PLATFORM_NAME.upper(), STYLES["kicker"]),
        Spacer(1, 2.5 * cm),
        Paragraph("Portafolio de proyecto", STYLES["kicker"]),
        Paragraph(_text(project.title), STYLES["cover_title"]),
        _details_table(rows, width),
        Paragraph("Descripción del proyecto", STYLES["h2"]),
        Paragraph(_text(project.description), STYLES["body"]),
        Paragraph(_rights_notice(student_name), STYLES["meta"]),
    ]
    if version_count == 0:
        # Flujo alternativo A1 de CU-04: el PDF se genera igual, sin evidencias.
        story.append(
            Paragraph(
                f"<b>{NO_EVIDENCE_MESSAGE}</b><br/>"
                "El estudiante aún no ha subido versiones de este proyecto.",
                STYLES["notice"],
            )
        )
    return story


def _image_flowable(data: bytes, max_width: float) -> Image | None:
    """Imagen escalada al espacio disponible, o None si los bytes no son una imagen válida."""
    try:
        reader = ImageReader(BytesIO(data))
        width, height = reader.getSize()
        # getSize() solo lee la cabecera: decodificar ahora detecta archivos truncados que,
        # de lo contrario, harían fallar doc.build() y abortarían toda la exportación.
        reader.getRGBData()
    except Exception as exc:  # PIL lanza tipos muy variados según el formato y el daño
        logger.warning("Imagen no decodificable, se sustituye por una nota: %s", exc)
        return None
    scale = min(max_width / width, MAX_IMAGE_HEIGHT / height, 1.0)
    return Image(BytesIO(data), width=width * scale, height=height * scale)


def _attachment(
    version: VersionWithFeedback, width: float, include_images: bool = True
) -> list[Flowable]:
    caption = Paragraph(f"Archivo: {_text(version.file_name)}", STYLES["meta"])
    if version.file_kind is FileKind.IMAGE and not include_images:
        return [caption, Paragraph(IMAGE_OMITTED_MESSAGE, STYLES["note"])]
    if version.file_kind is FileKind.DOCUMENT:
        # ReportLab no embebe PDF/SVG de forma trivial: se lista el archivo.
        return [
            caption,
            Paragraph(
                "Este archivo no se incrusta en el documento. "
                "El original está disponible en la plataforma.",
                STYLES["notice"],
            ),
        ]
    image = _image_flowable(version.image_data, width) if version.image_data else None
    if image is None:
        return [caption, Paragraph(f"<b>{FILE_UNAVAILABLE_MESSAGE}</b>", STYLES["notice"])]
    return [image, Spacer(1, 4), caption]


def _score_label(feedback: FeedbackData, include_grades: bool = True) -> str:
    if feedback.score is None or not include_grades:
        return ""  # comentario sin calificación
    if feedback.score_replaced:
        return (
            f" · Calificación parcial reemplazada: <strike>{_format_score(feedback.score)}</strike>"
        )
    return f" · Calificación parcial: <b>{_format_score(feedback.score)}</b>"


def _feedback_entry(feedback: FeedbackData, include_grades: bool = True) -> list[Flowable]:
    header = (
        f"<b>{_text(feedback.teacher_name)}</b> · {_format_datetime(feedback.created_at)}"
        f"{_score_label(feedback, include_grades)}"
    )
    return [
        Paragraph(header, STYLES["feedback_header"]),
        Paragraph(_text(feedback.comment), STYLES["feedback_comment"]),
    ]


def _current_partial_score(version: VersionWithFeedback) -> float | None:
    """Calificación parcial vigente: con nota, no final y no reemplazada (a lo sumo una)."""
    for feedback in reversed(version.feedback):
        if not feedback.is_final and not feedback.score_replaced and feedback.score is not None:
            return feedback.score
    return None


def _version_section(
    version: VersionWithFeedback,
    width: float,
    options: PortfolioOptions = ALL_CONTENT,
    level: int = 1,
) -> list[Flowable]:
    """Una versión. `level` es el nivel de su título: 1 en el portafolio de un proyecto, 2 dentro
    del portafolio académico (donde el proyecto ocupa el nivel 1)."""
    title, subtitle = STYLES[f"h{level}"], STYLES[f"h{level + 1}"]
    uploaded = f"Subida el {_format_datetime(version.uploaded_at)}"
    if version.uploaded_by:
        uploaded += f" por {_text(version.uploaded_by)}"
    story: list[Flowable] = [
        Paragraph(f"Versión {version.number}", title),
        Paragraph(uploaded, STYLES["meta"]),
        Paragraph("Descripción", subtitle),
        Paragraph(_text(version.description), STYLES["body"]),
        Spacer(1, 10),
        *_attachment(version, width, options.include_images),
    ]
    partial = [feedback for feedback in version.feedback if not feedback.is_final]
    if options.include_feedback:
        story.append(Paragraph("Retroalimentación", subtitle))
        for feedback in partial:
            story += _feedback_entry(feedback, options.include_grades)
        if not partial:
            story.append(Paragraph("Sin retroalimentación para esta versión.", STYLES["note"]))
    elif options.include_grades:
        # Sin comentarios, la nota parcial vigente sigue siendo útil como resumen.
        score = _current_partial_score(version)
        if score is not None:
            story.append(
                Paragraph(f"Calificación parcial: <b>{_format_score(score)}</b>", STYLES["meta"])
            )
    if options.include_grades and len(partial) < len(version.feedback):
        story.append(
            Paragraph(
                "Esta versión recibió la calificación final del proyecto (ver más adelante).",
                STYLES["note"],
            )
        )
    return story


def _find_final_grade(
    versions: list[VersionWithFeedback],
) -> tuple[FeedbackData, VersionWithFeedback] | None:
    for version in versions:
        for feedback in version.feedback:
            if feedback.is_final:
                return feedback, version
    return None


def _final_grade_section(final: FeedbackData, version: VersionWithFeedback) -> list[Flowable]:
    return [
        Paragraph("Calificación final", STYLES["h1"]),
        # La calificación final siempre trae nota (Feedback Service la exige).
        Paragraph(_format_score(final.score or 0.0), STYLES["final_score"]),
        Paragraph(
            f"Asignada por <b>{_text(final.teacher_name)}</b> el "
            f"{_format_datetime(final.created_at)} · Versión evaluada: {version.number}",
            STYLES["centered_meta"],
        ),
        Paragraph("Comentario", STYLES["h2"]),
        Paragraph(_text(final.comment), STYLES["notice"]),
    ]


def build_portfolio_pdf(
    project: ProjectData,
    versions: list[VersionWithFeedback],
    student_name: str,
    course_name: str,
) -> bytes:
    """Construye el PDF descrito en la sección 3.1 y retorna los bytes del documento.

    `versions` (y la retroalimentación de cada una) debe venir en orden cronológico.
    Páginas resultantes, si ninguna sección desborda: 1 (portada) + una por versión
    + 1 si existe calificación final.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=PAGE_MARGIN,
        rightMargin=PAGE_MARGIN,
        topMargin=PAGE_MARGIN,
        bottomMargin=PAGE_MARGIN,
        title=f"Portafolio - {project.title} - {student_name}",
        # Metadatos: el autor de las obras es el estudiante; la plataforma solo genera el PDF.
        author=student_name,
        creator=PLATFORM_NAME,
    )

    story = _cover(project, student_name, course_name, len(versions), doc.width)
    for version in versions:
        story += [PageBreak(), *_version_section(version, doc.width)]
    final_grade = _find_final_grade(versions)
    if final_grade is not None:
        story += [PageBreak(), *_final_grade_section(*final_grade)]

    doc.build(story, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
    return buffer.getvalue()


def _contents_label(options: PortfolioOptions) -> str:
    parts = ["versiones"]
    if options.include_feedback:
        parts.append("comentarios del docente")
    if options.include_grades:
        parts.append("calificaciones")
    if not options.include_images:
        parts.append("sin vista previa de imágenes")
    return ", ".join(parts).capitalize()


def _student_cover(
    student_name: str, courses: list[CoursePortfolio], options: PortfolioOptions, width: float
) -> list[Flowable]:
    projects = [p for course in courses for p in course.projects]
    story: list[Flowable] = [
        Paragraph(PLATFORM_NAME.upper(), STYLES["kicker"]),
        Spacer(1, 2.5 * cm),
        Paragraph("Portafolio académico", STYLES["kicker"]),
        Paragraph(_text(student_name), STYLES["cover_title"]),
        _details_table(
            [
                ("Cursos", str(len(courses))),
                ("Proyectos", str(len(projects))),
                ("Versiones", str(sum(len(p.versions) for p in projects))),
                ("Contenido", _contents_label(options)),
                ("Fecha de generación", _format_datetime(datetime.now(UTC))),
            ],
            width,
        ),
        Paragraph("Contenido", STYLES["h2"]),
    ]
    for course in courses:
        story.append(Paragraph(_text(course.name), STYLES["toc_course"]))
        for item in course.projects:
            count = len(item.versions)
            label = f"{count} versión" if count == 1 else f"{count} versiones"
            story.append(Paragraph(f"{_text(item.project.title)} · {label}", STYLES["toc_project"]))
    story.append(Paragraph(_rights_notice(student_name), STYLES["meta"]))
    return story


def _inline_final_grade(final: FeedbackData, version: VersionWithFeedback) -> list[Flowable]:
    return [
        Paragraph("Calificación final", STYLES["h2"]),
        Paragraph(_format_score(final.score or 0.0), STYLES["final_score_inline"]),
        Paragraph(
            f"Asignada por <b>{_text(final.teacher_name)}</b> el "
            f"{_format_datetime(final.created_at)} · Versión evaluada: {version.number}",
            STYLES["meta"],
        ),
        Paragraph(_text(final.comment), STYLES["notice"]),
    ]


def build_student_portfolio_pdf(
    student_name: str, courses: list[CoursePortfolio], options: PortfolioOptions
) -> bytes:
    """Portafolio académico: varios cursos y proyectos del estudiante en un solo documento.

    `courses` llega en el orden en que se presentan, cada uno con sus proyectos y las versiones
    de cada proyecto en orden cronológico.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=PAGE_MARGIN,
        rightMargin=PAGE_MARGIN,
        topMargin=PAGE_MARGIN,
        bottomMargin=PAGE_MARGIN,
        title=f"Portafolio académico - {student_name}",
        author=student_name,
        creator=PLATFORM_NAME,
    )

    story = _student_cover(student_name, courses, options, doc.width)
    for course in courses:
        for item in course.projects:
            project = item.project
            story += [
                PageBreak(),
                Paragraph(_text(course.name), STYLES["kicker"]),
                Paragraph(_text(project.title), STYLES["h1"]),
            ]
            group = _group_label(project)
            if group:
                story.append(Paragraph(f"Grupo: {_text(group)}", STYLES["meta"]))
            if project.description:
                story.append(Paragraph(_text(project.description), STYLES["body"]))
            if not item.versions:
                story.append(Paragraph(f"<b>{NO_EVIDENCE_MESSAGE}</b>", STYLES["notice"]))
            for version in item.versions:
                # Evita que el título de una versión quede solo al pie de una página.
                story += [CondPageBreak(6 * cm), *_version_section(version, doc.width, options, 2)]
            final_grade = _find_final_grade(item.versions) if options.include_grades else None
            if final_grade is not None:
                story += [CondPageBreak(6 * cm), *_inline_final_grade(*final_grade)]

    doc.build(story, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
    return buffer.getvalue()
