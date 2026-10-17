# Frontend — Especificación Técnica Completa

**Proyecto:** Sistema de Seguimiento de Proyectos Gráficos
**Depende de:** `01_Template_Microservicio_Backend.md` y `02`–`05` (contratos exactos de API que este frontend consume).
**Requisitos que cubre:** todos los RF (RF-01 a RF-10) desde la perspectiva de interfaz.
**Mockups de referencia:** `01_login.png` a `07_exportar_pdf.png`, mapeados 1 a 1 a pantallas reales en la sección 9.
**Diagramas de referencia:** `Arquitectura_Sistema.drawio` (el frontend es el nodo "Frontend" que habla con el API Gateway), `Secuencia_SubirVersion_H6.drawio`, `Secuencia_Retroalimentacion_H6.drawio`.

**Alcance de este documento:** una sola aplicación web (SPA), responsive, que sirve tanto a estudiantes como a docentes con una interfaz que se adapta por rol — no dos aplicaciones separadas.

---

## 1. Objetivo

Construir el cliente web del sistema: una SPA en React que consume los cuatro microservicios **exclusivamente a través del API Gateway** (nunca llama a un microservicio directamente), implementa las 13 vistas de los mockups ya aprobados, y cumple RNF-03 (funcional desde 360 px, SUS ≥ 68).

**No es objetivo de este documento:** ningún cambio de contrato en el backend. Si al implementar se descubre que falta un campo en una respuesta, se documenta como hallazgo y se ajusta primero el microservicio correspondiente (ver `02`–`05`), nunca se parchea en el frontend con lógica que no debería vivir ahí.

## 2. Stack tecnológico

| Capa | Elección | Justificación |
|---|---|---|
| Librería UI | React 18 (`react@^18.3`, `react-dom@^18.3`) | Estándar de facto, ecosistema maduro, ya definido desde el anteproyecto |
| Lenguaje | TypeScript 5 (`typescript@^5.6`) | El backend ya es fuertemente tipado (Pydantic); TypeScript mantiene esa disciplina del lado del cliente y documenta los contratos de API como tipos, no como comentarios |
| Build tool | Vite (`vite@^5.4`) | Arranque y HMR casi instantáneos, config mínima; no se usa Create React App (descontinuado) ni Next.js (no hay necesidad de SSR/SEO — es una herramienta interna autenticada) |
| Enrutamiento | React Router (`react-router-dom@^6.26`) | Estándar para SPA en React; soporta rutas anidadas y protegidas de forma nativa |
| Estado de servidor | TanStack Query (`@tanstack/react-query@^5.59`) | Cachea, refresca y maneja loading/error de cada llamada a la API sin reinventar esa lógica a mano en cada componente — crítico dado que casi toda la app es CRUD contra el backend |
| Estado de cliente | React Context + `useState`/`useReducer` | Solo para sesión (usuario actual, token). No se usa Redux/Zustand — no hay suficiente estado de cliente puro para justificarlo; TanStack Query ya cubre el estado de servidor, que es el grueso de la app |
| Cliente HTTP | Axios (`axios@^1.7`) | Ya definido desde el anteproyecto; interceptores nativos facilitan adjuntar el JWT y manejar 401/403 de forma centralizada |
| Estilos | Tailwind CSS (`tailwindcss@^3.4`) | Ya definido desde el anteproyecto; utility-first encaja con el enfoque Mobile First |
| Componentes base | shadcn/ui (copiado al repo, no es una dependencia de npm tradicional) + Radix UI como base accesible | Componentes accesibles (foco, teclado, ARIA) sin cargar con un design system pesado; se copian solo los componentes que se usan |
| Iconografía | `lucide-react@^0.445` | Set de iconos consistente, usado también por shadcn/ui |
| Formularios | `react-hook-form@^7.53` + `zod@^3.23` (`@hookform/resolvers`) | Validación declarativa con el mismo esquema reutilizable entre formulario y tipos TypeScript |
| Fechas | `date-fns@^4.1` | Formateo de fechas (historial cronológico) sin la sobrecarga de Moment.js |
| Testing unitario/integración | `vitest@^2.1`, `@testing-library/react@^16`, `msw@^2.4` | Vitest comparte config con Vite; MSW intercepta llamadas HTTP para probar componentes sin un backend real corriendo |
| Testing E2E (recomendado, no bloqueante) | Playwright | Cubre los 4 casos núcleo (CU-01 a CU-04) de principio a fin; se marca como deseable dado el tiempo del MVP, no como requisito de Definition of Done |
| Lint + formato | Biome (`@biomejs/biome@^1.9`) | Un solo tool para lint y formato (igual que `ruff` en el backend), reemplaza ESLint+Prettier |
| Contenedor | Docker multi-stage: Node para build, Nginx para servir estático | Compatible con Azure Container Apps; el frontend compilado es HTML/CSS/JS estático, no necesita Node en runtime |

