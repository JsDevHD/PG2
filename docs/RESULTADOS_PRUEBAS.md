# Resultados de las pruebas del backend

Resultado de ejecutar **pytest en los cuatro microservicios**, con el detalle de cada prueba: qué
verifica, si pasó y cuánto tardó. Los resultados y tiempos salen del reporte JUnit de pytest,
no se escribieron a mano.

> **Resultado: 176 de 176 pruebas pasaron.** 0 fallos, 0 omitidas y 0 advertencias.
> Ejecución: 18 de octubre de 2026, 17:32 (hora de Colombia).

## Contenido

1. [Resumen](#1-resumen)
2. [Cómo se ejecutaron](#2-cómo-se-ejecutaron)
3. [Cómo están construidas las pruebas](#3-cómo-están-construidas-las-pruebas)
4. [Qué cubren](#4-qué-cubren)
5. [Auth Service](#5-auth-service)
6. [Projects Service](#6-projects-service)
7. [Feedback Service](#7-feedback-service)
8. [Export Service](#8-export-service)
9. [Pruebas del frontend](#9-pruebas-del-frontend)

---

## 1. Resumen

| Servicio | Pruebas | Pasaron | Fallaron | Omitidas | Tiempo de pytest | Archivos |
|---|---|---|---|---|---|---|
| Auth Service | 20 | 20 | 0 | 0 | 7,54 s | 2 |
| Projects Service | 83 | 83 | 0 | 0 | 9,03 s | 6 |
| Feedback Service | 39 | 39 | 0 | 0 | 3,34 s | 3 |
| Export Service | 34 | 34 | 0 | 0 | 2,89 s | 4 |
| **Total** | **176** | **176** | **0** | **0** | **22,80 s** | **15** |

Las cuatro ejecuciones terminaron con código de salida 0 y **ninguna advertencia** (*warnings*).

**Las 5 pruebas más lentas:**

| Prueba | Servicio | Tiempo |
|---|---|---|
| `test_users_batch_returns_public_fields` | Auth Service | 0,81 s |
| `test_email_is_case_insensitive` | Auth Service | 0,79 s |
| `test_register_success` | Auth Service | 0,56 s |
| `test_login_success` | Auth Service | 0,55 s |
| `test_me_returns_404_when_user_no_longer_exists` | Auth Service | 0,54 s |

Las más lentas son de Auth porque **bcrypt es lento a propósito** (costo 12, unos 0,25 s por
contraseña), para encarecer los ataques de fuerza bruta. Esas pruebas registran usuarios e
inician sesión varias veces. Ninguna prueba pasa de un segundo.

---

## 2. Cómo se ejecutaron

| | |
|---|---|
| Sistema | Windows 10, Git Bash |
| Python | 3.13.0 (entorno virtual `.venv` de la raíz) |
| pytest | 9.1.1, con pytest-asyncio 1.4.0 (modo `auto`), anyio 4.15.1 y respx 0.23.1 |
| Librerías bajo prueba | FastAPI 0.119.1, Pydantic 2.13.5, Motor 3.7.1, PyMongo 4.18.2, httpx 0.28.1, ReportLab 5.0.1, pypdf 6.19.0 |
| Base de datos | MongoDB 7.0.43, el contenedor `mongo` del `docker-compose.yml`, en `localhost:27017` |
| Base usada | `graphic_tracker_test`, separada de la de desarrollo (`graphic_tracker`) |

Comandos (Git Bash, desde la raíz del repositorio):

```bash
docker compose up -d mongo          # solo MongoDB; las pruebas no usan los demás contenedores

for s in Auth_Service Projects_Service Feedback_Service Export_Service; do
  (cd "$s" && ../.venv/Scripts/python -m pytest -v --junitxml="../reporte-$s.xml")
done
```

- Los servicios se prueban **uno tras otro, no en paralelo**: los cuatro usan la misma base de
  pruebas y cada prueba la vacía.
- En macOS o Linux, el Python del entorno es `.venv/bin/python`.
- **No hay que cargar `infra/azure/secretos.sh` en esa terminal.** Si `MONGODB_URI` está definida,
  las pruebas la usarían, y apuntarían a la base de Azure en vez de a la local.

---

## 3. Cómo están construidas las pruebas

Son **pruebas de integración de la API**:
- Cada una llama a los endpoints reales de FastAPI con un cliente `httpx` en memoria
  (`ASGITransport`), sin levantar un servidor.
- Cada una lee y escribe en **MongoDB real**, así que los índices únicos y las reglas de
  concurrencia se prueban de verdad.
- La base `graphic_tracker_test` se **vacía antes y después de cada prueba**. Las colecciones se
  vacían pero no se borran, para conservar los índices.
- Un control impide limpiar una base cuyo nombre no termine en `_test`.

Lo que vive fuera del servicio se simula, para que las pruebas no dependan de la red:

| Servicio | Real en las pruebas | Simulado |
|---|---|---|
| Auth | API, MongoDB, bcrypt y JWT | — |
| Projects | API, MongoDB y validación de archivos por su firma | Blob Storage (subida y descarga) y la llamada a Auth para los nombres (con respx) |
| Feedback | API y MongoDB | Los cursos, proyectos, versiones y grupos se insertan directo en la base, porque son colecciones de Projects que Feedback solo lee |
| Export | API, MongoDB y generación real del PDF | Descarga de imágenes de Blob y nombres de Auth. El texto del PDF se verifica leyéndolo con `pypdf` |

Los tokens se firman en cada prueba con una clave de prueba (`test-secret-key`), con el rol que
cada caso necesita: docente titular, otro docente, estudiante matriculado o estudiante ajeno.

---

## 4. Qué cubren

| Tema | Ejemplos de lo que se verifica |
|---|---|
| **Autorización por rol y pertenencia (H-6)** | 401 sin token; 403 para otro docente, para un estudiante ajeno y para el rol equivocado; respuestas que no revelan si algo existe (un estudiante recibe 403 tanto si la versión es ajena como si no existe, y 404 en un proyecto oculto) |
| **Reglas de negocio** | Matrícula idempotente, un estudiante en un solo grupo, cupo máximo, plazo de grupos, bloqueo de subidas por calificación final (por estudiante o por grupo), nota parcial vigente y reemplazada, calificación final única |
| **Validaciones** | Formato, tamaño y firma real de los archivos; nota entre 0 y 5; configuración de grupos; declaración de autoría; aceptación de términos |
| **Concurrencia** (5 pruebas) | Peticiones simultáneas con `asyncio.gather`: el resultado queda consistente gracias a los índices únicos y a las operaciones atómicas de MongoDB |
| **Tolerancia a fallos** | Auth caído o con error 500 (el progreso responde igual), blob borrado (404 claro o «Archivo no disponible» en el PDF) |
| **Seguridad** | Contraseñas nunca expuestas, mismo mensaje para correo y contraseña incorrectos, nombres de archivo con `../`, SVG disfrazado de PDF, texto del usuario con `<script>` dentro del PDF, el correo nunca sale en `/users/batch` |
| **Datos personales y derechos de autor** | Prueba de la autorización de datos (Ley 1581), declaración de autoría al subir, aviso de autoría (Ley 23 de 1982) y metadatos del autor en el PDF |

**Pruebas de concurrencia:**

- `test_concurrent_joins_respect_one_group_per_student` (Projects Service)
- `test_group_cannot_exceed_max_size` (Projects Service)
- `test_concurrent_scores_leave_one_current_grade` (Feedback Service)
- `test_final_grade_concurrent_requests` (Feedback Service)
- `test_group_grading_concurrent_requests` (Feedback Service)

---

## 5. Auth Service

Identidad: registro, inicio de sesión, JWT y nombres públicos de los usuarios. **20/20 pasaron** en 7,54 s.

### `tests/test_auth.py` (19)

Registro, inicio de sesión, sesión actual (`/auth/me`) y nombres públicos (`/users/batch`).

| # | Prueba | Resultado | Tiempo | Qué verifica |
|---|---|---|---|---|
| 1 | `test_register_success` | ✅ Pasó | 0,56 s | Registro exitoso de un estudiante: responde 201 con id, nombre, correo, rol y fecha de creación, y nunca expone la contraseña ni su hash (RNF-06). |
| 2 | `test_register_stores_legal_consent` | ✅ Pasó | 0,33 s | Al registrarse se guarda la prueba de la autorización de datos (versión de los documentos legales y fecha de aceptación) en la base, pero la API no la devuelve (Ley 1581 de 2012). |
| 3 | `test_register_requires_legal_acceptance` — accept_legal en false | ✅ Pasó | 0,07 s | Sin aceptar los términos y la política de datos no se crea la cuenta: responde 422 y la colección de usuarios queda vacía. **Caso:** accept_legal en false. |
| 4 | `test_register_requires_legal_acceptance` — sin el campo accept_legal | ✅ Pasó | 0,06 s | Sin aceptar los términos y la política de datos no se crea la cuenta: responde 422 y la colección de usuarios queda vacía. **Caso:** sin el campo accept_legal. |
| 5 | `test_register_duplicate_email` | ✅ Pasó | 0,54 s | Un segundo registro con un correo ya usado responde 409 «El correo ya está registrado». |
| 6 | `test_register_invalid_role` | ✅ Pasó | 0,06 s | Solo existen los roles estudiante y docente: un rol inventado (admin) responde 422. |
| 7 | `test_register_rejects_password_over_72_bytes` | ✅ Pasó | 0,06 s | Una contraseña de 40 «ñ» cabe en el máximo de 72 caracteres pero ocupa 80 bytes en UTF-8, más de lo que admite bcrypt: se rechaza con 422 en vez de truncarla en silencio. |
| 8 | `test_email_is_case_insensitive` | ✅ Pasó | 0,79 s | El correo no distingue mayúsculas: registrar ANA@example.COM después de Ana@Example.com da 409, y el login funciona con cualquier combinación de mayúsculas. |
| 9 | `test_login_success` | ✅ Pasó | 0,55 s | Login correcto: devuelve un JWT de tipo bearer cuya expiración coincide con JWT_EXPIRE_MINUTES y cuyos claims sub y role son los del usuario (RF-01, RNF-01). |
| 10 | `test_login_wrong_password` | ✅ Pasó | 0,52 s | Contraseña incorrecta: 401 con el mensaje genérico de credenciales inválidas. |
| 11 | `test_login_nonexistent_email` | ✅ Pasó | 0,52 s | Correo que no existe: 401 con exactamente el mismo mensaje que una contraseña incorrecta, para no revelar qué correos están registrados. |
| 12 | `test_login_password_over_72_bytes_is_invalid_credentials` | ✅ Pasó | 0,29 s | En el login, una contraseña de más de 72 bytes no provoca un error 500 ni un 422: se trata como credenciales inválidas (401). |
| 13 | `test_me_requires_token` | ✅ Pasó | 0,05 s | GET /auth/me sin token responde 401. |
| 14 | `test_me_returns_current_user` | ✅ Pasó | 0,53 s | GET /auth/me con el token de un docente devuelve sus datos (id, nombre, correo y rol) sin el hash de la contraseña. El frontend lo usa al abrir la app para revalidar la sesión. |
| 15 | `test_me_returns_404_when_user_no_longer_exists` | ✅ Pasó | 0,54 s | Si el usuario fue borrado de la base, su token todavía vigente recibe 404 «Usuario no encontrado» en /auth/me, y el frontend cierra la sesión. |
| 16 | `test_users_batch_returns_public_fields` | ✅ Pasó | 0,81 s | /users/batch devuelve, en el orden pedido, solo id, nombre y rol de cada usuario, nunca el correo (RNF-06). Los otros servicios lo usan para mostrar nombres. |
| 17 | `test_users_batch_ignores_unknown_ids` | ✅ Pasó | 0,54 s | /users/batch ignora ids inexistentes o mal formados y devuelve solo los válidos, sin fallar. |
| 18 | `test_users_batch_requires_token` | ✅ Pasó | 0,05 s | /users/batch exige sesión: sin token responde 401. |
| 19 | `test_users_batch_rejects_more_than_100_ids` | ✅ Pasó | 0,54 s | /users/batch acepta como máximo 100 ids por petición: con 101 responde 422. |

### `tests/test_health.py` (1)

Salud del servicio.

| # | Prueba | Resultado | Tiempo | Qué verifica |
|---|---|---|---|---|
| 20 | `test_health_returns_ok_with_service_name` | ✅ Pasó | 0,02 s | GET /health responde 200 con status ok y el nombre del servicio. Docker y Azure lo usan para saber si el contenedor está vivo. |

---

## 6. Projects Service

Cursos, matrícula, proyectos (individuales y por grupos), grupos, versiones, archivos y progreso. **83/83 pasaron** en 9,03 s.

### `tests/test_courses.py` (11)

Cursos, matrícula por código y creación y listado de proyectos.

| # | Prueba | Resultado | Tiempo | Qué verifica |
|---|---|---|---|---|
| 21 | `test_create_course` | ✅ Pasó | 0,12 s | Un docente crea un curso: el nombre se recorta, el titular es él, el código de matrícula tiene 6 caracteres (mayúsculas y números) y el curso empieza sin estudiantes. |
| 22 | `test_create_course_requires_docente` | ✅ Pasó | 0,04 s | Un estudiante no puede crear cursos: 403, y no se guarda nada. |
| 23 | `test_create_course_retries_on_code_collision` | ✅ Pasó | 0,05 s | Si el código generado ya existe (se fuerza la colisión con AAAAAA), el servicio reintenta con otro código hasta encontrar uno libre. |
| 24 | `test_list_courses_by_role` | ✅ Pasó | 0,08 s | GET /courses devuelve a cada uno solo lo suyo: al docente sus cursos, al estudiante los cursos donde está matriculado, y a quien no tiene cursos una lista vacía. |
| 25 | `test_join_course_success` | ✅ Pasó | 0,05 s | Un estudiante se une con el código aunque lo escriba en minúsculas y con espacios, y queda en student_ids (CU-01). |
| 26 | `test_join_course_invalid_code` | ✅ Pasó | 0,07 s | Unirse con un código que no existe responde 404 «Código de curso no válido». |
| 27 | `test_join_course_idempotent` | ✅ Pasó | 0,07 s | Unirse dos veces al mismo curso no duplica al estudiante (la matrícula es idempotente). |
| 28 | `test_join_course_requires_estudiante` | ✅ Pasó | 0,04 s | Un docente no puede matricularse en un curso: 403. |
| 29 | `test_create_project_requires_titular` | ✅ Pasó | 0,06 s | Solo el docente titular crea proyectos en su curso. Otro docente y un estudiante matriculado reciben 403; el titular recibe 201 con course_id y created_by correctos. |
| 30 | `test_create_project_course_not_found` | ✅ Pasó | 0,04 s | Crear un proyecto en un curso inexistente, o con un id mal formado, responde 404 «Curso no encontrado» y no un error 500. |
| 31 | `test_list_projects_requires_membership` | ✅ Pasó | 0,07 s | Los proyectos de un curso los ven el titular y los matriculados. Un estudiante ajeno y otro docente reciben 403 (regla H-6 de pertenencia). |

### `tests/test_groups.py` (27)

Proyectos por grupos: configuración, formación con plazo, concurrencia, versiones compartidas y bloqueo por calificación.

| # | Prueba | Resultado | Tiempo | Qué verifica |
|---|---|---|---|---|
| 32 | `test_create_group_project_stores_settings` | ✅ Pasó | 0,07 s | Un proyecto por grupos guarda su configuración: modalidad group, mínimo 2, máximo 3, calificación individual y plazo futuro. La lista del curso la refleja. |
| 33 | `test_create_group_project_validates_settings` — falta el mínimo de integrantes | ✅ Pasó | 0,07 s | Validación de la configuración de grupos al crear el proyecto: responde 422 con un mensaje que explica el error. **Caso:** falta el mínimo de integrantes. |
| 34 | `test_create_group_project_validates_settings` — mínimo (4) mayor que el máximo (3) | ✅ Pasó | 0,08 s | Validación de la configuración de grupos al crear el proyecto: responde 422 con un mensaje que explica el error. **Caso:** mínimo (4) mayor que el máximo (3). |
| 35 | `test_create_group_project_validates_settings` — falta la fecha límite para formar grupos | ✅ Pasó | 0,09 s | Validación de la configuración de grupos al crear el proyecto: responde 422 con un mensaje que explica el error. **Caso:** falta la fecha límite para formar grupos. |
| 36 | `test_create_group_project_validates_settings` — fecha límite en el pasado | ✅ Pasó | 0,08 s | Validación de la configuración de grupos al crear el proyecto: responde 422 con un mensaje que explica el error. **Caso:** fecha límite en el pasado. |
| 37 | `test_create_group_project_validates_settings` — mínimo menor que 2 | ✅ Pasó | 0,07 s | Validación de la configuración de grupos al crear el proyecto: responde 422 con un mensaje que explica el error. **Caso:** mínimo menor que 2. |
| 38 | `test_create_group_project_validates_settings` — máximo mayor que 10 | ✅ Pasó | 0,07 s | Validación de la configuración de grupos al crear el proyecto: responde 422 con un mensaje que explica el error. **Caso:** máximo mayor que 10. |
| 39 | `test_individual_project_ignores_group_settings` | ✅ Pasó | 0,09 s | Un proyecto individual ignora los campos de grupo que lleguen en la petición: se guarda con calificación individual, sin tamaño y sin plazo. |
| 40 | `test_legacy_project_reads_as_individual` | ✅ Pasó | 0,10 s | Compatibilidad: un proyecto creado antes de existir los grupos, sin los campos nuevos, se lee como individual y sin plazo. |
| 41 | `test_student_creates_and_others_join` | ✅ Pasó | 0,11 s | Un estudiante crea un grupo con nombre propio y otro se une. Unirse dos veces no duplica al integrante, y el docente ve el grupo con sus dos miembros. |
| 42 | `test_default_group_names_are_numbered` | ✅ Pasó | 0,11 s | Si el grupo se crea sin nombre, se numera automáticamente: «Grupo 1», «Grupo 2». |
| 43 | `test_student_belongs_to_one_group_per_project` | ✅ Pasó | 0,17 s | Un estudiante pertenece a un solo grupo por proyecto. Crear un segundo grupo o unirse a otro responde 409 «Ya perteneces a un grupo de este proyecto», y los grupos no cambian. |
| 44 | `test_concurrent_joins_respect_one_group_per_student` | ✅ Pasó | 0,13 s | Concurrencia: el mismo estudiante intenta unirse a dos grupos a la vez. Exactamente una petición gana (200) y la otra recibe 409. Lo garantiza el índice único multikey de la base. |
| 45 | `test_group_cannot_exceed_max_size` | ✅ Pasó | 0,16 s | Concurrencia: dos estudiantes compiten a la vez por el último cupo de un grupo (máximo 3). Uno entra y el otro recibe 409 «El grupo está completo»; el grupo queda con 3. |
| 46 | `test_group_actions_require_enrolled_student` | ✅ Pasó | 0,11 s | Solo los estudiantes matriculados forman grupos. El docente no puede crear grupos (403), y un estudiante ajeno no puede crearlos ni verlos (403). |
| 47 | `test_individual_project_has_no_groups` | ✅ Pasó | 0,11 s | En un proyecto individual la lista de grupos está vacía, y crear un grupo responde 422 «Este proyecto es individual: no tiene grupos». |
| 48 | `test_groups_close_at_deadline` | ✅ Pasó | 0,11 s | Al vencer el plazo, crear un grupo, unirse y salir responden 403 «El plazo para formar grupos terminó». |
| 49 | `test_teacher_changes_deadline` | ✅ Pasó | 0,10 s | Solo el docente cambia el plazo de los grupos (un estudiante recibe 403). Si lo cierra, nadie puede crear grupos; si lo reabre con una fecha futura, se vuelve a poder. |
| 50 | `test_leave_group_and_empty_group_is_removed` | ✅ Pasó | 0,12 s | Salir de un grupo responde 204 y saca al integrante. Cuando sale el último, el grupo vacío se elimina. |
| 51 | `test_cannot_leave_group_with_versions` | ✅ Pasó | 0,18 s | Nadie puede salir de un grupo que ya subió versiones: 409 «El grupo ya subió versiones: no puedes salir de él». Así no quedan versiones huérfanas. |
| 52 | `test_cannot_join_graded_group` | ✅ Pasó | 0,14 s | Un grupo con calificación final no admite integrantes nuevos: 403 «El grupo ya tiene calificación final: no admite cambios». |
| 53 | `test_upload_requires_group` | ✅ Pasó | 0,08 s | En un proyecto por grupos, un estudiante sin grupo no puede subir versiones: 403, y el archivo ni siquiera llega a Blob Storage. |
| 54 | `test_group_shares_versions` | ✅ Pasó | 0,18 s | Las versiones son del grupo. Cada integrante ve todo el historial de su grupo y nada del otro (403 al pedir una versión ajena). El docente ve todo y puede filtrar por group_id. |
| 55 | `test_student_without_group_sees_no_versions` | ✅ Pasó | 0,14 s | Un estudiante que todavía no está en ningún grupo ve una lista de versiones vacía, no las de los demás grupos. |
| 56 | `test_individual_final_grade_blocks_only_that_member` | ✅ Pasó | 0,13 s | Calificación individual en un proyecto por grupos: calificar a un integrante bloquea sus subidas (403), pero su compañero sigue subiendo (201). |
| 57 | `test_group_final_grade_blocks_every_member` | ✅ Pasó | 0,13 s | Calificación grupal: Feedback guarda una nota final por integrante, y con ella todos los miembros del grupo quedan bloqueados para subir (403). |
| 58 | `test_progress_counts_group_versions_for_each_member` | ✅ Pasó | 0,17 s | En el progreso, una versión de grupo cuenta para cada integrante (B ve 2 versiones y 50 %), pero los totales del curso cuentan versiones distintas, no una por integrante. |

### `tests/test_health.py` (1)

Salud del servicio.

| # | Prueba | Resultado | Tiempo | Qué verifica |
|---|---|---|---|---|
| 59 | `test_health_returns_ok_with_service_name` | ✅ Pasó | 0,05 s | GET /health responde 200 con status ok y el nombre del servicio. |

### `tests/test_progress.py` (7)

Progreso por estudiante y por curso (RF-08), incluida la degradación cuando Auth Service falla.

| # | Prueba | Resultado | Tiempo | Qué verifica |
|---|---|---|---|---|
| 60 | `test_progress_student_view` | ✅ Pasó | 0,19 s | Progreso del estudiante en un curso: versiones subidas, cuántas tienen retroalimentación y el porcentaje (2, 1 y 50 %). Las versiones de otro curso no cuentan (RF-08). |
| 61 | `test_progress_student_without_versions` | ✅ Pasó | 0,13 s | Un estudiante sin versiones tiene progreso 0 % sin errores de división por cero. |
| 62 | `test_progress_teacher_view` | ✅ Pasó | 0,46 s | Vista del docente: totales del curso (3 versiones, 2 revisadas, 66,67 %) y el detalle por estudiante, con nombres traídos de Auth (/users/batch). Reenvía el JWT del docente. Un estudiante que Auth no devuelve queda sin nombre. |
| 63 | `test_progress_teacher_view_degrades_when_auth_service_fails` — Auth Service caído (error de conexión) | ✅ Pasó | 0,41 s | Tolerancia a fallos: si Auth Service no responde, el progreso igual se entrega (200) con los porcentajes correctos y los nombres vacíos, en vez de fallar toda la pantalla. **Caso:** Auth Service caído (error de conexión). |
| 64 | `test_progress_teacher_view_degrades_when_auth_service_fails` — Auth Service responde 500 | ✅ Pasó | 0,42 s | Tolerancia a fallos: si Auth Service no responde, el progreso igual se entrega (200) con los porcentajes correctos y los nombres vacíos, en vez de fallar toda la pantalla. **Caso:** Auth Service responde 500. |
| 65 | `test_progress_requires_membership` | ✅ Pasó | 0,14 s | El progreso de un curso solo lo ven su titular y sus estudiantes: otro docente o un estudiante ajeno reciben 403. |
| 66 | `test_progress_course_not_found` | ✅ Pasó | 0,07 s | El progreso de un curso inexistente responde 404. |

### `tests/test_project_management.py` (10)

Gestión de proyectos: editar, bloqueo de la estructura, ocultar y eliminar.

| # | Prueba | Resultado | Tiempo | Qué verifica |
|---|---|---|---|---|
| 67 | `test_edit_title_and_description` | ✅ Pasó | 0,10 s | El docente edita el título (se recorta) y la descripción de un proyecto con PATCH. Se registra updated_at, y los campos no enviados no cambian. |
| 68 | `test_only_titular_teacher_edits` | ✅ Pasó | 0,08 s | Solo el docente titular edita: un estudiante y otro docente reciben 403, y un proyecto inexistente 404. |
| 69 | `test_edit_validates_fields` | ✅ Pasó | 0,11 s | La edición valida igual que la creación: título vacío (422), mínimo mayor que el máximo y plazo en el pasado, con mensajes claros en español. |
| 70 | `test_switch_to_group_mode_while_empty` | ✅ Pasó | 0,09 s | Un proyecto sin actividad se puede pasar a modalidad por grupos con su configuración, y de vuelta a individual, que descarta la configuración de grupos. |
| 71 | `test_structure_locked_after_versions` | ✅ Pasó | 0,12 s | Con versiones subidas, la estructura (modalidad, tamaños y calificación) queda bloqueada: 409 «ya no se pueden cambiar». Reenviar los mismos valores con el formulario completo no cuenta como cambio, y el título sí se puede editar. |
| 72 | `test_structure_locked_after_groups_but_deadline_editable` | ✅ Pasó | 0,08 s | Con grupos formados, cambiar el tamaño máximo da 409, pero el plazo de los grupos sigue siendo editable, incluso para cerrarlo. |
| 73 | `test_hidden_project_disappears_for_students` | ✅ Pasó | 0,15 s | Un proyecto oculto deja de existir para los estudiantes: no aparece en la lista, sus versiones, el detalle y la subida responden 404, y no cuenta en el progreso. El docente lo sigue viendo marcado como oculto. Al mostrarlo de nuevo, todo vuelve intacto. |
| 74 | `test_create_project_hidden_as_draft` | ✅ Pasó | 0,09 s | Un proyecto se puede crear oculto, como borrador: los estudiantes no lo ven hasta que el docente lo muestre. |
| 75 | `test_delete_empty_project_and_its_groups` | ✅ Pasó | 0,09 s | Eliminar un proyecto sin versiones: solo el titular puede (el estudiante recibe 403), responde 204, borra en cascada sus grupos, y borrarlo otra vez da 404. |
| 76 | `test_cannot_delete_project_with_versions` | ✅ Pasó | 0,10 s | Un proyecto con versiones no se puede eliminar: 409 «El proyecto tiene versiones: ocúltalo en lugar de eliminarlo». Se conservan el proyecto y la versión (inmutabilidad, RNF-08). |

### `tests/test_versions.py` (27)

Subida de versiones, validación de archivos, visibilidad por rol, descarga del archivo y almacenamiento en Blob.

| # | Prueba | Resultado | Tiempo | Qué verifica |
|---|---|---|---|---|
| 77 | `test_upload_version_success` | ✅ Pasó | 0,08 s | Un estudiante matriculado sube una versión (RF-03, CU-02): 201 con proyecto, estudiante, descripción y la URL del blob bajo versions/<proyecto>/<estudiante>/. El archivo se sube una sola vez y queda guardado en la base. |
| 78 | `test_upload_version_not_enrolled` | ✅ Pasó | 0,07 s | Un estudiante que no está matriculado en el curso no puede subir: 403. No se sube nada a Blob ni se guarda nada en la base. |
| 79 | `test_upload_version_requires_estudiante` | ✅ Pasó | 0,08 s | Un docente no puede subir versiones: 403, y no se toca Blob Storage. |
| 80 | `test_upload_version_project_not_found` | ✅ Pasó | 0,04 s | Subir a un proyecto que no existe responde 404 «Proyecto no encontrado». |
| 81 | `test_upload_version_invalid_format` | ✅ Pasó | 0,07 s | Un formato no permitido (GIF) responde 422 «Formato de archivo no permitido». No se sube ni se guarda nada (RNF-05). |
| 82 | `test_upload_version_accepts_allowed_formats` — JPEG con firma real | ✅ Pasó | 0,07 s | Los formatos permitidos se aceptan (201) cuando el contenido coincide con el tipo declarado. **Caso:** JPEG con firma real. |
| 83 | `test_upload_version_accepts_allowed_formats` — PDF con firma %PDF | ✅ Pasó | 0,07 s | Los formatos permitidos se aceptan (201) cuando el contenido coincide con el tipo declarado. **Caso:** PDF con firma %PDF. |
| 84 | `test_upload_version_accepts_allowed_formats` — SVG válido | ✅ Pasó | 0,07 s | Los formatos permitidos se aceptan (201) cuando el contenido coincide con el tipo declarado. **Caso:** SVG válido. |
| 85 | `test_upload_version_content_does_not_match_type` — un SVG con script disfrazado de PDF | ✅ Pasó | 0,07 s | Seguridad: el servicio verifica la firma real del archivo, no solo la extensión o el tipo declarado. Si no coinciden, responde 422 «El contenido del archivo no corresponde a su formato» y no se sube nada. **Caso:** un SVG con script disfrazado de PDF. |
| 86 | `test_upload_version_content_does_not_match_type` — un SVG disfrazado de PNG | ✅ Pasó | 0,09 s | Seguridad: el servicio verifica la firma real del archivo, no solo la extensión o el tipo declarado. Si no coinciden, responde 422 «El contenido del archivo no corresponde a su formato» y no se sube nada. **Caso:** un SVG disfrazado de PNG. |
| 87 | `test_upload_version_content_does_not_match_type` — texto plano disfrazado de JPEG | ✅ Pasó | 0,09 s | Seguridad: el servicio verifica la firma real del archivo, no solo la extensión o el tipo declarado. Si no coinciden, responde 422 «El contenido del archivo no corresponde a su formato» y no se sube nada. **Caso:** texto plano disfrazado de JPEG. |
| 88 | `test_upload_version_too_large` | ✅ Pasó | 0,08 s | Un archivo que supera el tamaño máximo (aquí reducido a 1 MB para la prueba; en producción 20 MB) responde 422 con el límite en el mensaje, sin subirlo. |
| 89 | `test_upload_version_empty_file` | ✅ Pasó | 0,07 s | Un archivo vacío responde 422 «El archivo está vacío». |
| 90 | `test_upload_version_project_finalized` | ✅ Pasó | 0,11 s | El bloqueo por calificación final es por estudiante: con nota final, A recibe 403 «Ya tienes calificación final…», pero B sigue subiendo hasta que lo califiquen a él (CU-02, E3). |
| 91 | `test_upload_version_allowed_with_partial_feedback` | ✅ Pasó | 0,10 s | Una retroalimentación parcial (no final) no bloquea: el estudiante puede seguir subiendo versiones. |
| 92 | `test_versions_scoped_by_role` | ✅ Pasó | 0,14 s | Cada rol ve lo que le corresponde (RF-04). El estudiante ve solo sus versiones, aunque intente pedir las de otro con ?student_id (se ignora), y recibe 403 en una versión ajena. El docente ve todo en orden cronológico o filtra por estudiante. |
| 93 | `test_versions_require_membership` | ✅ Pasó | 0,09 s | Las versiones solo las ven el titular y los matriculados: otro docente o un estudiante ajeno reciben 403, en la lista y en el detalle. |
| 94 | `test_get_version_not_found` | ✅ Pasó | 0,08 s | Una versión inexistente da 404 al docente, pero 403 al estudiante, para que no pueda distinguir «no existe» de «no es tuya». |
| 95 | `test_upload_file_stores_blob_under_version_path` | ✅ Pasó | 0,00 s | Prueba unitaria del almacenamiento: el blob se guarda en versions/<proyecto>/<estudiante>/<uuid>_<nombre>. Se neutraliza un nombre con ../ (path traversal), nunca se sobrescribe (overwrite=False) y el contenedor se crea si no existe. |
| 96 | `test_get_version_file_owner_and_teacher` | ✅ Pasó | 0,08 s | El dueño y el docente descargan el archivo de la versión por la API (Blob es privado), con el tipo correcto, nosniff y caché privada. |
| 97 | `test_get_version_file_forbidden_for_other_student` | ✅ Pasó | 0,10 s | Otro estudiante no puede descargar el archivo de una versión ajena: 403, sin tocar Blob Storage. |
| 98 | `test_get_version_file_version_not_found` | ✅ Pasó | 0,07 s | Pedir el archivo de una versión inexistente responde 404 «Versión no encontrada». |
| 99 | `test_get_version_file_blob_missing` | ✅ Pasó | 0,07 s | Si el blob ya no existe en Storage, la API responde 404 «Archivo no encontrado» y no un error 500. |
| 100 | `test_download_file_resolves_blob_name_from_url` | ✅ Pasó | 0,00 s | Prueba unitaria: a partir de la URL guardada (con %20) se obtiene el nombre real del blob dentro del contenedor, y se devuelven el contenido y su tipo. |
| 101 | `test_upload_version_requires_rights_declaration` — sin el campo rights_declaration | ✅ Pasó | 0,08 s | Sin la declaración de autoría y permisos no se acepta la versión: 422 «Debes declarar…», sin subir ni guardar nada. **Caso:** sin el campo rights_declaration. |
| 102 | `test_upload_version_requires_rights_declaration` — rights_declaration en false | ✅ Pasó | 0,08 s | Sin la declaración de autoría y permisos no se acepta la versión: 422 «Debes declarar…», sin subir ni guardar nada. **Caso:** rights_declaration en false. |
| 103 | `test_upload_version_records_rights_declaration` | ✅ Pasó | 0,07 s | Al subir una versión queda registrada la fecha de la declaración de autoría (rights_declared_at), igual a la fecha de subida. |

---

## 7. Feedback Service

Retroalimentación, notas parciales y calificación final, individual o por grupo. **39/39 pasaron** en 3,34 s.

### `tests/test_feedback.py` (32)

Retroalimentación, nota parcial vigente y reemplazada, calificación final y visibilidad por rol.

| # | Prueba | Resultado | Tiempo | Qué verifica |
|---|---|---|---|---|
| 104 | `test_create_feedback_success` | ✅ Pasó | 0,12 s | El docente titular deja retroalimentación con nota parcial sobre una versión (RF-05, CU-03): 201 con versión, proyecto, estudiante, docente, comentario y nota 4,5, que queda vigente y no es final. |
| 105 | `test_create_feedback_not_titular` | ✅ Pasó | 0,05 s | Un docente que no es el titular del curso no puede retroalimentar: 403, y no se guarda nada. |
| 106 | `test_create_feedback_requires_teacher_role` | ✅ Pasó | 0,07 s | Un estudiante no puede crear retroalimentación: 403. |
| 107 | `test_create_feedback_version_not_found` — id válido que no existe | ✅ Pasó | 0,05 s | Retroalimentar una versión inexistente responde 404 «Versión no encontrada», no un error 500. **Caso:** id válido que no existe. |
| 108 | `test_create_feedback_version_not_found` — id mal formado | ✅ Pasó | 0,07 s | Retroalimentar una versión inexistente responde 404 «Versión no encontrada», no un error 500. **Caso:** id mal formado. |
| 109 | `test_score_out_of_range` — nota −0,1 | ✅ Pasó | 0,07 s | La nota debe estar entre 0 y 5: fuera de ese rango responde 422 y no se guarda nada. **Caso:** nota −0,1. |
| 110 | `test_score_out_of_range` — nota 5,1 | ✅ Pasó | 0,08 s | La nota debe estar entre 0 y 5: fuera de ese rango responde 422 y no se guarda nada. **Caso:** nota 5,1. |
| 111 | `test_score_limits_are_accepted` — nota 0,0 | ✅ Pasó | 0,06 s | Los extremos del rango son válidos: se acepta la nota exacta. **Caso:** nota 0,0. |
| 112 | `test_score_limits_are_accepted` — nota 5,0 | ✅ Pasó | 0,09 s | Los extremos del rango son válidos: se acepta la nota exacta. **Caso:** nota 5,0. |
| 113 | `test_comment_without_score` | ✅ Pasó | 0,06 s | Se puede comentar sin poner nota: 201 con score vacío. |
| 114 | `test_new_score_replaces_current_partial_grade` | ✅ Pasó | 0,11 s | Varias retroalimentaciones en la misma versión conservan todos los comentarios, pero solo la última nota queda vigente: la anterior queda marcada como reemplazada (score_replaced) en vez de borrarse (RNF-08). |
| 115 | `test_comment_without_score_keeps_current_grade` | ✅ Pasó | 0,13 s | Un comentario sin nota no reemplaza la nota vigente. |
| 116 | `test_partial_grade_is_per_version` | ✅ Pasó | 0,09 s | La nota parcial vigente es por versión: calificar la versión de B no reemplaza la de A. |
| 117 | `test_concurrent_scores_leave_one_current_grade` | ✅ Pasó | 0,13 s | Concurrencia: tres notas enviadas a la vez sobre la misma versión dejan exactamente una nota vigente. Las demás responden 201 como reemplazadas o 409. Lo garantiza el índice único parcial unique_current_partial_grade. |
| 118 | `test_migration_keeps_latest_legacy_partial_grade` | ✅ Pasó | 0,12 s | Migración de datos viejos: si la base tiene dos notas vigentes en la misma versión (formato anterior, sin score_replaced), al crear los índices se conserva la más reciente y la otra queda marcada como reemplazada, sin que falle el arranque. |
| 119 | `test_feedback_requires_authentication` | ✅ Pasó | 0,07 s | Leer retroalimentación exige sesión: sin token responde 401. |
| 120 | `test_feedback_scoped_by_role` | ✅ Pasó | 0,10 s | Cada rol ve lo suyo (RF-06). El estudiante no ve la retroalimentación de otro (403) y ve la suya en orden cronológico; en el historial del proyecto solo recibe la de sus versiones. El docente titular ve la de todos. |
| 121 | `test_version_feedback_not_titular` | ✅ Pasó | 0,05 s | Otro docente no puede leer la retroalimentación de una versión de un curso ajeno: 403. |
| 122 | `test_project_feedback_requires_membership` — otro docente: 403 | ✅ Pasó | 0,08 s | El historial de retroalimentación de un proyecto solo lo ven el titular y los matriculados. **Caso:** otro docente: 403. |
| 123 | `test_project_feedback_requires_membership` — estudiante ajeno: 403 | ✅ Pasó | 0,08 s | El historial de retroalimentación de un proyecto solo lo ven el titular y los matriculados. **Caso:** estudiante ajeno: 403. |
| 124 | `test_project_feedback_project_not_found` | ✅ Pasó | 0,05 s | El historial de un proyecto inexistente responde 404 «Proyecto no encontrado». |
| 125 | `test_final_grade_success` | ✅ Pasó | 0,06 s | El docente asigna la calificación final de un estudiante en un proyecto individual (RF-09): 201 con un solo registro final de 4,6, ligado a la versión y al estudiante, sin grupo. |
| 126 | `test_final_grade_requires_titular_teacher` — otro docente: 403 | ✅ Pasó | 0,07 s | Solo el docente titular asigna la calificación final. **Caso:** otro docente: 403. |
| 127 | `test_final_grade_requires_titular_teacher` — un estudiante: 403 | ✅ Pasó | 0,05 s | Solo el docente titular asigna la calificación final. **Caso:** un estudiante: 403. |
| 128 | `test_final_grade_version_not_found` | ✅ Pasó | 0,07 s | La calificación final sobre una versión inexistente responde 404. |
| 129 | `test_final_grade_version_mismatch` | ✅ Pasó | 0,08 s | La versión indicada debe pertenecer al proyecto que se califica: si es de otro proyecto responde 422 «La versión no pertenece a este proyecto», y no se guarda nada. |
| 130 | `test_final_grade_already_exists` | ✅ Pasó | 0,10 s | La calificación final es única por estudiante y proyecto: la segunda responde 409 «El estudiante ya tiene una calificación final en este proyecto» (RF-09, inmutable). |
| 131 | `test_final_grade_concurrent_requests` | ✅ Pasó | 0,09 s | Concurrencia: dos calificaciones finales simultáneas para el mismo estudiante. Una gana (201), la otra recibe 409 y queda un solo registro final. Lo garantiza el índice único parcial unique_final_grade_per_student. |
| 132 | `test_final_grade_is_per_student` | ✅ Pasó | 0,08 s | La calificación final es por estudiante: calificar a A no impide calificar a B en el mismo proyecto (las dos responden 201). |
| 133 | `test_feedback_allowed_after_final_grade` | ✅ Pasó | 0,07 s | Después de la nota final el docente aún puede dejar comentarios: se guardan como retroalimentación no final. |
| 134 | `test_get_final_grade_scoped_by_role` | ✅ Pasó | 0,10 s | GET final-grade según el rol. El estudiante ve solo su nota final, y nada antes de tenerla (una parcial no cuenta). Otro estudiante no ve la de A. El docente ve las de todos. |
| 135 | `test_get_final_grade_requires_membership` | ✅ Pasó | 0,05 s | Las calificaciones finales de un proyecto no las puede consultar alguien ajeno al curso: 403. |

### `tests/test_group_feedback.py` (6)

Retroalimentación y calificación en proyectos por grupos (individual o grupal) y proyectos ocultos.

| # | Prueba | Resultado | Tiempo | Qué verifica |
|---|---|---|---|---|
| 136 | `test_group_members_see_feedback_on_group_versions` | ✅ Pasó | 0,09 s | La retroalimentación sobre una versión de grupo queda ligada al grupo (group_id). Todos los integrantes la ven, aunque no hayan subido esa versión; un estudiante de otro grupo no (403 en la versión, lista vacía en el proyecto). |
| 137 | `test_individual_grading_requires_a_group_member` | ✅ Pasó | 0,07 s | Con calificación individual en un proyecto por grupos, hay que indicar a qué integrante se califica (422 si falta), y debe pertenecer al grupo de esa versión (422 si es de otro grupo). |
| 138 | `test_individual_grading_grades_each_member_separately` | ✅ Pasó | 0,11 s | Calificación individual: cada integrante se califica por separado sobre la versión del grupo, aunque no la haya subido. Calificar dos veces al mismo da 409. Cada uno ve solo su propia nota final, nunca la del compañero. |
| 139 | `test_group_grading_grades_every_member_at_once` | ✅ Pasó | 0,10 s | Calificación grupal: una sola petición crea la nota final de todos los integrantes, con la misma nota y el mismo grupo. Es excluyente con la individual: indicar un estudiante da 422. Repetirla da 409. |
| 140 | `test_group_grading_concurrent_requests` | ✅ Pasó | 0,11 s | Concurrencia: dos calificaciones grupales simultáneas. Una gana (201), la otra recibe 409, y quedan exactamente 2 registros finales, uno por integrante (inserción ordenada y atómica). |
| 141 | `test_hidden_project_feedback_is_invisible_to_students` | ✅ Pasó | 0,08 s | Si el proyecto está oculto, para el estudiante no existe: la retroalimentación de su versión, la del proyecto y su nota final responden 404. El docente la sigue viendo. |

### `tests/test_health.py` (1)

Salud del servicio.

| # | Prueba | Resultado | Tiempo | Qué verifica |
|---|---|---|---|---|
| 142 | `test_health_returns_ok_with_service_name` | ✅ Pasó | 0,05 s | GET /health responde 200 con status ok y el nombre del servicio. |

---

## 8. Export Service

Generación de los PDF: portafolio de un proyecto y portafolio académico del estudiante. **34/34 pasaron** en 2,89 s.

### `tests/test_export.py` (12)

PDF del portafolio de un proyecto (RF-07): permisos y contenido.

| # | Prueba | Resultado | Tiempo | Qué verifica |
|---|---|---|---|---|
| 143 | `test_export_student_own_project` | ✅ Pasó | 0,18 s | El estudiante exporta el portafolio de su proyecto (RF-07, CU-04). Recibe un PDF descargable con un nombre de archivo sin tildes, una portada y una página por versión, con la retroalimentación y el nombre del docente. Solo se descargan las imágenes de Blob; un PDF subido se lista por su nombre. |
| 144 | `test_export_student_cannot_specify_other` | ✅ Pasó | 0,08 s | Un estudiante no puede exportar el portafolio de otro pasando ?student_id: se ignora y recibe el suyo. El PDF no trae nada de B, y no se piden a Auth ni a Blob datos de B. |
| 145 | `test_export_teacher_exports_enrolled_student` | ✅ Pasó | 0,08 s | El docente titular exporta el portafolio de un estudiante matriculado: el PDF trae solo las versiones de ese estudiante. |
| 146 | `test_export_teacher_requires_student_id` | ✅ Pasó | 0,07 s | El docente debe indicar a qué estudiante exporta: sin student_id responde 422. |
| 147 | `test_export_teacher_student_not_enrolled` | ✅ Pasó | 0,06 s | El docente no puede exportar a alguien que no está matriculado en su curso: 403. |
| 148 | `test_export_teacher_not_titular` | ✅ Pasó | 0,07 s | Un docente que no es el titular del curso no puede exportar: 403. |
| 149 | `test_export_student_not_enrolled` | ✅ Pasó | 0,06 s | Un estudiante que no está matriculado no puede exportar ese proyecto: 403. |
| 150 | `test_export_project_not_found` — id válido que no existe | ✅ Pasó | 0,05 s | Exportar un proyecto inexistente responde 404 «Proyecto no encontrado». **Caso:** id válido que no existe. |
| 151 | `test_export_project_not_found` — id mal formado | ✅ Pasó | 0,06 s | Exportar un proyecto inexistente responde 404 «Proyecto no encontrado». **Caso:** id mal formado. |
| 152 | `test_export_requires_token` | ✅ Pasó | 0,07 s | Exportar exige sesión: sin token responde 401. |
| 153 | `test_export_empty_project` | ✅ Pasó | 0,09 s | Un proyecto sin versiones igual genera un PDF de una página con el mensaje de que no hay evidencias (CU-04, A1), en vez de fallar. |
| 154 | `test_export_missing_blob_does_not_abort` | ✅ Pasó | 0,09 s | Si una imagen ya no está en Blob Storage, el PDF se genera igual y esa versión muestra «Archivo no disponible», sin abortar la exportación. |

### `tests/test_health.py` (2)

Salud del servicio y CORS.

| # | Prueba | Resultado | Tiempo | Qué verifica |
|---|---|---|---|---|
| 155 | `test_health_returns_ok_with_service_name` | ✅ Pasó | 0,01 s | GET /health responde 200 con status ok y el nombre del servicio. |
| 156 | `test_cors_exposes_content_disposition` | ✅ Pasó | 0,01 s | En local, el CORS expone la cabecera Content-Disposition, para que el frontend lea el nombre del PDF descargado desde otro origen. |

### `tests/test_pdf_builder.py` (8)

Generador de PDF probado directamente, sin API ni base (pruebas unitarias).

| # | Prueba | Resultado | Tiempo | Qué verifica |
|---|---|---|---|---|
| 157 | `test_pdf_builder_structure` — 1 versión | ✅ Pasó | 0,02 s | Prueba unitaria del generador de PDF: portada con proyecto, estudiante y curso, una página por versión con su comentario y nota, y en cada página el número de página y el nombre de la plataforma. **Caso:** 1 versión. |
| 158 | `test_pdf_builder_structure` — 3 versiones | ✅ Pasó | 0,03 s | Prueba unitaria del generador de PDF: portada con proyecto, estudiante y curso, una página por versión con su comentario y nota, y en cada página el número de página y el nombre de la plataforma. **Caso:** 3 versiones. |
| 159 | `test_pdf_builder_empty_project_shows_no_evidence_message` | ✅ Pasó | 0,01 s | Prueba unitaria: sin versiones, el generador produce una sola página con el mensaje de que no hay evidencias. |
| 160 | `test_pdf_builder_final_grade_section` | ✅ Pasó | 0,03 s | Prueba unitaria: con calificación final, el PDF agrega al final una página destacada con la nota, el comentario y la versión evaluada, y esa nota no se repite como parcial dentro de la versión. |
| 161 | `test_pdf_builder_does_not_abort_on_unusable_files` | ✅ Pasó | 0,19 s | Prueba unitaria de robustez: una imagen que falta, una truncada o un archivo que no es imagen no abortan el PDF; esas versiones muestran «Archivo no disponible». Un documento PDF subido se menciona por su nombre. |
| 162 | `test_pdf_builder_escapes_user_markup` | ✅ Pasó | 0,02 s | Seguridad y robustez: un texto del usuario con <, & o etiquetas (por ejemplo <script>) se escribe tal cual en el PDF, sin romper la generación ni interpretarse como formato. |
| 163 | `test_pdf_builder_partial_grade_states` | ✅ Pasó | 0,02 s | Prueba unitaria: en una versión con varios comentarios, el PDF distingue la nota parcial reemplazada, la vigente y el comentario sin nota. |
| 164 | `test_pdf_builder_rights_notice_and_author_metadata` | ✅ Pasó | 0,02 s | Derechos de autor: la portada dice que las obras son del estudiante y cita la Ley 23 de 1982, y los metadatos del PDF ponen al estudiante como autor. |

### `tests/test_portfolio.py` (12)

PDF de proyectos por grupos y portafolio académico del estudiante (Mi portafolio).

| # | Prueba | Resultado | Tiempo | Qué verifica |
|---|---|---|---|---|
| 165 | `test_group_project_export_includes_group_versions` | ✅ Pasó | 0,13 s | PDF de un proyecto por grupos: muestra el grupo y sus integrantes, incluye las versiones de todo el grupo con quién subió cada una y su retroalimentación, y excluye las versiones de otro grupo y la nota final del compañero. |
| 166 | `test_group_project_export_shows_own_final_grade` | ✅ Pasó | 0,10 s | Cuando el docente exporta a B en un proyecto por grupos, el PDF trae la calificación final de B en su página final. |
| 167 | `test_portfolio_groups_projects_by_course` | ✅ Pasó | 0,12 s | Portafolio académico del estudiante (panel Mi portafolio): un solo PDF con varios proyectos, agrupados por curso en orden alfabético, con versiones, comentarios y notas. Un proyecto sin entregas aparece con el mensaje de sin evidencias, y nunca aparece trabajo de otro estudiante. |
| 168 | `test_portfolio_without_feedback_grades_or_images` | ✅ Pasó | 0,10 s | Opciones del portafolio: sin comentarios, sin notas y sin imágenes, el PDF no trae nada de eso, muestra que la imagen se omitió y no descarga ningún archivo de Blob. |
| 169 | `test_portfolio_grades_without_comments` | ✅ Pasó | 0,11 s | Opción «notas sí, comentarios no»: el PDF trae las calificaciones parcial y final sin los textos de la retroalimentación. |
| 170 | `test_portfolio_rejects_projects_from_other_courses` | ✅ Pasó | 0,06 s | El estudiante solo puede incluir proyectos de sus cursos: si pide uno de un curso ajeno, toda la exportación responde 403 «Solo puedes exportar proyectos de tus cursos». |
| 171 | `test_portfolio_validates_projects` — lista vacía: 422 | ✅ Pasó | 0,08 s | Validación de la lista de proyectos del portafolio académico. **Caso:** lista vacía: 422. |
| 172 | `test_portfolio_validates_projects` — id mal formado: 404 | ✅ Pasó | 0,10 s | Validación de la lista de proyectos del portafolio académico. **Caso:** id mal formado: 404. |
| 173 | `test_portfolio_validates_projects` — proyecto inexistente: 404 | ✅ Pasó | 0,11 s | Validación de la lista de proyectos del portafolio académico. **Caso:** proyecto inexistente: 404. |
| 174 | `test_portfolio_is_for_students_only` | ✅ Pasó | 0,09 s | El portafolio académico es exclusivo de los estudiantes: un docente recibe 403. |
| 175 | `test_portfolio_includes_group_projects` | ✅ Pasó | 0,11 s | El portafolio académico incluye los proyectos por grupos, con el nombre del grupo, y sin la nota final de los compañeros. |
| 176 | `test_hidden_projects_cannot_be_exported_by_students` | ✅ Pasó | 0,12 s | Un proyecto oculto no se puede exportar como estudiante, ni en el portafolio académico ni individualmente (404). El docente sí puede. |

---

## 9. Pruebas del frontend

Este documento detalla el backend (pytest). El frontend tiene su propia suite, con Vitest, Testing
Library y MSW, que simula la API.

Se corrió el mismo día, a las 17:37, con `pnpm test` desde `frontend/`:

| Archivos | Pruebas | Pasaron | Duración |
|---|---|---|---|
| 9 | 76 | **76** | 70 s |

**28 de octubre de 2026, rediseño de la calificación final.** Con el cambio, 7 pruebas fallaron al
principio:

- 3 buscaban la etiqueta «Calificación (opcional)», que el cambio había renombrado sin que se
  pidiera. Se dejó la etiqueta original.
- 4 seguían el flujo anterior: un único botón «Asignar calificación final» y el formulario dentro
  del diálogo. Al botón del bloque se le dio otro nombre («Revisar y confirmar»), y con eso pasó
  una de ellas.

Las 3 restantes se actualizaron al flujo nuevo, con autorización del autor y sin cambiar lo que
comprueban:

| Archivo | Prueba | Qué cambió |
|---|---|---|
| `tests/groups.test.tsx` | Calificación grupal: se califica al grupo entero | Llena el bloque en la página y confirma en el diálogo con «Confirmar calificación final». Sigue comprobando que no se envía `student_id` |
| `tests/groups.test.tsx` | Calificación individual: se envía el integrante elegido | El mismo recorrido. Sigue comprobando que se envía el `student_id` del integrante |
| `tests/projects.test.tsx` | El 409 se muestra dentro del diálogo | El mismo recorrido. El mensaje esperado es «Este estudiante ya tiene una calificación final registrada.», el que pide el rediseño |

Resultado final con `pnpm test`: **9 archivos, 76 de 76 pruebas pasaron.**

Qué cubre está en la sección 15 de [`DOCUMENTACION_TECNICA.md`](DOCUMENTACION_TECNICA.md). Con el
backend, el proyecto suma **252 pruebas automáticas, todas en verde**.
