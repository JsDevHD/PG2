# frontend/ — React SPA (implemented)

Spec: `frontend/06_Frontend_Especificacion.md`; implementation notes + deliberate deviations table in `frontend/README.md`.

## Stack / tooling
- React 18, TS 5, Vite 5, React Router 6 (v7 future flags on), TanStack Query 5, Axios, Tailwind 3 + shadcn-style primitives in `src/components/ui/` (Radix), react-hook-form + zod, date-fns (es), lucide-react, sonner toasts, `@fontsource-variable/inter`.
- pnpm 12 (`packageManager` pinned). pnpm blocks dependency build scripts: allowed ones listed in `frontend/pnpm-workspace.yaml` (`allowBuilds`). On this Windows box pnpm shims live in `%LOCALAPPDATA%\pnpm-shims`; they fail from Git Bash — run pnpm from PowerShell.
- Tests: Vitest + jsdom + Testing Library + MSW (`tests/mocks/handlers.ts`: one handler per backend endpoint, fake gateway `http://gateway.test` set in `vite.config.ts` test.env). `tests/render.tsx::renderApp(path, {as: role})` renders full app with routes/guards.
- Commands in `mem:suggested_commands`.

## Architecture invariants
- Only the gateway URL (`lib/config.ts`). Never call service URLs directly. Gateway contract: `mem:gateway`.
- `src/features/<auth|courses|projects|feedback|export>/api.ts` = pure axios fns; `hooks.ts` = TanStack hooks with query-key factories (`courseKeys`, `versionKeys`, `feedbackKeys`). Components never import `axiosInstance`.
- Mutations must invalidate dependent keys: feedback/final grade/upload also invalidate `courseKeys.progress` (progress depends on feedback).
- No `GET /courses/{id}` or `/projects/{id}` in backend: `useCourse`/`useProject` derive from lists; pages wrap in `CourseGate`/`ProjectGate` (not in list ⇒ "No tienes acceso", never 404).
- `src/types/api.ts` mirrors real Pydantic schema names (not spec names).
- Session: JWT in localStorage `auth_token` (`lib/session.ts`); axios 401 ⇒ clear + `notifySessionExpired` (AuthContext listens); 403 never logs out. Errors normalized by `lib/errors.ts::toApiError` (403→forbidden msg, 422→backend `detail` next to field, 5xx→generic).
- Version files: Blob is private ⇒ always via `GET .../versions/{id}/file` (`useVersionFileUrl` → blob: URL). SECURITY: what to render is decided by the blob's real MIME type, never the file extension (blob: URLs share the app origin; an SVG opened as a document could steal the token). Images/SVG only in `<img>`, iframe only for `application/pdf`; downloads go through `lib/download.ts::downloadBlob` (re-typed `application/octet-stream`). Object URLs are created and revoked in the same effect (StrictMode). Blob responses with errors must be re-parsed (`features/export/hooks.ts::normalizeBlobError`).
- Session revalidation (`AuthContext`) ends the session only on 401; network/5xx ⇒ `sessionError` + retry in `ProtectedRoute`. Interceptor decides 401 by whether the request carried `Authorization`. Cross-tab token changes handled via the `storage` event.
- Scores: blank input → `undefined` via `z.preprocess` (never coerced to 0). Partial feedback score is optional (`feedbackSchema`) and omitted from the body when blank; final grade uses `finalGradeSchema` (required). `feedback/hooks.ts::currentPartialGrade` = current partial grade of a version; `FeedbackForm` warns (aria-live) that a typed score will replace it; thread shows replaced scores struck through. 422/409 from mutations are shown inside the form/dialog (`setError` / `role="alert"`), toasts only for network/5xx.
- Final grade: `FinalGradePanel`/`ExportButton` are keyed by the evaluated student and only submit a version belonging to that student (Feedback derives the student from the version; final grades are irreversible).
- No client-side reimplementation of RF-08 percentages (only course-level `/progress` is shown as %); per-project shows counts only.
- Runtime config: gateway URL is NOT baked into the build. `API_GATEWAY_URL=""` (compose default) = same origin: frontend Nginx proxies `/api/` to `API_PROXY_UPSTREAM` (`http://gateway:8080`), so only port 3000 needs exposing (VS Code port forwarding / dev tunnels; no CORS). `config.ts` treats `""` as same origin and `undefined` (pnpm dev) as fallback to `VITE_API_GATEWAY_URL`. `src/lib/config.ts` reads `window.__ENV__` from `/config.js` (generated at container start by `docker/40-runtime-config.sh` from `API_GATEWAY_URL`), falling back to `VITE_API_GATEWAY_URL` in dev (`public/config.js` is empty). `nginx.conf` is an envsubst template with a CSP whose `connect-src` uses `${API_GATEWAY_URL}`.
- Version numbering is per student, chronological (`numberVersions`).
- Guards: `RoleRoute allow=[docente]` for create project/progress, `allow=[estudiante]` for upload.

