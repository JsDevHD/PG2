# Export_Service (export-service)

- Single endpoint `GET /api/v1/projects/{project_id}/export[?student_id=]` → `application/pdf` attachment, not persisted. Student: param ignored, own portfolio. Teacher: param required (422), must own course and student must be enrolled (403).
- `core/pdf_builder.py::build_portfolio_pdf()` takes only plain DTOs from `schemas/export.py` — keep it free of Mongo/Blob/Auth so it stays unit-testable (`tests/test_pdf_builder.py`, uses pypdf).
- `core/storage.py` read-only sync Blob download, no retries; `core/auth_client.py` names via `/users/batch`.
- Never abort export on: no versions (single page "No hay evidencias registradas"), missing/corrupt blob ("Archivo no disponible"), PDF/SVG versions (listed, not embedded), Auth down ("Nombre no disponible").
- Filename normalized to ASCII; CORS `expose_headers=["Content-Disposition"]` in `main.py` so the browser can read it (tested in `tests/test_health.py`). 422 exception: `UnprocessableEntityError`.
- Extra env: `AZURE_STORAGE_CONNECTION_STRING` (`UseDevelopmentStorage=true` = Azurite), `AZURE_STORAGE_CONTAINER`, `AUTH_SERVICE_URL`. Tests mock Auth/Blob with monkeypatch.
- PDF cover includes a copyright notice (works belong to the student, Ley 23/1982); PDF metadata author = student, creator = platform.
