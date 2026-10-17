# projects-service

Microservicio de cursos, proyectos, grupos y versiones del **Sistema de Seguimiento de Proyectos
Gráficos** (FastAPI + MongoDB). Derivado de `service-template/`; este README documenta solo lo
propio del servicio. Especificación: `03_Projects_Service_Especificacion.md`.

**Resuelve:** RF-02, RF-03, RF-04 y RF-08 (el progreso lee la retroalimentación de Feedback
Service). **Casos de uso:** CU-01 (unirse a un curso) y CU-02 (subir versión).

## Acceso a datos

| Colección | Acceso | Para qué |
|---|---|---|
| `courses`, `projects`, `groups`, `versions` | Lectura y escritura (dueño exclusivo) | Núcleo del dominio |
| `feedback` (Feedback Service) | Solo lectura | Bloquear versiones de quien ya tiene calificación final, impedir que un grupo calificado cambie de integrantes y calcular progreso |
| `users` (Auth Service) | **Nunca** | Los nombres se piden por HTTP a `GET /api/v1/users/batch` |

Índices creados en el `lifespan` (`app/db/indexes.py`): `courses.course_code` (único),
`projects.course_id`, `versions(project_id, student_id, uploaded_at)`,
`versions(project_id, group_id, uploaded_at)` y `unique_group_member_per_project` sobre
`groups(project_id, member_ids)` (único y multikey: un estudiante en a lo sumo un grupo por
proyecto).

## Endpoints

