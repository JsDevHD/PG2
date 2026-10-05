# auth-service

Microservicio de autenticación del **Sistema de Seguimiento de Proyectos Gráficos**
(RF-01 login y roles, RF-10 autoregistro). Construido a partir de `service-template/`; lo
transversal (config, verificación de JWT, Mongo, errores, Docker) está documentado allí.

Es el **único** servicio que:

- escribe en la colección `users`;
- conoce contraseñas en texto plano (solo durante la petición; se guardan con bcrypt);
- **emite** JWT. Los demás servicios solo los verifican localmente con la misma `JWT_SECRET_KEY`.

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/v1/auth/register` | No | Crea una cuenta → `201 UserResponse`; `409` si el correo ya existe |
| POST | `/api/v1/auth/login` | No | JSON `{email, password}` → `200 {access_token, token_type, expires_in}`; `401` genérico |
| GET | `/api/v1/auth/me` | JWT | Datos del usuario autenticado; `404` si ya no existe |
| GET | `/api/v1/users/batch?ids=a,b,c` | JWT | `[{id, name, role}]` para resolver nombres (máx. 100 ids) |
| GET | `/health` | No | Probe de salud |

- `register` y `me` nunca devuelven `password_hash`.
- `login` responde el mismo `401 {"detail": "Credenciales inválidas"}` si el correo no existe o si
  la contraseña es incorrecta, para no permitir enumerar correos.
- `users/batch` excluye `email` y `password_hash`; los ids inexistentes o mal formados se omiten
  (no es un error) y la respuesta respeta el orden en que se pidieron.
- No existe `GET /users` ni `GET /users/{id}` (RNF-06, minimización de datos personales) ni
  endpoint para cambiar el rol: el rol se fija al registrarse.

## Contrato del JWT

Firmado con HS256 y `JWT_SECRET_KEY`. Claims exactos (los que `core/security.py ::
get_current_user` espera en los cuatro servicios):

| Claim | Valor |
|---|---|
| `sub` | id del usuario (`ObjectId` como string) |
| `role` | `"estudiante"` \| `"docente"` |
| `exp` | expiración, `JWT_EXPIRE_MINUTES` después de emitido (60 por defecto) |

No agregar claims sin actualizar el template: los otros servicios dependen de este contrato.

## Reglas de negocio

- **Correo único**, garantizado por el índice `users.email` (único) que se crea al arrancar
  (`app/db/init_indexes.py`); un `DuplicateKeyError` se traduce a `409`.
- **El correo no distingue mayúsculas**: se guarda y se busca en minúsculas.
- **Contraseña de 8 a 72 caracteres y máximo 72 bytes**: bcrypt opera sobre bytes, y con tildes o
  `ñ` 72 caracteres pueden superar ese límite. Se valida en el registro (`422`).
- Las contraseñas nunca se registran en logs; los logs de registro solo incluyen id y rol.
- No se restringe el dominio del correo en el MVP (trabajo futuro).

## Estructura propia del servicio

```
app/
├── api/v1/auth.py        # register, login, me, users/batch
├── core/credentials.py   # hash de contraseñas y emisión de JWT (create_access_token)
├── db/init_indexes.py    # índice único de email, invocado desde el lifespan
├── models/user.py        # UserRole, UserInDB
└── schemas/user.py       # requests y responses
```

El resto de archivos es el template sin cambios, salvo `db/mongodb.py` (cliente con
`tz_aware=True` para que las fechas leídas de Mongo se serialicen en UTC).

## Levantar el servicio

```bash
cp .env.example .env
docker compose up --build
```

- Salud: <http://localhost:8000/health> → `{"status": "ok", "service": "auth-service"}`
- OpenAPI: <http://localhost:8000/docs>

Al arrancar, el servicio crea el índice de `users`, así que necesita MongoDB disponible.

## Tests

Requieren un MongoDB en `MONGODB_URI` (por defecto `mongodb://localhost:27017`); usan la base
`graphic_tracker_test`, que se vacía antes y después de cada test.

```bash
docker compose up -d mongo
pip install -r requirements-dev.txt
pytest
```

## Linter

```bash
ruff check .
ruff format --check .
```

## Variables de entorno

Las mismas del template (ver `.env.example`); este servicio no agrega ninguna.
`SERVICE_NAME=auth-service`, y `JWT_SECRET_KEY` debe ser **idéntica** en los cuatro servicios.