## 3. Principios de diseño de la arquitectura

1. **Una sola app, UI adaptativa por rol** — no hay un "frontend de estudiante" y un "frontend de docente" separados. El rol viene de `AuthContext` (derivado del JWT) y determina qué se renderiza, igual que el backend determina qué se autoriza. Esto es deliberado: reduce la duplicación de componentes y mantiene una única fuente de verdad del rol (el token), igual que en el backend.
2. **Todo pasa por el API Gateway** — el frontend tiene una única `VITE_API_GATEWAY_URL`. Nunca conoce las URLs internas de los cuatro microservicios (eso es responsabilidad del Gateway, ver sección 8).
3. **El servidor es la fuente de verdad** — no se duplica lógica de negocio en el cliente (ej. la fórmula de progreso de RF-08 se calcula en Projects Service; el frontend solo la muestra). El cliente valida formularios por UX (feedback inmediato), pero la validación real y la autorización siempre ocurren en el backend.
4. **Componentes server-state-aware, no componentes "tontos" con props manuales** — las pantallas que muestran datos del backend usan hooks de TanStack Query (`useCourses()`, `useVersions(projectId)`, etc.), no `useEffect` + `fetch` manual repetido en cada componente.
5. **Mobile First real, no responsive como ocurrencia tardía** — todo componente se diseña primero para 360 px (RNF-03) y se expande con los breakpoints de Tailwind (`sm`, `md`, `lg`), nunca al revés.

## 4. Estructura de carpetas

```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx                      # Providers (QueryClient, AuthProvider, Router)
│   ├── routes/
│   │   ├── index.tsx                 # Definición de rutas + guards
│   │   ├── ProtectedRoute.tsx        # Redirige a /login si no hay sesión
│   │   └── RoleRoute.tsx             # Redirige si el rol no coincide
│   ├── features/
│   │   ├── auth/
│   │   │   ├── api.ts                # login(), register(), getMe()
│   │   │   ├── AuthContext.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   └── types.ts
│   │   ├── courses/
│   │   │   ├── api.ts                # createCourse(), joinCourse(), listCourses(), listProjects(), createProject()
│   │   │   ├── CourseOnboardingPage.tsx   # mockup 02
│   │   │   ├── TeacherDashboardPage.tsx   # mockup 03
│   │   │   ├── StudentDashboardPage.tsx   # mockup 04
│   │   │   ├── useProgress.ts
│   │   │   └── types.ts
│   │   ├── projects/
│   │   │   ├── api.ts                # uploadVersion(), listVersions(), getVersion()
│   │   │   ├── UploadVersionPage.tsx      # mockup 05
│   │   │   ├── VersionHistoryPage.tsx     # mockup 06 (incluye feedback)
│   │   │   └── types.ts
│   │   ├── feedback/
│   │   │   ├── api.ts                # createFeedback(), listFeedback(), assignFinalGrade()
│   │   │   ├── FeedbackForm.tsx
│   │   │   ├── FeedbackThread.tsx
│   │   │   └── types.ts
│   │   └── export/
│   │       ├── api.ts                # exportPortfolio()
│   │       └── ExportButton.tsx           # mockup 07
│   ├── components/
│   │   └── ui/                       # primitives de shadcn/ui: button, card, input, dialog, badge, progress...
│   ├── lib/
│   │   ├── axios.ts                  # instancia única + interceptores
│   │   ├── queryClient.ts
│   │   └── utils.ts                  # cn(), formatDate(), etc.
│   ├── hooks/
│   │   └── useRequireAuth.ts
│   ├── types/
│   │   └── api.ts                    # tipos espejo de los schemas Pydantic del backend
│   └── styles/
│       └── globals.css               # directivas de Tailwind + tokens de diseño (sección 5)
├── public/
├── tests/
│   ├── setup.ts
│   └── mocks/
│       └── handlers.ts               # handlers de MSW, uno por endpoint
├── e2e/                               # Playwright (opcional)
├── .env.example
├── .gitignore
├── Dockerfile
├── nginx.conf
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── biome.json
├── package.json
└── README.md
```

