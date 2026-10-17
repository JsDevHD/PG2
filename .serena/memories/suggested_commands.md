# Suggested commands (Windows)

- Shared Python venv at repo root (Python 3.13): `.venv\Scripts\activate` (PowerShell: `.venv\Scripts\Activate.ps1`). Recreate: `uv venv .venv --python 3.13 --seed` then `uv pip install --python .venv\Scripts\python.exe -r <each Service>\requirements-dev.txt`.
- Full stack (repo root): `docker compose up -d --build` → frontend :3000 (gateway URL via env `API_GATEWAY_URL` at container start, not build), gateway :8080, services :8001–8004, Mongo :27017, Azurite :10000. Docker may not be on PATH in agent shells: `$env:Path = "$env:ProgramFiles\Docker\Docker\resources\bin;$env:Path"`.
- Demo data (needs stack up): `.venv\Scripts\python scripts\seed_demo.py` (accounts/password inside the script).
- Backend service (inside its folder, e.g. `cd Projects_Service`):
  - Tests: `..\.venv\Scripts\python -m pytest` (Mongo at `MONGODB_URI`, default localhost:27017; DB `graphic_tracker_test`; `docker compose up -d mongo` from root works).
  - Lint/format: `..\.venv\Scripts\ruff check .` ; `..\.venv\Scripts\ruff format .`.
  - Without Docker: `uvicorn app.main:app --reload --port 800N`.
- Frontend (inside `frontend`, from PowerShell; pnpm shims in `%LOCALAPPDATA%\pnpm-shims`): `pnpm install`, `pnpm dev` (open http://localhost:5173, not 127.0.0.1 — CORS), `pnpm test`, `pnpm build` (includes `tsc -b`), `pnpm check` / `pnpm format` (Biome).
- Serena index: `uvx --from git+https://github.com/oraios/serena serena project index` from repo root (python + typescript). After changing `.serena/project.yml` the Serena MCP server must be reconnected (`/mcp`) to pick up new language servers.
- Shell: Bash tool is Git Bash (POSIX); PowerShell 5.1 lacks `&&` — use `; if ($?) {}`. PowerShell `Set-Content -Encoding utf8` writes a BOM.
