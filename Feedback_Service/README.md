# feedback-service

Microservicio de retroalimentación del **Sistema de Seguimiento de Proyectos Gráficos**
(RF-05 comentario y calificación parcial, RF-06 historial, RF-09 calificación final; CU-03).
Construido a partir de `service-template/`; lo transversal (config, verificación de JWT, Mongo,
errores, Docker) está documentado allí.

**Política de acceso a datos:**

- **Escribe** únicamente en la colección `feedback` (es su dueño exclusivo).
- **Lee** (sin escribir, directo a Mongo) `versions`, `projects` y `courses` de Projects Service,
  para validar que la versión exista y que quien opera sea el docente titular o un estudiante
  matriculado (H-6). Todas esas lecturas están en `app/db/projects_readonly.py`.
- **No** llama a Auth Service: la respuesta trae ids (`teacher_id`, `student_id`); resolver
  nombres es responsabilidad de quien la consume.

## Endpoints

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/v1/versions/{version_id}/feedback` | Docente titular | `{comment, score}` → `201 FeedbackResponse` (parcial) |
| GET | `/api/v1/versions/{version_id}/feedback` | Ambos (con pertenencia) | Historial de la versión |
| GET | `/api/v1/projects/{project_id}/feedback` | Ambos (con pertenencia) | Historial del proyecto |
| POST | `/api/v1/projects/{project_id}/final-grade` | Docente titular | `{version_id, comment, score}` → `201 FeedbackResponse` (final) |
| GET | `/api/v1/projects/{project_id}/final-grade` | Ambos (con pertenencia) | Calificaciones finales del proyecto |
| GET | `/health` | No | Probe de salud |

`FeedbackResponse`:
`{id, version_id, project_id, student_id, teacher_id, comment, score, is_final, created_at}`.
Los listados son `list[FeedbackResponse]` en orden cronológico (`created_at` ascendente).

**Alcance por rol** (mismo criterio que Projects Service):

- **Estudiante:** solo accede a lo de sus propias versiones. Pedir la retroalimentación de una
  versión ajena → `403`. En los endpoints de proyecto debe estar matriculado en el curso, y el
  filtro `student_id = current_user.id` se aplica siempre.
- **Docente:** solo el titular del curso; ve la retroalimentación de todos los estudiantes.

**Errores:**

| Código | Cuándo |
|---|---|
| `401` | Token ausente, inválido o expirado |
| `403` | Rol incorrecto para la operación, o sin pertenencia al curso/versión (H-6) |
| `404` | `Versión no encontrada` / `Proyecto no encontrado` (también si el id está mal formado) |
| `409` | `El estudiante ya tiene una calificación final en este proyecto` |
| `422` | `score` fuera de `[0.0, 5.0]`, `comment` vacío, o `La versión no pertenece a este proyecto` |

## Reglas de negocio

- `score` en `[0.0, 5.0]`, validado por Pydantic. El redondeo a un decimal lo hace el frontend.
- Los comentarios no se editan ni se eliminan (RNF-08): no hay `PATCH` ni `DELETE`.
- El docente puede seguir comentando una versión después de la calificación final.
- **Una calificación final por estudiante y proyecto**, no revertible en el MVP. Varios
  estudiantes suben versiones al mismo proyecto, así que la regla es por estudiante (el Export
  Service también genera un portafolio por estudiante y proyecto). La hace cumplir el índice
  único parcial `unique_final_grade_per_student`; un `DuplicateKeyError` se traduce a `409`,
  incluso si llegan dos peticiones simultáneas.
- `GET .../final-grade` devuelve una lista: vacía si aún no hay calificación final; para el
  estudiante, a lo sumo un elemento (la suya).

## Colección `feedback`

| Campo | Tipo | Nota |
|---|---|---|
| `_id` | ObjectId | |
| `version_id` | string | |
| `project_id` | string | Copiado de la versión (inmutable, RNF-08) |
| `student_id` | string | Copiado de la versión: autor de la versión evaluada |
| `teacher_id` | string | |
| `comment` | string | |
| `score` | float | `0.0`–`5.0` |
| `is_final` | bool | `true` solo en la calificación final (RF-09) |
| `created_at` | datetime | UTC |

Índices (creados al arrancar, `app/db/init_indexes.py`): `version_id`;
`(project_id, student_id, created_at)`; y `(project_id, student_id)` único parcial con
`is_final: true`.

**Para Projects Service y Export Service:** para saber si un estudiante ya tiene calificación
final en un proyecto, consultar
`db.feedback.find_one({"project_id": ..., "student_id": ..., "is_final": True})`.

## Estructura propia del servicio

```
app/
├── api/deps.py                # + get_current_teacher y verificaciones H-6 compartidas
├── api/v1/feedback.py         # los cinco endpoints
├── db/init_indexes.py         # índices de `feedback`, invocado desde el lifespan
├── db/projects_readonly.py    # lecturas read-only de versions / projects / courses
├── models/feedback.py         # FeedbackInDB
├── models/projects.py         # vistas read-only de los documentos de Projects Service
└── schemas/feedback.py        # requests y responses
```

El resto es el template sin cambios, salvo `db/mongodb.py` (cliente con `tz_aware=True` para que
las fechas leídas de Mongo se serialicen en UTC) y `exceptions.py` (nueva `UnprocessableError`,
422).

## Levantar el servicio

```bash
cp .env.example .env
docker compose up --build
```

- Salud: <http://localhost:8000/health> → `{"status": "ok", "service": "feedback-service"}`
- OpenAPI: <http://localhost:8000/docs>

Al arrancar, el servicio crea los índices de `feedback`, así que necesita MongoDB disponible.

## Tests

Requieren un MongoDB en `MONGODB_URI` (por defecto `mongodb://localhost:27017`); usan la base
`graphic_tracker_test`, que se vacía antes y después de cada test. Los documentos de Projects
Service se siembran directamente en esa base.

```bash
docker compose up -d mongo
pip install -r requirements-dev.txt
pytest
```

## Linter

```bash
ruff check .
ruff format --check .
```

## Variables de entorno

Las mismas del template (ver `.env.example`); este servicio no agrega ninguna.
`SERVICE_NAME=feedback-service`, y `JWT_SECRET_KEY` debe ser **idéntica** en los cuatro servicios.