## Design system
- Tokens in `src/styles/globals.css` as RGB channels (`--color-ink: 31 41 55`) and `tailwind.config.ts` uses `rgb(var(--x) / <alpha-value>)` — required for opacity modifiers (`bg-ink/10`). Never raw hex in components; `*-ink` tokens are dark text on `*-soft` backgrounds.
- Role accent: teacher = purple (`teacher`), student = blue (`student`), shared/feedback = green (`shared`).
- Shell (`components/layout/AppShell.tsx`): sticky dark header + `.ruler` (role-colored ruler with tick marks, `ruler-teacher` variant) + left `AppSidebar` (courses, active course's projects, teacher shortcuts, account footer) fixed on `lg`, opened as Radix `SheetContent` from the header menu on mobile. Main area uses `.mat` (cutting-mat grid, tinted by `mat-student`/`mat-teacher`). These classes are deliberately NOT named `bg-*`: tailwind-merge (`cn`) drops one of two `bg-*` classes. On mobile `PageHeader` renders as a full-bleed white band.
- Signature element: version "proof strip" (`features/projects/VersionStrip.tsx`) with big tabular `vN`. No ALL-CAPS labels. Mobile-first; verified no horizontal scroll at 360 px.
- Changing `tailwind.config.ts` requires restarting `pnpm dev`.

## Legal (Colombia)
- Public routes `/legal/privacidad|terminos|derechos-de-autor` (`features/legal/*`, `LegalDocument` + `LegalShell`), linked from `SidebarLegal` (bottom of AppSidebar, above the account) inside the app and from `Colophon` (dark bar at the bottom of PublicShell/LegalShell); never as a footer inside the content column. Responsible = UDI (NIT 890212433-5, `datos@udi.edu.co`, institutional policy Acuerdo 03/2019) in `features/legal/legalConfig.ts`. Framing: academic degree project, data does not leave the university.
- Register sends `accept_legal` + `legal_version` (Auth stores `users.legal_consent`); upload sends `rights_declaration=true` (Projects stores `versions.rights_declared_at`). Both use `ConsentCheckbox` (never pre-checked). Bump `LEGAL_VERSION` (and `scripts/seed_demo.py`) when purposes/responsible change.
- Don't set `Content-Type` manually on FormData uploads (axios adds the boundary). jsdom can't serialize FormData to MSW: tests spy on `FormData.prototype.append`.

## UI gotchas (audit 2026-10-08)
- Never give the same `key` to sibling elements (it left stale "Cierre del proyecto" panels piling up); key the wrapper instead. `VersionHistory` is keyed by `project.id` in `ProjectGate`.
- Explicit logout: `AuthContext.logout()` sets `signedOut=true` and `ProtectedRoute` then redirects to /login WITHOUT `state.from` (with `v7_startTransition` a `navigate()` before `logout()` loses the race, and the next account landed on the previous account's URL). A 401 expiry still remembers `from`.
- Per-page tab title via `useDocumentTitle` (`src/lib/useDocumentTitle.ts`), called by `PageHeader` (`documentTitle` prop overrides), Login/Register, StatusPages and LegalDocument.
- User text (comments, descriptions) uses `break-words`; feedback comments > 600 chars or > 8 lines are clamped with "Ver comentario completo" (`CommentText` in FeedbackThread).
- FeedbackForm: submit button sits in a `flex-wrap` footer (the form also lives in the narrow column of VersionDetail); don't put it side by side with the score field.
- On < md, selecting a version in the history scrolls to `#retroalimentacion` (otherwise the tap looks like it did nothing).
- `CourseCode` falls back to `execCommand("copy")` when `navigator.clipboard` is missing (plain http over LAN IP).
- Claude-in-Chrome clicks do not reach `type="submit"` buttons (no pointer events are delivered); submit with Enter or `form.requestSubmit()` when auditing. The CSP blocks iframes, so mobile checks use Playwright (`channel: "chrome"`).
