# export-service

Microservicio de exportación del **Sistema de Seguimiento de Proyectos Gráficos** (FastAPI +
MongoDB), derivado de `service-template/`. Resuelve **RF-07 / CU-04 (Exportar portafolio en PDF)**:
el portafolio de un estudiante en un proyecto y el **portafolio académico** que arma el estudiante
con los cursos y proyectos que elija.

Es un servicio de agregación: **no es dueño de ninguna colección** y no escribe en MongoDB. En cada
petición reúne los datos de un estudiante en un proyecto y genera un PDF que se entrega en la
respuesta, sin persistirlo.

| Fuente | Acceso | Para qué |
|---|---|---|
| `courses`, `projects`, `groups`, `versions` (Projects Service) | lectura directa a Mongo (`app/core/portfolio.py`) | pertenencia (H-6), datos del proyecto, grupo e historial de versiones |
| `feedback` (Feedback Service) | lectura directa a Mongo | retroalimentación y calificación final |
| Azure Blob Storage (contenedor de Projects Service) | solo lectura | imágenes JPG/PNG que se embeben en el PDF |
| `GET /api/v1/users/batch` (Auth Service) | HTTP, reenviando el JWT | nombres del estudiante y de los docentes |

## Endpoints

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/api/v1/projects/{project_id}/export` | Ambos (con pertenencia) | Portafolio de un estudiante en un proyecto |
| POST | `/api/v1/portfolio/export` | Estudiante | Portafolio académico: `{project_ids, include_feedback, include_grades, include_images}` |

### Portafolio académico (`POST /api/v1/portfolio/export`)

- Exclusivo del estudiante (`403` para el docente) y solo de lo suyo: cada uno de los 1 a 100
  `project_ids` debe existir (`404`) y ser de un curso en el que esté matriculado (`403` para toda
  la petición). "Un curso" o "todos los cursos" se resuelven en el frontend a la lista de
  proyectos.
- Opciones, `true` por defecto:
  - `include_feedback`: comentarios del docente. Sin ellos, si se incluyen calificaciones, se
    muestra la nota parcial vigente de cada versión.
  - `include_grades`: notas parciales y calificación final.
  - `include_images`: sin imágenes no se descarga nada de Blob y se lista el nombre del archivo.
- Estructura del documento (`build_student_portfolio_pdf`): portada con resumen e índice; luego
  cada proyecto (cursos por nombre, proyectos en orden de creación) con su grupo, descripción,
  versiones y calificación final.
- Archivo: `portafolio_academico_{estudiante}.pdf`.

### Proyectos por grupos

El portafolio del estudiante incluye las versiones **de su grupo** (con quién subió cada una), los
comentarios de esas versiones y **solo su propia calificación final**. La portada muestra el grupo y
sus integrantes.

Query param `student_id`:

- **Estudiante:** se ignora; siempre se exporta su propio portafolio (`current_user.id`). Debe estar
  matriculado en el curso del proyecto; si no, `403`.
- **Docente:** obligatorio (`422` si falta). Debe ser el titular del curso y el estudiante debe estar
  matriculado en él; si no, `403`.

Respuesta `200`: `application/pdf` con
`Content-Disposition: attachment; filename="portafolio_{proyecto}_{estudiante}.pdf"`. El nombre del
archivo se normaliza a ASCII (sin tildes ni espacios). Otros errores: `401` (token), `404` (proyecto
inexistente).

### Estructura del PDF (`app/core/pdf_builder.py`)

1. Portada: título del proyecto, estudiante, curso, fecha de generación, descripción y un aviso de
   derechos de autor (las obras son del estudiante, Ley 23 de 1982). En los metadatos del PDF el
   autor es el estudiante y la plataforma figura como creadora.
2. Una página por versión, en orden cronológico: número, fecha, descripción, imagen embebida y la
   retroalimentación parcial (docente, fecha, comentario y, si la tiene, calificación; las
   calificaciones reemplazadas aparecen tachadas).
3. Si existe `feedback.is_final=true`, una página final destacada con la nota y el comentario.
4. Pie de página con el nombre de la plataforma y el número de página.

`build_portfolio_pdf()` solo recibe DTOs planos (`app/schemas/export.py`) y no conoce Mongo, Blob ni
Auth, así que se prueba sin infraestructura.

### Casos que no abortan la exportación

- **Proyecto sin versiones:** PDF de una página con "No hay evidencias registradas" (A1 de CU-04).
- **Archivo faltante, ilegible o corrupto en Blob Storage:** la imagen se sustituye por
  "Archivo no disponible". La descarga no reintenta, para que un Blob caído no bloquee la
  petición durante ~20 s por archivo.
- **Versiones PDF/SVG:** no se descargan; se lista el nombre del archivo con una nota de que el
  original está en la plataforma.
- **Auth Service caído:** se registra un warning y los nombres se muestran como "Nombre no
  disponible" (mismo criterio de degradación que Projects Service).

## Levantar el servicio localmente

```bash
cp .env.example .env
docker compose up --build
```

- Salud: <http://localhost:8004/health> → `{"status": "ok", "service": "export-service"}`
- Documentación OpenAPI: <http://localhost:8004/docs>

El `Dockerfile` es idéntico al del template: ReportLab es Python puro y no requiere paquetes del
sistema operativo. Con el `docker-compose.yml` del template no se levantan Auth Service ni un
emulador de Blob Storage, así que en ese modo el PDF sale con nombres e imágenes de reemplazo.

Sin Docker:

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

- `tests/test_pdf_builder.py`: tests unitarios del builder con datos planos (número de páginas,
  mensaje sin evidencias, calificación final, archivos faltantes o corruptos, escape de texto).
- `tests/test_export.py`: tests del endpoint contra la base `graphic_tracker_test`, que requiere un
  MongoDB activo, igual que en el template. Auth Service y Blob Storage se reemplazan con mocks
  (`monkeypatch`).

`pypdf` es dependencia solo de desarrollo: los tests la usan para contar páginas y leer el texto
del PDF generado.

## Linter y formato

```bash
ruff check .
ruff format .
```

## Variables de entorno

Además de las del template (`SERVICE_NAME`, `MONGODB_URI`, `MONGODB_DB_NAME`, `JWT_SECRET_KEY`,
etc.):

| Variable | Default | Descripción |
|---|---|---|
| `AZURE_STORAGE_CONNECTION_STRING` | — (obligatoria) | Misma cuenta que Projects Service; `UseDevelopmentStorage=true` apunta a Azurite |
| `AZURE_STORAGE_CONTAINER` | `versions` | Contenedor donde Projects Service guarda las versiones |
| `AUTH_SERVICE_URL` | `http://auth-service:8000` | URL base de Auth Service |

`.env` nunca se commitea (está en `.gitignore`).

## Estructura propia del servicio

| Archivo | Contenido |
|---|---|
| `app/api/v1/export.py` | Router del endpoint (flujo de 8 pasos de la especificación) |
| `app/core/pdf_builder.py` | Composición del PDF con ReportLab |
| `app/core/storage.py` | Descarga de archivos de Blob Storage (solo lectura) |
| `app/core/auth_client.py` | Cliente de `GET /api/v1/users/batch` |
| `app/schemas/export.py` | DTOs internos de composición del PDF (no son documentos de Mongo) |
| `app/core/config.py` | `Settings` con las variables propias de este servicio |
| `app/exceptions.py` | Se agrega `UnprocessableEntityError` (422) |

Las convenciones comunes (rutas `/api/v1`, JWT, formato de error `{"detail": ...}`, fechas UTC,
logging) son las del template y se mantienen sin cambios.
