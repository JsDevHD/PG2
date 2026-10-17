"""Carga datos de demostración a través del API Gateway (solo para desarrollo local).

    .venv\\Scripts\\python scripts\\seed_demo.py            # gateway en http://localhost:8080
    .venv\\Scripts\\python scripts\\seed_demo.py <url-gateway>

Crea un docente, tres estudiantes, un curso con dos proyectos, versiones con imágenes generadas y
retroalimentación. Es idempotente en las cuentas: si ya existen, inicia sesión con ellas (los
cursos y versiones sí se crean de nuevo en cada ejecución).

Cuentas de prueba (contraseña común: variable de entorno DEMO_PASSWORD o la constante del mismo nombre):
    docente:     docente.demo@udi.edu.co
    estudiantes: ana.diaz@udi.edu.co, camila.lopera@udi.edu.co, gabriel.guevara@udi.edu.co
"""

import os
import struct
import sys
import zlib

import httpx

GATEWAY = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
# En un despliegue público (Azure) se pasa otra contraseña por la variable de entorno DEMO_PASSWORD:
# la de abajo está en el repositorio y cualquiera que lo lea podría entrar.
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD") or "demo-graficos-2026"
# Versión de los documentos legales aceptados (frontend/src/features/legal/legalConfig.ts).
LEGAL_VERSION = "2026-10-08"

TEACHER = ("Laura Méndez", "docente.demo@udi.edu.co")
STUDENTS = [
    ("Ana Díaz", "ana.diaz@udi.edu.co"),
    ("Camila Lopera", "camila.lopera@udi.edu.co"),
    ("Gabriel Guevara", "gabriel.guevara@udi.edu.co"),
]


def png(
    width: int, height: int, top: tuple[int, int, int], bottom: tuple[int, int, int]
) -> bytes:
    """PNG con un degradado vertical y una franja diagonal, sin dependencias externas."""
    rows = []
    for y in range(height):
        t = y / (height - 1)
        base = [round(a + (b - a) * t) for a, b in zip(top, bottom, strict=True)]
        row = bytearray([0])
        for x in range(width):
            band = (
                abs((x - y * width / height) % (width // 2) - width // 4) < width // 16
            )
            row += bytes(min(255, c + 60) for c in base) if band else bytes(base)
        rows.append(bytes(row))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data))
        )

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
        + chunk(b"IEND", b"")
    )


def session(client: httpx.Client, name: str, email: str, role: str) -> dict[str, str]:
    client.post(
        f"{GATEWAY}/api/v1/auth/register",
        json={
            "name": name,
            "email": email,
            "password": DEMO_PASSWORD,
            "role": role,
            "accept_legal": True,  # autorización de datos y términos (obligatoria)
            "legal_version": LEGAL_VERSION,
        },
    )  # 409 si ya existe: se ignora y se inicia sesión
    response = client.post(
        f"{GATEWAY}/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD}
    )
    response.raise_for_status()
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def main() -> None:
    with httpx.Client(timeout=60) as client:
        teacher = session(client, *TEACHER, "docente")
        students = [
            session(client, name, email, "estudiante") for name, email in STUDENTS
        ]

        course = client.post(
            f"{GATEWAY}/api/v1/courses",
            json={"name": "Diseño Gráfico III"},
            headers=teacher,
        ).json()
        for headers in students:
            client.post(
                f"{GATEWAY}/api/v1/courses/join",
                json={"course_code": course["course_code"]},
                headers=headers,
            ).raise_for_status()

        projects = [
            client.post(
                f"{GATEWAY}/api/v1/courses/{course['id']}/projects",
                json={"title": title, "description": description},
                headers=teacher,
            ).json()
            for title, description in [
                (
                    "Rediseño de marca",
                    "Identidad visual para una marca local: logotipo, paleta y aplicaciones.",
                ),
                (
                    "Cartel evento cultural",
                    "Cartel en formato 50 × 70 cm para el festival.",
                ),
            ]
        ]

        palettes = [
            ((108, 142, 191), (31, 41, 55)),
            ((150, 115, 166), (218, 232, 252)),
            ((130, 179, 102), (31, 41, 55)),
            ((215, 155, 0), (184, 84, 80)),
        ]
        plan = {  # versiones por estudiante en el primer proyecto
            0: [
                "Boceto inicial del logotipo",
                "Segunda propuesta de logo",
                "Ajuste de tipografía y paleta",
            ],
            1: ["Primera exploración de color"],
            2: ["Propuesta con retícula modular", "Versión con jerarquía corregida"],
        }
        comments = [
            ("Buena exploración. Prueba una tipografía con más contraste.", 3.6),
            ("La paleta funciona; ajusta el espaciado del isotipo.", 4.2),
        ]
        for index, descriptions in plan.items():
            for n, description in enumerate(descriptions):
                top, bottom = palettes[(index + n) % len(palettes)]
                version = client.post(
                    f"{GATEWAY}/api/v1/projects/{projects[0]['id']}/versions",
                    files={
                        "file": (
                            f"v{n + 1}.png",
                            png(320, 240, top, bottom),
                            "image/png",
                        )
                    },
                    data={"description": description, "rights_declaration": "true"},
                    headers=students[index],
                ).json()
                if (
                    n < len(descriptions) - 1 or index == 2
                ):  # la última de Ana queda pendiente
                    comment, score = comments[n % len(comments)]
                    client.post(
                        f"{GATEWAY}/api/v1/versions/{version['id']}/feedback",
                        json={"comment": comment, "score": score},
                        headers=teacher,
                    ).raise_for_status()

        print(f"Curso: {course['name']} — código {course['course_code']}")
        print(
            f"Docente: {TEACHER[1]} | Estudiantes: {', '.join(e for _, e in STUDENTS)}"
        )
        print("Contraseña de todas las cuentas: la variable DEMO_PASSWORD o, si no existe, la de " + __file__)


if __name__ == "__main__":
    main()
