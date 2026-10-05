# projects-service

Microservicio de cursos, proyectos y versiones del **Sistema de Seguimiento de Proyectos
Gráficos** (FastAPI + MongoDB). Derivado de `service-template/`; este README documenta solo lo
propio del servicio. Especificación: `03_Projects_Service_Especificacion.md`.

**Resuelve:** RF-02, RF-03, RF-04 y RF-08 (el progreso lee la retroalimentación de Feedback
Service). **Casos de uso:** CU-01 (unirse a un curso) y CU-02 (subir versión).

## Acceso a datos

| Colección | Acceso | Para qué |
|---|---|---|
| `courses`, `projects`, `versions` | Lectura y escritura (dueño exclusivo) | Núcleo del dominio |
| `feedback` (Feedback Service) | Solo lectura | Bloquear versiones tras la calificación final y calcular progreso |
| `users` (Auth Service) | **Nunca** | Los nombres se piden por HTTP a `GET /api/v1/users/batch` |

Índices creados en el `lifespan` (`app/db/indexes.py`): `courses.course_code` (único),
`projects.course_id` y `versions(project_id, student_id, uploaded_at)`.

## Endpoints

Todos requieren `Authorization: Bearer <token>` emitido por Auth Service.

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/v1/courses` | Docente | Crea un curso con `course_code` de 6 caracteres |
| GET | `/api/v1/courses` | Ambos | Cursos propios (docente) o matriculados (estudiante) |
| POST | `/api/v1/courses/join` | Estudiante | Se matricula con el código (idempotente) |
| POST | `/api/v1/courses/{course_id}/projects` | Docente titular | Crea un proyecto |
| GET | `/api/v1/courses/{course_id}/projects` | Miembro del curso | Lista los proyectos |
| POST | `/api/v1/projects/{project_id}/versions` | Estudiante matriculado | Sube una versión (`multipart/form-data`: `file`, `description`) |
| GET | `/api/v1/projects/{project_id}/versions` | Miembro del curso | Historial cronológico (alcance por rol) |
| GET | `/api/v1/projects/{project_id}/versions/{version_id}` | Miembro del curso | Detalle de una versión |
| GET | `/api/v1/courses/{course_id}/progress` | Miembro del curso | Progreso (forma según el rol) |

"Miembro del curso" = docente titular (`teacher_id`) o estudiante matriculado (`student_ids`).
La verificación está centralizada en `app/api/access.py`.

### Reglas que conviene conocer

- **Alcance por rol en versiones:** un estudiante solo ve sus propias versiones; el filtro
  `student_id = <él mismo>` se fuerza en Mongo e ignora el query param `?student_id`. El docente
  titular ve todas y puede filtrar con `?student_id=...`. Si un estudiante pide por id una
  versión que no es suya **o que no existe**, recibe 403 en ambos casos, así no puede sondear qué
  versiones de sus compañeros existen.
- **Subida (CU-02), en este orden:** pertenencia (403) → formato JPG/PNG/PDF/SVG y tamaño
  ≤ `MAX_FILE_SIZE_MB` (422) → sin calificación final en el proyecto (403) → Blob Storage →
  `versions`. No existen `PUT` ni `DELETE` de versiones (RNF-08), y el blob se sube con
  `overwrite=False`.
- **Progreso:** `versiones con ≥ 1 retroalimentación / total de versiones × 100` (redondeado a 2
  decimales; 0.0 si no hay versiones). El docente ve el total del curso y el desglose de cada
  matriculado, incluso de los que no han subido nada. Si Auth Service no responde, la respuesta
  sale igual con `student_name: null` y se registra un warning.
- Si Blob Storage falla al subir, la respuesta es `503 {"detail": ...}`.

## Levantar el servicio localmente

```bash
cp .env.example .env
docker compose up --build
```

Levanta el servicio, MongoDB y **Azurite** (emulador de Blob Storage). El contenedor de blobs se
crea solo en la primera subida.

- Salud: <http://localhost:8000/health>
- Documentación OpenAPI: <http://localhost:8000/docs>

Notas de entorno local:

- `AUTH_SERVICE_URL` apunta a `http://auth-service:8000`. Si Auth Service no está en la misma
  red, el panel de progreso funciona igual pero sin nombres (`student_name: null`).
- Con Azurite, las `file_url` usan el host interno `azurite:10000`, así que no se pueden abrir
  desde el navegador del host. En Azure, la URL es la del blob; para servirla directamente al
  navegador el contenedor necesita acceso de lectura anónimo o URLs firmadas (SAS).

Sin Docker: igual que en el template (`pip install -r requirements-dev.txt` y
`uvicorn app.main:app --reload`), con MongoDB y Azurite (o una cuenta de Azure) accesibles según
`.env`.

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

Requieren un MongoDB activo (base `graphic_tracker_test`, ver `tests/conftest.py`). Blob Storage y
Auth Service **no** se contactan: la subida se reemplaza con el fixture `mock_upload` y las
llamadas a Auth Service se interceptan con `respx`.

| Archivo | Cubre |
|---|---|
| `tests/test_courses.py` | Crear y listar cursos, unirse (éxito, código inválido, idempotencia), titularidad al crear proyectos |
| `tests/test_versions.py` | Subida (éxito, H-6, RNF-05, calificación final), alcance por rol, ruta del blob |
| `tests/test_progress.py` | Vista de estudiante y de docente, degradación si Auth Service falla |

```bash
ruff check .
ruff format --check .
```

## Variables de entorno

Además de las del template (`SERVICE_NAME=projects-service`):

| Variable | Default | Descripción |
|---|---|---|
| `AZURE_STORAGE_CONNECTION_STRING` | — (obligatoria) | Cadena de conexión de Blob Storage (Azurite en local) |
| `AZURE_STORAGE_CONTAINER` | `versions` | Contenedor donde se guardan los archivos |
| `MAX_FILE_SIZE_MB` | `20` | Tamaño máximo por archivo (RNF-05) |
| `AUTH_SERVICE_URL` | `http://auth-service:8000` | Base URL de Auth Service |

## Dependencias con otros servicios

- **Auth Service** debe exponer `GET /api/v1/users/batch?ids=a,b,c` (máximo 100 ids por llamada)
  y responder `[{"id", "name", "role"}]`, según la sección 4.4 de su especificación. Este servicio
  reenvía el JWT del usuario actual y divide la consulta en lotes de 100.
- **Feedback Service** escribe `feedback` con `version_id` (string), `is_final` (bool) y demás
  campos de su especificación. Aquí solo se leen `version_id` e `is_final`.
- **Feedback Service** y **Export Service** leen `courses`, `projects` y `versions`: no renombrar
  campos sin coordinarlo con ellos.