Convención: cada carpeta de `features/` es dueña de su `api.ts` y sus tipos — ningún componente llama a Axios directamente, siempre pasa por la función de `api.ts` de su propio feature, envuelta en un hook de TanStack Query.

## 5. Sistema de diseño (estética)

La identidad visual **reutiliza deliberadamente** la paleta ya usada en los diagramas del proyecto (casos de uso, clases, arquitectura), para que exista una coherencia visual entre la documentación técnica y el producto final — no es casual, es una decisión de diseño.

### 5.1 Paleta de colores

| Token | Hex | Uso |
|---|---|---|
| `--color-ink` | `#1f2937` | Texto principal, header de la app (mismo tono que el header de los mockups) |
| `--color-student` | `#6c8ebf` (base) / `#dae8fc` (fondo suave) | Acentos y badges en vistas/acciones de estudiante — mismo azul que los diagramas |
| `--color-teacher` | `#9673a6` (base) / `#e1d5e7` (fondo suave) | Acentos y badges en vistas/acciones de docente — mismo morado que los diagramas |
| `--color-shared` | `#82b366` (base) / `#d5e8d4` (fondo suave) | Elementos compartidos entre roles (historial, retroalimentación) — mismo verde que los diagramas |
| `--color-warning` | `#d79b00` / `#ffe6cc` | Estados "pendiente", advertencias no bloqueantes |
| `--color-danger` | `#b85450` / `#f8cecc` | Errores, acciones destructivas (ninguna en el MVP, pero reservado) |
| `--color-bg` | `#f4f4f5` | Fondo general de la app |
| `--color-surface` | `#ffffff` | Tarjetas, paneles |
| `--color-border` | `#d1d5db` | Bordes sutiles |
| `--color-text-muted` | `#6b7280` | Texto secundario |

Implementadas como variables CSS en `styles/globals.css` y expuestas a Tailwind vía `tailwind.config.ts` (`theme.extend.colors`), nunca como valores hex sueltos dentro de los componentes.

### 5.2 Tipografía

- Familia: **Inter** (variable font, cargada vía `@fontsource/inter` — no Google Fonts por CDN, para que la app funcione sin depender de una red externa en tiempo de ejecución).
- Escala: `text-xs` (12px) para metadatos, `text-sm` (14px) cuerpo secundario, `text-base` (16px) cuerpo principal, `text-lg`/`text-xl` para subtítulos de tarjeta, `text-2xl`/`text-3xl` para títulos de página — la escala por defecto de Tailwind, sin personalizar, para no reinventar algo que ya es consistente.
- Pesos: 400 (cuerpo), 600 (énfasis/subtítulos), 700 (títulos).

### 5.3 Espaciado, bordes y sombra

- Espaciado: escala por defecto de Tailwind (múltiplos de 4px). Separación estándar entre tarjetas: `gap-4` (16px) en móvil, `gap-6` (24px) en `md:` en adelante.
- Radio de borde: `rounded-lg` (8px) para tarjetas e inputs, `rounded-full` para badges y avatares — coincide con el estilo ya usado en los mockups.
- Sombra: `shadow-sm` en tarjetas por defecto, `shadow-md` solo en elementos flotantes (dropdowns, modales) — deliberadamente sutil, no "card soup" con sombras pesadas everywhere.

### 5.4 Componentes base (catálogo mínimo de `components/ui/`)

`Button` (variantes: primary, secondary, ghost, destructive — tamaños sm/md/lg), `Card`, `Input`, `Textarea`, `Select`, `Badge` (usa los tokens de color por rol), `ProgressBar`, `Dialog` (modales), `Toast` (notificaciones de éxito/error), `Skeleton` (estados de carga), `FileDropzone` (RF-03), `Avatar`. Cada uno copiado/adaptado de shadcn/ui, no reinventado desde cero.

