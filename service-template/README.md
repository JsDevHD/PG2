# service-template

Template base (FastAPI + MongoDB) del **Sistema de Seguimiento de Proyectos Gráficos**. De aquí se
derivan `auth-service`, `projects-service`, `feedback-service` y `export-service`.

Todo lo transversal ya está resuelto: configuración por entorno, verificación de JWT, conexión a
MongoDB, formato de errores, logging, `/health` y contenedor. Un microservicio nuevo solo agrega
sus modelos, schemas, endpoints de negocio y variables de entorno propias.

## Requisitos

- Docker + Docker Compose (para levantar el servicio con MongoDB), o
- Python 3.13 y un MongoDB accesible (para desarrollo sin contenedores).

## Levantar el servicio localmente

```bash
cp .env.example .env
docker compose up --build
```

- Salud: <http://localhost:8000/health> → `{"status": "ok", "service": "service-template"}`
- Documentación OpenAPI: <http://localhost:8000/docs>

`docker-compose.yml` sobrescribe `MONGODB_URI` para apuntar al contenedor `mongo`; el valor de
`.env` (`localhost`) se usa solo cuando el servicio corre fuera de Docker.

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

Los tests usan la base `graphic_tracker_test` (configurada en `tests/conftest.py`). Fixtures:

- `client`: `httpx.AsyncClient` contra la app, con el `lifespan` (conexión a Mongo) activo.
- `test_db`: base de test vacía antes y después de cada test. Requiere un MongoDB activo en
  `MONGODB_URI` (por defecto `mongodb://localhost:27017`; con compose: `docker compose up mongo`).
  Por seguridad, se niega a limpiar cualquier base cuyo nombre no termine en `_test`.

Regla para los microservicios reales: todo endpoint de negocio lleva al menos un test de camino
feliz y un test por cada excepción de dominio que pueda lanzar (404, 403, 409 según aplique).

## Linter y formato

```bash
ruff check .
ruff format .
```

## Crear un microservicio nuevo a partir del template

1. Copiar la carpeta `service-template/` con el nombre del servicio (p. ej. `projects-service/`).
2. Ajustar `SERVICE_NAME` en `.env.example` / `.env` y en `tests/conftest.py`.
3. Modificar los archivos de la tabla siguiente.

### Archivos que SÍ se modifican

| Archivo | Qué se hace |
|---|---|
| `app/models/` | Modelos de dominio (documentos de MongoDB) |
| `app/schemas/` | Schemas Pydantic de request/response |
| `app/api/v1/<recurso>.py` | Routers de negocio (nuevos archivos) |
| `app/api/v1/router.py` | Registrar los routers de negocio en `api_router` |
| `app/core/config.py` | Solo para **extender** `Settings` con campos propios (sin tocar los heredados) |
| `.env.example` / `.env` | Variables propias del servicio |
| `requirements.txt` | Dependencias propias del servicio, si las hay |
| `tests/` | Tests de los endpoints de negocio |
| `README.md` | Documentación del servicio |

### Archivos que NO se tocan (salvo necesidad justificada)

| Archivo | Motivo |
|---|---|
| `app/core/security.py` | Verificación de JWT común a los cuatro servicios |
| `app/db/mongodb.py` | Ciclo de vida del cliente MongoDB |
| `app/exceptions.py` | Formato de error único para el frontend (se pueden agregar subclases de `DomainError`) |
| `app/main.py` | Wiring de lifespan, CORS, errores y routers |
| `app/core/logging.py`, `app/api/deps.py`, `app/api/v1/health.py` | Infraestructura transversal |
| `Dockerfile`, `docker-compose.yml`, `pyproject.toml` | Build, despliegue y convenciones de calidad |

## Convenciones (obligatorias en los cuatro servicios)

- **Rutas:** todo endpoint de negocio bajo `/api/v1/...`; `/health` es la única excepción.
- **Autenticación:** header `Authorization: Bearer <token>`, validado localmente con la misma
  `JWT_SECRET_KEY` en todos los servicios. El token debe traer los claims `sub` (id de usuario),
  `role` (`estudiante` | `docente`) y `exp`.
- **Autorización de recurso:** además del rol, verificar pertenencia al curso/proyecto/versión
  contra MongoDB antes de operar; si no pertenece, `raise ForbiddenError()` (403).
- **Errores:** siempre `{"detail": "mensaje"}`. Lanzar `NotFoundError`, `ForbiddenError` o
  `ConflictError` desde `app/exceptions.py`; el handler global produce la respuesta.
- **Fechas:** ISO 8601 UTC. **IDs:** `ObjectId` serializado como `string`.
- **Colecciones:** snake_case y plural (`users`, `courses`, `projects`, `versions`, `feedback`).
- **Logging:** `logger = logging.getLogger(__name__)` por módulo; nunca `print()`.

Ejemplo de endpoint protegido:

```python
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.deps import CurrentUser, get_current_user, get_db
from app.exceptions import ForbiddenError, NotFoundError

router = APIRouter()


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    # 1. Buscar el proyecto; si no existe -> raise NotFoundError("Proyecto no encontrado")
    # 2. Verificar que current_user.id pertenece al proyecto; si no -> raise ForbiddenError()
    # 3. Responder con el ObjectId serializado como string
    ...
```

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `SERVICE_NAME` | — (obligatoria) | Nombre del servicio, devuelto por `/health` |
| `ENVIRONMENT` | `development` | `development` \| `production` |
| `MONGODB_URI` | — (obligatoria) | Cadena de conexión a MongoDB |
| `MONGODB_DB_NAME` | — (obligatoria) | Base de datos lógica |
| `JWT_SECRET_KEY` | — (obligatoria) | Clave HS256; **idéntica** en los cuatro servicios |
| `JWT_ALGORITHM` | `HS256` | Algoritmo de firma |
| `JWT_EXPIRE_MINUTES` | `60` | Expiración del token (RNF-01) |
| `CORS_ALLOWED_ORIGINS` | `["*"]` | Lista JSON de orígenes; restringir en producción |
| `LOG_LEVEL` | `INFO` | Nivel de logging |

`.env` nunca se commitea (está en `.gitignore`).
