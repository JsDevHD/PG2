# Cross-service architecture & contracts

## Collection ownership (single writer)
- `users` → Auth only. Other services NEVER read it; names via HTTP `GET /api/v1/users/batch?ids=a,b,c` (max 100 ids, returns `[{id,name,role}]` in request order, unknown/malformed ids omitted), forwarding the caller's JWT.
- `courses`, `projects`, `versions` → Projects. Read directly from Mongo by Feedback and Export: don't rename fields without updating them.
- `feedback` → Feedback. Read directly by Projects (`version_id`, `is_final`) and Export.
- Export owns nothing, writes nothing.
- Blob container `versions` (Azure Blob / Azurite): Projects writes (`overwrite=False`), Export reads.

## Entry point
- Frontend → API gateway (`mem:gateway`) → services. Browsers never call services directly; new endpoints must be routed in the gateway.

## JWT contract
- HS256, same `JWT_SECRET_KEY` in all four services; verified locally by `app/core/security.py::get_current_user` → `CurrentUser(id, role)`.
- Claims exactly `sub`, `role` (`estudiante` | `docente`), `exp`. Adding claims requires updating template + all services.

## Shared domain rules
- Membership ("miembro del curso") = `course.teacher_id` (docente titular) or in `course.student_ids`.
- Role scoping: student always forced to own `student_id` (query param ignored); teacher must be course owner. Accessing another student's or nonexistent version → 403 for students (no probing).
- One final grade per (student, project), enforced by partial unique index; check with `feedback.find_one({project_id, student_id, is_final: True})`. After final grade: no more version uploads for that student/project.
- Immutability (RNF-08): no PUT/PATCH/DELETE for versions or feedback.
- Degradation: if Auth is down, Projects/Export still respond (`student_name: null` / "Nombre no disponible") and log a warning.

## Group projects (added 2026-10-11)
- `projects.work_mode` = `individual` | `group`; group projects carry `group_min_size`/`group_max_size` (2–10), `group_deadline` (teacher can change via `POST /projects/{id}/group-deadline`) and `grading_mode` (`individual` | `group`, mutually exclusive, fixed at creation). Legacy projects without these fields read as individual.
- `groups` collection (Projects owns; Feedback/Export read): students self-form groups before the deadline. One group per student per project = unique multikey index `(project_id, member_ids)`; max size = conditional atomic `$push`. Min size is only a warning. Leave only if the group has no versions; empty group is deleted (only delete in the system). Graded group accepts no new members.
- Group versions: `versions.group_id` (owner) + `student_id` (uploader); student scoping uses the group. Feedback copies `group_id`; students never see a teammate's final grade (`$or: [{is_final:false},{student_id: me}]`).
- Group grading is materialized as one `is_final` record per member (`insert_many(ordered=True)`), so every per-student rule (upload block, progress, PDFs) keeps working. `POST /final-grade` returns a list; `student_id` required for individual grading in group projects, rejected for group grading.
- Upload block is per student: `feedback.find_one({project_id, student_id: me, is_final: True})`.
- Student academic portfolio: `POST /api/v1/portfolio/export` (Export, students only) with explicit `project_ids` + `include_feedback/grades/images`; Export reads via `app/core/portfolio.py`. Frontend `/portafolio`.
- Full write-up: `docs/DOCUMENTACION_TECNICA.md`.
- Project management (2026-10-11): `PATCH /projects/{id}` (partial edit; structure fields locked once the project has groups or versions → 409) and `DELETE /projects/{id}` (only without versions; deletes its groups; else 409 "ocúltalo"). `projects.hidden=true` makes the project nonexistent for students in all four services (404, excluded from lists/progress/PDFs); query with `hidden: {$ne: true}`. Gateway routes `^/api/v1/projects/[^/]+$`; APIM ops/CORS include PATCH and DELETE.
- Dark mode (2026-10-11): `:root.dark` redefines the RGB color tokens in `frontend/src/styles/globals.css`; extra tokens `chrome` (header/footer, dark in both), `canvas`/`canvas-ink` (artwork previews stay light), `--mat-strong/faint`. Never hard-code `text-white` on theme-dependent backgrounds: use `text-surface` on `bg-primary`/`bg-ink`, `text-danger-ink` for error text. Preference system/light/dark in localStorage `theme`; `public/theme.js` applies it pre-paint (CSP forbids inline scripts); logic in `src/lib/theme.ts`, toggle `components/layout/ThemeToggle.tsx` in the header.

## Azure deployment (done 2026-10-16)
- Live: frontend https://frontend.yellowsand-87b574b4.westus.azurecontainerapps.io, API https://apim-graficos-js2026.azure-api.net (APIM Consumption, eastus). RG rg-graficos-udi.
- Container Apps env cae-graficos, DocumentDB Free tier (MongoDB 8.0), Storage, ACR and Log Analytics all in westus (next to the DB). Images tagged v1.
- Record of every command/output: docs/DOCUMENTACION_TECNICA.md section 19; generic guide docs/DESPLIEGUE_AZURE.md. Vars in infra/azure/vars.sh; secrets (incl. DEMO_PASSWORD for Azure demo accounts) only in gitignored infra/azure/secretos.sh.
- New route => update gateway/nginx.conf AND gateway/apim-policy.xml, re-upload policy (guide 9.3).
