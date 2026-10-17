# Tech stack

- Python 3.13 (`.python-version`, ruff `py313`, Docker `python:3.13-slim`). Root `.venv` = Python 3.13 (system install, `%LOCALAPPDATA%/Programs/Python/Python313`) with the union of all four services' `requirements-dev.txt`.
- FastAPI >=0.115,<0.120; uvicorn; pydantic-settings (env/.env config); motor >=3.6,<4 (async Mongo); python-jose (JWT); bcrypt; python-multipart.
- Per-service extras: Auth `email-validator`; Projects `httpx`, `azure-storage-blob[aio]` (aio needs aiohttp); Export `reportlab`, `httpx`, `azure-storage-blob` (sync), dev `pypdf`.
- Dev: pytest + pytest-asyncio (`asyncio_mode = auto`), httpx `ASGITransport`, ruff; Projects tests use `respx`.
- MongoDB 7 and Azurite (Blob emulator) in Docker.
- Frontend: React/TS/Vite with pnpm (details `mem:frontend/core`); served by Nginx container on :3000. Gateway Nginx on :8080 (`mem:gateway`). CORS origins: `http://localhost:5173` (pnpm dev) and `http://localhost:3000`.
- Host ports: 8001 auth, 8002 projects, 8003 feedback, 8004 export (container port always 8000; inter-service URLs use `http://<name>-service:8000`). Same mapping in root and per-service composes.
- Root `docker-compose.yml` = integrated stack (one shared Mongo + Azurite; JWT secret from root `.env`). Per-service composes = standalone dev, each with its own Mongo on 27017 → only one standalone stack at a time, and they don't share data.
- Deps: `requirements.txt` (runtime) + `requirements-dev.txt` (`-r requirements.txt` + dev). No lock files.