Todos requieren `Authorization: Bearer <token>` emitido por Auth Service.

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/v1/courses` | Docente | Crea un curso con `course_code` de 6 caracteres |
| GET | `/api/v1/courses` | Ambos | Cursos propios (docente) o matriculados (estudiante) |
| POST | `/api/v1/courses/join` | Estudiante | Se matricula con el código (idempotente) |
| POST | `/api/v1/courses/{course_id}/projects` | Docente titular | Crea un proyecto individual o por grupos (`work_mode`, `group_min_size`, `group_max_size`, `group_deadline`, `grading_mode`) |
| GET | `/api/v1/courses/{course_id}/projects` | Miembro del curso | Lista los proyectos (el estudiante, solo los visibles) |
| PATCH | `/api/v1/projects/{project_id}` | Docente titular | Edita el proyecto (parcial): título, descripción, `hidden`, plazo y, sin grupos ni versiones, la modalidad y los grupos |
| DELETE | `/api/v1/projects/{project_id}` | Docente titular | Elimina un proyecto **sin versiones** y sus grupos (`409` si tiene versiones: se oculta en su lugar) |
| POST | `/api/v1/projects/{project_id}/versions` | Estudiante matriculado | Sube una versión (`multipart/form-data`: `file`, `description`) |
| GET | `/api/v1/projects/{project_id}/versions` | Miembro del curso | Historial cronológico (alcance por rol; el docente filtra con `?student_id` o `?group_id`) |
| GET | `/api/v1/projects/{project_id}/versions/{version_id}` | Miembro del curso | Detalle de una versión |
| GET | `/api/v1/projects/{project_id}/versions/{version_id}/file` | Miembro del curso | Archivo de la versión (binario), mismas reglas de acceso que el detalle |
| GET | `/api/v1/courses/{course_id}/progress` | Miembro del curso | Progreso (forma según el rol) |
| GET | `/api/v1/projects/{project_id}/groups` | Miembro del curso | Grupos con sus integrantes (`[]` si el proyecto es individual) |
| POST | `/api/v1/projects/{project_id}/groups` | Estudiante matriculado | Crea un grupo (`{name?}`) y queda como primer integrante |
| POST | `/api/v1/projects/{project_id}/groups/{group_id}/join` | Estudiante matriculado | Se une a un grupo con cupo (idempotente) |
| POST | `/api/v1/projects/{project_id}/groups/{group_id}/leave` | Integrante | Sale del grupo (`204`); un grupo vacío se elimina |
| POST | `/api/v1/projects/{project_id}/group-deadline` | Docente titular | Cambia el plazo para formar grupos (`{group_deadline}`) |

"Miembro del curso" = docente titular (`teacher_id`) o estudiante matriculado (`student_ids`).
La verificación está centralizada en `app/api/access.py`.

### Reglas que conviene conocer

- **Proyectos ocultos (`hidden`):** para el estudiante no existen: no salen en el listado, no
  cuentan en su progreso y todo lo que depende de ellos (versiones, archivos, grupos) responde `404`.
  El docente los sigue viendo. Se pueden crear ocultos (borrador). Feedback y Export aplican la
  misma regla.

- **Proyectos por grupos:** se configuran al crearlos (2 a 10 integrantes, mínimo ≤ máximo,
  fecha límite futura y calificación `individual` o `group`, excluyentes) y no cambian después.
  Los estudiantes matriculados forman los grupos hasta la fecha límite (`403` después). Un
  estudiante está en a lo sumo un grupo por proyecto (`409`, índice multikey) y un grupo no supera
  el máximo (`409 El grupo está completo`, `$push` condicional y atómico). El mínimo solo se
  advierte. No se puede salir de un grupo que ya subió versiones (`409`) ni entrar a uno con
  calificación final (`403`). En estos proyectos la versión es del grupo (`group_id`), la sube
  cualquier integrante (`student_id` es quien la subió) y todos la ven; sin grupo no se puede subir
  (`403`).
- **Alcance por rol en versiones:** un estudiante solo ve sus propias versiones (o las de su
  grupo); el filtro se fuerza en Mongo e ignora los query params. El docente
  titular ve todas y puede filtrar con `?student_id=...`. Si un estudiante pide por id una
  versión que no es suya **o que no existe**, recibe 403 en ambos casos, así no puede sondear qué
  versiones de sus compañeros existen.
- **Declaración de autoría:** la subida exige el campo de formulario `rights_declaration=true`
  (el estudiante declara ser autor o tener permiso sobre el material de terceros y la autorización
  de las personas reconocibles). Sin ella responde `422`; con ella se guarda
  `versions.rights_declared_at` como evidencia.
- **Subida (CU-02), en este orden:** pertenencia (403) → grupo, si el proyecto es por grupos (403) → declaración de autoría (422) → formato JPG/PNG/PDF/SVG, tamaño y contenido que corresponda al formato (firma del archivo)
  ≤ `MAX_FILE_SIZE_MB` (422) → sin calificación final **propia** en el proyecto (403; calificar a un estudiante no bloquea a sus compañeros) → Blob Storage →
  `versions`. No existen `PUT` ni `DELETE` de versiones (RNF-08), y el blob se sube con
  `overwrite=False`.
- **Progreso:** `versiones con ≥ 1 retroalimentación / total de versiones × 100` (redondeado a 2
  decimales; 0.0 si no hay versiones). Una versión de grupo cuenta para cada integrante; los
  totales del curso cuentan versiones distintas. El docente ve el total del curso y el desglose de cada
  matriculado, incluso de los que no han subido nada. Si Auth Service no responde, la respuesta
  sale igual con `student_name: null` y se registra un warning.
- Si Blob Storage falla al subir, la respuesta es `503 {"detail": ...}`.
- **Archivo de una versión:** Blob Storage es privado, así que `file_url` no se puede abrir desde
  el navegador (ni en Azure sin SAS, ni con Azurite). El frontend descarga el archivo con su JWT
  por `GET .../versions/{version_id}/file`, que aplica las mismas reglas que el detalle (403/404),
  responde `404 Archivo no encontrado` si el blob ya no existe y `503` si Blob Storage falla. Se
  envía con `Cache-Control: private` (una versión no cambia) y una CSP `sandbox` para que un SVG
  subido no ejecute scripts.

## Levantar el servicio localmente

```bash
cp .env.example .env
docker compose up --build
```

Levanta el servicio, MongoDB y **Azurite** (emulador de Blob Storage). El contenedor de blobs se
crea solo en la primera subida.

- Salud: <http://localhost:8002/health>
- Documentación OpenAPI: <http://localhost:8002/docs>

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