### 5.5 Responsive — breakpoints

Mobile First estricto: todo componente se escribe sin prefijo (base = 360–639 px) y se ajusta con `sm:` (≥640px, tablet chico), `md:` (≥768px), `lg:` (≥1024px, escritorio). El layout de dos columnas de los dashboards (mockups 03/04) colapsa a una sola columna por debajo de `md:`.

## 6. Enrutamiento y protección de rutas

```tsx
// routes/index.tsx (estructura, no código final)
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/register" element={<RegisterPage />} />

  <Route element={<ProtectedRoute />}>           {/* requiere JWT válido */}
    <Route path="/" element={<CourseOnboardingPage />} />
    <Route path="/courses/:courseId" element={<CourseDashboardRouter />} /> {/* decide Teacher/Student por rol */}
    <Route path="/courses/:courseId/projects/:projectId/upload" element={<UploadVersionPage />} />
    <Route path="/courses/:courseId/projects/:projectId/versions" element={<VersionHistoryPage />} />
    <Route path="/courses/:courseId/projects/:projectId/versions/:versionId" element={<VersionDetailPage />} />

    <Route element={<RoleRoute allow={["docente"]} />}>   {/* requiere rol docente */}
      <Route path="/courses/:courseId/projects/new" element={<CreateProjectPage />} />
      <Route path="/courses/:courseId/progress" element={<TeacherProgressPage />} />
    </Route>
  </Route>

  <Route path="*" element={<NotFoundPage />} />
</Routes>
```

`ProtectedRoute` lee `AuthContext`; si no hay token válido, `<Navigate to="/login" replace />`. `RoleRoute` recibe `allow: Role[]`; si `user.role` no está en la lista, redirige a una página de "no autorizado" (nunca intenta ocultar la ruta solo visualmente — la protección real sigue siendo del backend, esto es UX, no seguridad).

## 7. Autenticación y gestión de sesión

### 7.1 Dónde vive el token

El JWT se guarda en `localStorage` bajo la clave `auth_token`, y se replica en memoria dentro de `AuthContext` para evitar leerlo del storage en cada render.

**Tradeoff reconocido explícitamente:** `localStorage` es accesible por JavaScript, lo que lo expone a robo vía XSS si existiera una vulnerabilidad de inyección de script en la app. La alternativa más segura es una cookie `httpOnly` — pero eso requiere que Auth Service (`02_Auth_Service...md`) devuelva el token como `Set-Cookie` en vez de en el cuerpo JSON, lo cual **no está** en su especificación actual. Para el MVP se acepta `localStorage` por simplicidad y porque el riesgo se mitiga con la disciplina normal de React (JSX escapa por defecto, no se usa `dangerouslySetInnerHTML` en ningún punto de este documento). Si se quiere elevar la seguridad más adelante, el cambio queda documentado como trabajo futuro: mover la emisión del token a una cookie `httpOnly` + `SameSite=Strict` en Auth Service.

### 7.2 `AuthContext`

Expone: `user: UserResponse | null`, `token: string | null`, `login(email, password)`, `register(...)`, `logout()`, `isLoading: boolean`. Al montar la app, si hay un token en `localStorage`, se llama a `GET /api/v1/auth/me` para revalidarlo y poblar `user` — si responde 401 (expiró), se limpia la sesión y se redirige a `/login`.

### 7.3 Interceptores de Axios (`lib/axios.ts`)

- **Request interceptor:** adjunta `Authorization: Bearer <token>` a toda petición si existe token en `AuthContext`.
- **Response interceptor:** si la respuesta es 401, limpia la sesión y redirige a `/login` (token inválido o expirado — RNF-01, expiración de 60 min). Si es 403, no cierra sesión (el usuario sigue autenticado, simplemente no tiene permiso sobre ese recurso específico — H-6) y deja que el componente que hizo la llamada muestre el mensaje de error correspondiente vía TanStack Query (`isError`).

## 8. Conexión con el backend — API Gateway

El frontend **nunca** apunta a `auth-service`, `projects-service`, `feedback-service` ni `export-service` directamente. Una sola variable de entorno:

```
VITE_API_GATEWAY_URL=https://api.seguimiento-graficos.example.com
```

