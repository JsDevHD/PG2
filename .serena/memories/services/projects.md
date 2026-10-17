# Projects_Service (projects-service)

- Owns `courses`, `projects`, `versions`; reads `feedback` (`version_id`, `is_final`). Indexes in `app/db/indexes.py`.
- Membership/role checks centralized in `app/api/access.py` — reuse it, don't reimplement.
- Routers: `courses.py` (create, list, `join` idempotent, projects per course), `versions.py`, `progress.py`. Blob in `core/storage.py`, Auth client in `core/auth_client.py` (batches of 100).
- `course_code`: 6 chars, unique.
- Upload order (CU-02) is significant: membership 403 → format JPG/PNG/PDF/SVG + size ≤ `MAX_FILE_SIZE_MB` + content signature matches declared type (`storage.py::_matches_signature`; client Content-Type is untrusted) 422 → no final grade 403 → Blob upload → insert `versions`. Blob failure → 503.
- Progress = versions with ≥1 feedback / total × 100, 2 decimals, 0.0 if none; teacher view includes enrolled students with no uploads.
- Extra env: `AZURE_STORAGE_CONNECTION_STRING` (required), `AZURE_STORAGE_CONTAINER=versions`, `MAX_FILE_SIZE_MB=20`, `AUTH_SERVICE_URL`.
- Tests: `tests/helpers.py` shared helpers; `mock_upload` fixture replaces Blob; `respx` mocks Auth.
- Blob is private: `file_url` is never browser-openable (Azurite host `azurite:10000`, Azure needs SAS). Files are served by `GET /api/v1/projects/{id}/versions/{versionId}/file` (`get_version_file`), sharing H-6 rules with `get_version` via `_get_accessible_version`; `core/storage.py::download_file` resolves blob name from `file_url`. Blob names are `versions/{project}/{student}/{uuid}_{name}` inside container `versions` (URL shows `/versions/versions/`, intended).
- Upload is blocked for ALL students of a project once ANY final grade exists (`_ensure_project_not_finalized`, asserted by tests) — differs from Feedback's per-student final grade rule; intentional per Projects spec, flagged to user.
- Upload requires form field `rights_declaration=true` (authorship/permissions declaration) checked right after membership → 422; stored as `versions.rights_declared_at`. Test helper `tests/helpers.py::upload_version` sends it.
