# export-service

Microservicio de exportación del **Sistema de Seguimiento de Proyectos Gráficos** (FastAPI +
MongoDB), derivado de `service-template/`. Resuelve **RF-07 / CU-04 (Exportar portafolio en PDF)**.

Es un servicio de agregación: **no es dueño de ninguna colección** y no escribe en MongoDB. En cada
petición reúne los datos de un estudiante en un proyecto y genera un PDF que se entrega en la
respuesta, sin persistirlo.

| Fuente | Acceso | Para qué |
|---|---|---|
| `courses`, `projects`, `versions` (Projects Service) | lectura directa a Mongo | pertenencia (H-6), datos del proyecto e historial de versiones |
| `feedback` (Feedback Service) | lectura directa a Mongo | retroalimentación y calificación final |
| Azure Blob Storage (contenedor de Projects Service) | solo lectura | imágenes JPG/PNG que se embeben en el PDF |
| `GET /api/v1/users/batch` (Auth Service) | HTTP, reenviando el JWT | nombres del estudiante y de los docentes |

## Endpoint

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/api/v1/projects/{project_id}/export` | Ambos (con pertenencia) | Genera y entrega el PDF |

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

1. Portada: título del proyecto, estudiante, curso, fecha de generación y descripción.
2. Una página por versión, en orden cronológico: número, fecha, descripción, imagen embebida y la
   retroalimentación parcial (docente, fecha, comentario, calificación).
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

- Salud: <http://localhost:8000/health> → `{"status": "ok", "service": "export-service"}`
- Documentación OpenAPI: <http://localhost:8000/docs>

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