El Gateway enruta por prefijo de path hacia el microservicio correspondiente — esta tabla es la referencia exacta que cualquier desarrollador frontend necesita, sin tener que abrir los documentos de los cuatro servicios:

| Prefijo de ruta (visto por el frontend) | Microservicio destino | Especificación |
|---|---|---|
| `/api/v1/auth/*`, `/api/v1/users/*` | Auth Service | `02_Auth_Service_Especificacion.md` |
| `/api/v1/courses/*`, `/api/v1/projects/{id}/versions*`, `/api/v1/projects/{id}/progress`, `/api/v1/courses/{id}/progress` | Projects Service | `03_Projects_Service_Especificacion.md` |
| `/api/v1/versions/{id}/feedback`, `/api/v1/projects/{id}/feedback`, `/api/v1/projects/{id}/final-grade` | Feedback Service | `04_Feedback_Service_Especificacion.md` |
| `/api/v1/projects/{id}/export` | Export Service | `05_Export_Service_Especificacion.md` |

Si esta tabla y la configuración real del Gateway llegan a divergir, el Gateway es el que está mal configurado — esta tabla es la especificación de contrato, no una sugerencia.

### 8.1 Tipos TypeScript espejo de los contratos del backend (`types/api.ts`)

Cada tipo se nombra igual que el schema Pydantic correspondiente, para que buscar `UserResponse` en el frontend lleve directo al mismo nombre en `02_Auth_Service...md`:

```typescript
export type Role = "estudiante" | "docente";

export interface UserResponse {
  id: string; name: string; email: string; role: Role; created_at: string;
}
export interface TokenResponse {
  access_token: string; token_type: string; expires_in: number;
}
export interface CourseResponse {
  id: string; name: string; course_code: string; teacher_id: string;
}
export interface ProjectResponse {
  id: string; course_id: string; title: string; description: string; created_at: string;
}
export interface VersionResponse {
  id: string; project_id: string; student_id: string; file_url: string;
  description: string; uploaded_at: string;
}
export interface FeedbackResponse {
  id: string; version_id: string; teacher_id: string; comment: string;
  score: number; is_final: boolean; created_at: string;
}
export interface ProgressStudentView {
  course_id: string; student_id: "me"; versions_count: number;
  versions_with_feedback: number; progress_percentage: number;
}
export interface ProgressTeacherView {
  course_id: string; versions_count: number; versions_with_feedback: number;
  progress_percentage: number;
  students: Array<{ student_id: string; student_name: string | null;
    versions_count: number; versions_with_feedback: number; progress_percentage: number }>;
}
```

### 8.2 Ejemplo de capa `api.ts` por feature (patrón a replicar en los cinco features)

```typescript
// features/projects/api.ts
import { axiosInstance } from "@/lib/axios";
import type { VersionResponse } from "@/types/api";

export async function uploadVersion(projectId: string, file: File, description: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("description", description);
  const { data } = await axiosInstance.post<VersionResponse>(
    `/api/v1/projects/${projectId}/versions`, form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}

export async function listVersions(projectId: string, studentId?: string) {
  const { data } = await axiosInstance.get<VersionResponse[]>(
    `/api/v1/projects/${projectId}/versions`, { params: { student_id: studentId } }
  );
  return data;
}
```

Y su hook de TanStack Query correspondiente:

```typescript
// features/projects/useVersions.ts
export function useVersions(projectId: string, studentId?: string) {
  return useQuery({
    queryKey: ["versions", projectId, studentId],
    queryFn: () => listVersions(projectId, studentId),
  });
}

export function useUploadVersion(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { file: File; description: string }) =>
      uploadVersion(projectId, vars.file, vars.description),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["versions", projectId] }),
  });
}
```

Este patrón (una función pura en `api.ts` + un hook delgado de TanStack Query) se repite para los 14 endpoints documentados en `02`–`05`, sin excepción — ningún componente usa `axiosInstance` directamente.

## 9. Mapeo de pantallas (mockups → páginas reales)

