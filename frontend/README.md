# frontend

SPA en React del **Sistema de Seguimiento de Proyectos Gráficos**: una sola aplicación para
estudiantes y docentes, con interfaz adaptada al rol. Especificación completa:
`06_Frontend_Especificacion.md` (en esta carpeta).

Habla **solo con el API Gateway** (`VITE_API_GATEWAY_URL`): en local es el Nginx de `gateway/`,
en Azure será API Management. Nunca conoce las URLs de los microservicios.

## Stack

React 18 + TypeScript 5 + Vite 5, React Router 6, TanStack Query 5, Axios, Tailwind CSS 3 +
componentes de shadcn/ui copiados en `src/components/ui/` (sobre Radix UI), react-hook-form +
zod, date-fns, lucide-react, Inter (`@fontsource-variable/inter`, sin CDN). Tests con Vitest,
Testing Library y MSW; lint y formato con Biome. Gestor de paquetes: **pnpm**.

## Levantar en local

Requisitos: Node 20+ y pnpm (`corepack enable pnpm`), y el backend con el gateway corriendo
(`docker compose up -d` en la raíz del repositorio).

```powershell
Copy-Item .env.example .env
pnpm install
pnpm dev          # http://localhost:5173
```

Usa `http://localhost:5173` (no `127.0.0.1`): es el origen que los microservicios permiten en
CORS. Para tener datos de prueba: `..\.venv\Scripts\python ..\scripts\seed_demo.py` (las cuentas
están documentadas en ese script).

Con Docker, el `docker-compose.yml` de la raíz construye y sirve el frontend en
`http://localhost:3000`.

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo con recarga en caliente |
| `pnpm build` | Typecheck (`tsc -b`) + build de producción en `dist/` |
| `pnpm test` | Tests (Vitest + MSW, sin backend real) |
| `pnpm check` | Lint y formato con Biome (`pnpm format` aplica los arreglos) |

Si cambias `tailwind.config.ts`, reinicia `pnpm dev`: la configuración de Tailwind no se recarga
en caliente.

## Estructura

```
src/
├── App.tsx, main.tsx          # providers (QueryClient, AuthProvider, Router)
├── routes/                    # rutas + ProtectedRoute (sesión) + RoleRoute (rol)
├── features/
│   ├── auth/                  # login, registro, AuthContext, nombres vía /users/batch
│   ├── courses/               # cursos, proyectos (crear, editar, ocultar, eliminar), paneles por rol, progreso
│   ├── projects/              # versiones (subida, historial, detalle, vista previa) y grupos
│   ├── feedback/              # hilo, formulario, calificación final (por estudiante o por grupo)
│   └── export/                # PDF por proyecto y panel "Mi portafolio" del estudiante
├── components/ui/             # primitivas (Button, Card, Field, Badge, ProgressBar…)
├── components/layout/         # AppShell, PageHeader, estados vacío/error
├── lib/                       # axios (interceptores), sesión, errores, queryClient, tema, utils
├── types/api.ts               # tipos espejo de los schemas Pydantic
└── styles/globals.css         # tokens de diseño (sección 5.1) como canales RGB
tests/                         # tests por pantalla + mocks/handlers.ts (uno por endpoint)
```

Reglas:

- Cada feature es dueña de su `api.ts` (funciones puras con Axios) y de sus hooks de TanStack
  Query. Ningún componente usa `axiosInstance` directamente.
- El servidor es la fuente de verdad: el progreso, los permisos y las validaciones finales son del
  backend. El cliente valida formularios solo para dar feedback inmediato.
- Los colores salen de los tokens (`bg-student`, `text-teacher-ink`…), nunca de hex sueltos.
- Errores (sección 10): 403 → "sin acceso" (nunca 404); 422 → el `detail` del backend junto al
  campo; red/5xx → mensaje genérico con reintento.

## Diferencias con la especificación (y por qué)

| Especificación | Implementación | Motivo |
|---|---|---|
| npm (`npm ci`, `package-lock.json`) | pnpm (`pnpm-lock.yaml`) | Decisión del equipo |
| `ProgressStudentView` / `ProgressTeacherView`, `student_id: "me"` | `StudentProgressResponse` / `CourseProgressResponse`, `student_id` real | Nombres y forma reales del schema de Projects Service |
| `ProjectResponse` sin `created_by`; `FeedbackResponse` sin `project_id`/`student_id` | Incluidos | El backend los devuelve |
| Ruta `/api/v1/projects/{id}/progress` en la tabla del gateway | Solo `/api/v1/courses/{id}/progress` | Es la única que existe en el backend |
| 14 endpoints | 20 | 19 originales + `GET .../versions/{id}/file` |
| Imágenes desde `file_url` | `GET /api/v1/projects/{id}/versions/{versionId}/file` con JWT | Blob Storage es privado: `file_url` no se puede abrir desde el navegador (ni en Azure sin SAS) |
| `@fontsource/inter` | `@fontsource-variable/inter` | La spec pide la fuente variable |
| Upload sin guard de rol | `RoleRoute allow={["estudiante"]}` | Projects Service solo acepta subidas de estudiantes |

## Cómo llega el frontend al backend

El contenedor decide al arrancar (no al construir) a dónde llama el navegador:

