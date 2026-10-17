# Feedback_Service (feedback-service)

- Owns `feedback`. All reads of Projects' collections go through `app/db/projects_readonly.py` (read-only views in `models/projects.py`). Does not call Auth (returns ids only).
- Endpoints: `POST|GET /api/v1/versions/{id}/feedback`, `GET /api/v1/projects/{id}/feedback`, `POST|GET /api/v1/projects/{id}/final-grade` (GET returns a list).
- Only the course's teacher writes; `project_id`/`student_id` are copied from the version at write time.
- `score` in [0.0, 5.0] (Pydantic); rounding is frontend's job. Teacher may keep commenting after the final grade.
- Many comments per version, ONE current partial grade: partial `score` is optional (null = comment only). Posting a score `update_many`s the current one to `score_replaced=True` (never deleted/edited, RNF-08) then inserts; unique partial index `unique_current_partial_grade` on `version_id` with filter `init_indexes.CURRENT_PARTIAL_GRADE` (`is_final:false, score_replaced:false, score:$type number`); race → 409. Startup migration `_migrate_partial_grades` keeps only the latest legacy partial grade per version. Final grade always requires score. Consumers (Export PDF, frontend) must handle `score: null` and `score_replaced`.
- Final grade unique per (project_id, student_id) via partial unique index `unique_final_grade_per_student`; `DuplicateKeyError` → 409. `version_id` not belonging to project → 422 (`UnprocessableError`).
- Lists sorted by `created_at` ascending. Tests seed Projects documents directly in the test DB.
