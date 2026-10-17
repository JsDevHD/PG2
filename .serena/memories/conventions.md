# Conventions (mandatory in all services)

## Layout per service (`app/`)
- `api/v1/<resource>.py` routers, registered in `api/v1/router.py` (`api_router`); `api/deps.py` single import point (`CurrentUser, get_current_user, get_db`, plus service-specific deps like Feedback's `get_current_teacher`).
- `models/` = Mongo documents; `schemas/` = Pydantic request/response (Export: internal PDF DTOs).
- `core/config.py`: subclass `Settings` with new fields; never change inherited ones. `get_settings()` is `lru_cache`d.
- `db/` index creation (`init_indexes.py` / `indexes.py`) is called from the lifespan in `main.py`.
- Template infra files (security.py, mongodb.py, exceptions.py, main.py, logging.py, health.py, Dockerfile, pyproject) are not edited without justification; when a service diverges, its README lists it.

## Rules
- Business routes under `/api/v1/...`; only `/health` outside.
- Errors always `{"detail": "..."}`: raise `DomainError` subclasses from `app/exceptions.py` (`NotFoundError` 404, `ForbiddenError` 403, `ConflictError` 409); never build error JSONResponses in routers. 422 subclass name differs: Feedback `UnprocessableError`, Export `UnprocessableEntityError`.
- Authorization = role check + membership check against Mongo (H-6) → `ForbiddenError`. Projects centralizes it in `app/api/access.py`; Feedback in `api/deps.py` + `db/projects_readonly.py`.
- Malformed ObjectId → treat as 404 (not 500).
- Dates ISO 8601 UTC; Mongo clients with `tz_aware=True` in services that read dates. IDs: ObjectId stored, serialized as string; cross-service refs (`version_id`, `student_id`, ...) stored as strings.
- Collections snake_case plural.
- `logger = logging.getLogger(__name__)`; never `print()`; never log passwords.
- Duplicate key races → catch `DuplicateKeyError` → `ConflictError` (rely on unique indexes, not pre-checks).
- Style: ruff line-length 100, rules E,F,I,UP,B (FastAPI `Depends/Query/...` exempt from B008). Spanish docstrings/comments/messages, English identifiers. Type hints throughout.