| Mockup | Página/componente | Ruta | Hooks que consume |
|---|---|---|---|
| `01_login.png` | `LoginPage` | `/login` | `useLogin()` (mutation) |
| `02_crear_unirse_curso.png` | `CourseOnboardingPage` | `/` | `useCreateCourse()` (docente) / `useJoinCourse()` (estudiante), renderizado condicional por `user.role` |
| `03_dashboard_docente.png` | `TeacherDashboardPage` | `/courses/:courseId` (si `role=docente`) | `useCourseProjects()`, `useProgress(courseId)` (vista docente) |
| `04_dashboard_estudiante.png` | `StudentDashboardPage` | `/courses/:courseId` (si `role=estudiante`) | `useCourseProjects()`, `useProgress(courseId)` (vista estudiante) |
| `05_subir_version.png` | `UploadVersionPage` | `/courses/:courseId/projects/:projectId/upload` | `useVersions(projectId)` (panel lateral), `useUploadVersion(projectId)` |
| `06_historial_feedback.png` | `VersionHistoryPage` + `FeedbackThread` | `/courses/:courseId/projects/:projectId/versions` | `useVersions(projectId)`, `useFeedback(versionId)`, `useCreateFeedback(versionId)` (solo si `role=docente`) |
| `07_exportar_pdf.png` | `ExportButton` (componente embebido, no página aparte) | — (vive dentro de `VersionHistoryPage`) | `useExportPortfolio(projectId, studentId)` — dispara la descarga del blob PDF |

`CourseDashboardRouter` es un componente delgado que lee `user.role` y renderiza `TeacherDashboardPage` o `StudentDashboardPage` — así la ruta `/courses/:courseId` es una sola en `routes/index.tsx`, coherente con el principio 1 de la sección 3 (una sola app, UI adaptativa).

**Detalle de `ExportButton`:** como el endpoint de Export Service devuelve el binario del PDF directamente (no una URL), la descarga se dispara con `axiosInstance.get(..., { responseType: "blob" })`, creando un `URL.createObjectURL()` temporal y un `<a download>` programático — no se abre el PDF en una pestaña nueva del navegador por defecto, se descarga directo, que es el comportamiento que muestra el mockup.

## 10. Manejo de errores, carga y estados vacíos

- **Carga:** `Skeleton` (placeholders grises con la misma forma del contenido final) en vez de un spinner genérico centrado — mantiene el layout estable mientras carga (evita saltos de contenido).
- **Error de red/servidor (5xx, timeout):** `Toast` con "No se pudo conectar con el servidor. Intenta de nuevo." + botón de reintentar (`refetch()` de TanStack Query).
- **403 (H-6, sin pertenencia al curso/proyecto):** página o banner dedicado, mensaje claro: "No tienes acceso a este curso." — nunca un error genérico ni un 404 (eso ocultaría la causa real).
- **404 (recurso no existe):** página "No encontrado" con enlace de vuelta al panel.
- **422 (validación, ej. RNF-05 archivo inválido):** el mensaje de `detail` del backend se muestra directamente junto al campo del formulario correspondiente — no se inventa un mensaje distinto en el cliente.
- **Estado vacío** (ej. un proyecto sin versiones aún): ilustración simple + texto + call-to-action ("Sube tu primera versión"), nunca una tabla/lista en blanco sin explicación.

## 11. Formularios y validación

Cada formulario define su esquema con `zod`, compartido entre la validación de `react-hook-form` y el tipado del payload enviado a `api.ts`. Ejemplo (registro, RF-10):

```typescript
const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  role: z.enum(["estudiante", "docente"]),
});
```

El mismo `min(8)` y `email()` existen porque el backend ya los valida (`02_Auth_Service...md`, sección 4.1) — esto es validación de UX (feedback antes de enviar), no un reemplazo de la validación del servidor, que sigue siendo la autoridad final.

## 12. Accesibilidad

- Todo elemento interactivo es alcanzable por teclado (los componentes de Radix UI subyacentes a shadcn/ui ya lo garantizan).
- Contraste de color verificado contra los tokens de la sección 5.1 (texto principal `#1f2937` sobre `#ffffff`/`#f4f4f5` cumple WCAG AA).
- Imágenes de evidencia (versiones subidas) llevan `alt` descriptivo generado a partir de la descripción de la versión, no un `alt` vacío.
- Formularios con `<label>` asociado a cada campo (no solo `placeholder`, que desaparece al escribir).

## 13. Variables de entorno

