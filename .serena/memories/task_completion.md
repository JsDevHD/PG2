# Task completion checklist (per touched service, from inside its folder)

1. `ruff format .`
2. `ruff check .` (fix all)
3. `pytest` — needs Mongo running (`docker compose up -d mongo`). If Mongo is unavailable, say so instead of claiming tests pass.
4. Test rule: every business endpoint has a happy-path test plus one test per domain error it can raise (403/404/409/422). External deps are mocked (Blob via `mock_upload`/monkeypatch, Auth via `respx`/monkeypatch).
5. If a change touches a cross-service contract (JWT claims, shared collection fields, `/users/batch`), update the consuming services and their READMEs (see `mem:architecture`).
6. Changes to the template's shared infra should be mirrored in all four services.
7. Frontend changes (in `frontend`, PowerShell): `pnpm format`, `pnpm check`, `pnpm test`, `pnpm build` (typecheck). New backend endpoint ⇒ add MSW handler in `tests/mocks/handlers.ts`, type in `src/types/api.ts`, gateway route (`mem:gateway`).
8. Re-index Serena after structural changes (`mem:suggested_commands`).