| `API_GATEWAY_URL` | El navegador llama a | Uso |
|---|---|---|
| `""` (vacío, el de `docker-compose.yml`) | `/api/...` del mismo servidor; Nginx lo reenvía a `API_PROXY_UPSTREAM` (`http://gateway:8080`) | Local y túneles: basta exponer el puerto 3000, sin CORS |
| `https://<apim>.azure-api.net` | Directo a API Management | Azure (CORS configurado en APIM, ver `../gateway/README.md`) |

En desarrollo (`pnpm dev`) `public/config.js` viene vacío y se usa `VITE_API_GATEWAY_URL` de `.env`.

## Mostrarlo desde otro equipo (reenvío de puertos de VS Code)

1. Levanta todo: `docker compose up -d` en la raíz (Docker Desktop abierto).
2. En VS Code, panel **Puertos** (*Ports*; `Ctrl+Shift+P` → "Ports: Focus on Ports View") →
   **Reenviar un puerto** → `3000`. La primera vez pide iniciar sesión con GitHub o Microsoft.
3. Clic derecho sobre el puerto → **Visibilidad del puerto** → **Pública**.
4. Copia la **dirección reenviada** (`https://…-3000….devtunnels.ms`) y ábrela en el otro equipo.
   La primera vez aparece una página de aviso del túnel: se acepta con **Continuar**.

Usa el puerto **3000** (contenedor), no el 5173 de `pnpm dev`: este último llama al gateway en
`localhost:8080`, que desde otro equipo no existe. Tu equipo debe seguir encendido, con Docker
corriendo, mientras dure la presentación.

## Desplegar en Azure

1. Construir la imagen una vez: `docker build -t frontend .`
2. Desplegarla en Azure Container Apps con `API_GATEWAY_URL=https://<apim>.azure-api.net` (o,
   si se prefiere mismo origen, `API_GATEWAY_URL=""` y `API_PROXY_UPSTREAM=<url del gateway>`).
3. Configurar CORS en APIM según `../gateway/README.md` si el navegador llama directo a APIM.

La misma variable alimenta la CSP de `nginx.conf` (`connect-src`).

## Modo oscuro

- Botón en el encabezado (`components/layout/ThemeToggle.tsx`): recorre **Sistema → Claro →
  Oscuro**. "Sistema" (por defecto) sigue al sistema operativo y cambia en vivo.
- La preferencia se guarda en `localStorage` (`theme`) de este navegador, no en la cuenta, y se
  sincroniza entre pestañas. Lógica en `src/lib/theme.ts`.
- `public/theme.js` aplica la clase `dark` en `<html>` antes de pintar (sin destello claro). Es un
  archivo externo porque la CSP no permite scripts en línea.
- La paleta oscura redefine las variables de `styles/globals.css` bajo `:root.dark`, así que los
  componentes no llevan clases `dark:`. Por eso nunca se usan blancos o negros fijos para texto
  sobre tokens: `text-surface` sobre `bg-primary`, `text-danger-ink` para errores, etc.
- Tokens propios del tema: `chrome` (encabezado y pie, oscuros en ambos temas) y `canvas` (fondo
  claro de las vistas previas de las obras, también en oscuro).
- Los PDF exportados no dependen del tema.

## Información legal

Páginas públicas (se pueden leer sin sesión): `/legal/privacidad` (política de tratamiento de
datos, Ley 1581 de 2012), `/legal/terminos` (términos de uso) y `/legal/derechos-de-autor`
(autoría, licencia académica, material de terceros, imagen de personas y reporte de
infracciones). Se enlazan desde el pie de la barra lateral (y del menú en celular) dentro de la
app, y desde el colofón oscuro al pie del login, el registro y los propios documentos.

- **Responsable:** la Universidad de Investigación y Desarrollo – UDI (NIT 890212433-5, canal
  `datos@udi.edu.co`), con los datos de su política institucional (Acuerdo No. 03 de 2019). La
  plataforma se presenta como proyecto de grado: los datos se usan con fines académicos y no salen
  de la universidad.
- **Registro:** casilla obligatoria, nunca marcada por defecto, con el aviso de privacidad; envía
  `accept_legal` y `legal_version` (Auth Service guarda la prueba).
- **Subir versión:** casilla obligatoria de declaración de autoría y permisos; envía
  `rights_declaration` (Projects Service la registra con la fecha).
- Datos del responsable, versión y fecha en `src/features/legal/legalConfig.ts`. Si cambian las
  finalidades o el responsable, sube `LEGAL_VERSION` (y el mismo valor en `scripts/seed_demo.py`).

## Seguridad de archivos subidos

Las versiones las sube cualquier estudiante, así que el frontend nunca confía en la extensión:

- Qué se muestra lo decide el tipo real del archivo (`useVersionFileUrl`): imágenes y SVG solo en
  `<img>` (donde un SVG no ejecuta scripts) y el iframe solo para `application/pdf`.
- "Descargar original" y la exportación descargan como `application/octet-stream`.
- Projects Service además rechaza archivos cuyo contenido no corresponde al tipo declarado.
- La CSP del contenedor bloquea scripts externos, plugins y conexiones fuera del gateway.