```
# .env.example
VITE_API_GATEWAY_URL=http://localhost:8080
VITE_APP_NAME=Seguimiento de Proyectos Gráficos
```

## 14. `Dockerfile` (multi-stage) y `nginx.conf`

```dockerfile
# ---- build stage ----
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

```nginx
# nginx.conf — necesario para que las rutas de React Router no den 404 al refrescar
server {
    listen 80;
    root /usr/share/nginx/html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

El frontend compilado es estático; no necesita Node en producción, solo Nginx sirviendo los archivos — igual de ligero que los contenedores del backend, consistente con la justificación de Azure Container Apps ya documentada en la arquitectura general.

## 15. Testing

- Un test de render + interacción básica por página (ej. `LoginPage` renderiza el formulario, el submit llama a `login()` con los valores correctos).
- `tests/mocks/handlers.ts` define un handler de MSW por cada uno de los 14 endpoints de `02`–`05`, reutilizando las respuestas de ejemplo ya documentadas ahí — así los tests de frontend no dependen de los microservicios reales corriendo.
- Al menos un test de **estado protegido por rol**: un componente marcado `RoleRoute allow={["docente"]}` redirige si el usuario autenticado es estudiante (verifica que H-6 también se respeta visualmente, no solo en el backend).

## 16. `package.json` — dependencias de referencia

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "@tanstack/react-query": "^5.59.0",
    "axios": "^1.7.0",
    "react-hook-form": "^7.53.0",
    "@hookform/resolvers": "^3.9.0",
    "zod": "^3.23.0",
    "date-fns": "^4.1.0",
    "lucide-react": "^0.445.0",
    "@fontsource/inter": "^5.1.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^3.4.0",
    "vitest": "^2.1.0",
    "@testing-library/react": "^16.0.0",
    "msw": "^2.4.0",
    "@biomejs/biome": "^1.9.0"
  }
}
```

## 17. Definition of Done

- [ ] `docker compose up` (o `npm run dev`) levanta la app y `/login` renderiza.
- [ ] Las 7 pantallas de los mockups existen como páginas funcionales, conectadas a sus endpoints reales (no datos mock en el build de producción).
- [ ] Un estudiante y un docente de prueba pueden completar los 4 flujos núcleo (CU-01 a CU-04) de principio a fin contra el backend real.
- [ ] `RoleRoute` bloquea correctamente el acceso cruzado de rol (verificado con al menos un test).
- [ ] La app es usable a 360 px de ancho sin scroll horizontal (RNF-03).
- [ ] `biome check .` sin errores.
- [ ] `vitest run` pasa todos los tests.
- [ ] `docker build` produce una imagen que Nginx sirve correctamente, incluidas las rutas internas de React Router al refrescar.

---

## 18. Tarea para Claude Code

1. Inicializar el proyecto con Vite (`npm create vite@latest frontend -- --template react-ts`) y configurar Tailwind, Biome, Vitest según las secciones 2 y 4.
2. Crear la estructura de carpetas de la sección 4.
3. Implementar `lib/axios.ts` con los interceptores de la sección 7.3, y `features/auth/AuthContext.tsx` según la sección 7.2.
4. Implementar `types/api.ts` (sección 8.1) copiando exactamente los contratos de `02`–`05`.
5. Implementar el catálogo de `components/ui/` (sección 5.4), copiando los componentes necesarios de shadcn/ui y aplicando los tokens de diseño de la sección 5.1–5.3 en `tailwind.config.ts` y `styles/globals.css`.
6. Implementar cada `features/*/api.ts` siguiendo el patrón de la sección 8.2, uno por cada endpoint documentado en `02`–`05` — sin inventar endpoints que no estén especificados ahí.
7. Implementar las 7 páginas según el mapeo de la sección 9, reusando los componentes de la sección 5.4.
8. Implementar el enrutamiento y los guards de la sección 6.
9. Escribir los tests de la sección 15, incluidos los handlers de MSW.
10. Escribir `Dockerfile` y `nginx.conf` según la sección 14.
11. Verificar la Definition of Done (sección 17) completa antes de dar la tarea por terminada.
12. No modificar ningún contrato de API — si algo no cuadra con `02`–`05`, detener y reportarlo en vez de improvisar un cambio de backend desde el frontend.
