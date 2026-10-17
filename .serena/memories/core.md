# Core — Sistema de Seguimiento de Proyectos Gráficos (proyecto de grado)

Backend of FastAPI + MongoDB microservices. Docs/comments/error messages are in Spanish.
Frontend React SPA in `frontend/`, talking to the services only through the API gateway.

## Source map
- `service-template/` — base every service is copied from; defines shared infra + rules. `mem:architecture` covers cross-service contracts.
- `Auth_Service/` — users, bcrypt, the ONLY JWT issuer. `mem:services/auth`
- `Projects_Service/` — courses, projects, versions (+ Blob upload), progress. `mem:services/projects`
- `Feedback_Service/` — feedback, partial/final grades. `mem:services/feedback`
- `Export_Service/` — aggregates data, builds PDF portfolio (ReportLab). `mem:services/export`
- `frontend/` — React SPA (pnpm); stack, layering rules, design tokens and gotchas in `mem:frontend/core`.
- `gateway/` — local Nginx API gateway (Azure: API Management); routing contract and CORS/JWT rules in `mem:gateway`.
- `scripts/seed_demo.py` — demo data through the gateway.
- `docker-compose.yml` (root) — full system (frontend, gateway, 4 services, Mongo, Azurite); per-service composes for standalone dev.
- `docs/MOCKUPS/` — UI mockups (png) and drawio diagrams (architecture, class, sequence). Not code.
- Folder names are `Xxx_Service` but READMEs/SERVICE_NAME call them `xxx-service`.

## Project-wide invariants
- Each service is an independent Python project with its own top-level `app` package; imports are `from app...`. Run tools from inside the service folder, never from repo root (name clash between services).
- All services share one Mongo DB (`graphic_tracker`); each collection has exactly one owner service (see `mem:architecture`).
- Requirement ids (RF-xx, RNF-xx, CU-xx, H-6) refer to the thesis spec; H-6 = membership check on course/project/version.
- Tech/tooling: `mem:tech_stack`; commands: `mem:suggested_commands`; code style and layering rules: `mem:conventions`; done-checklist: `mem:task_completion`.
