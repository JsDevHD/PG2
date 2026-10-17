# Auth_Service (auth-service)

- Endpoints: `POST /api/v1/auth/register`, `POST /api/v1/auth/login` (JSON body, not OAuth2 form), `GET /api/v1/auth/me`, `GET /api/v1/users/batch`.
- Own files: `api/v1/auth.py`, `core/credentials.py` (bcrypt hash + `create_access_token`), `db/init_indexes.py` (unique `users.email`), `models/user.py`, `schemas/user.py`.
- Emails stored/queried lowercase. Password 8–72 chars AND ≤72 bytes (bcrypt limit; accents/ñ).
- Login returns the same generic 401 for unknown email and wrong password (no enumeration).
- Never return `password_hash`; `users/batch` also omits `email`. No list/get-by-id user endpoints, no role change (RNF-06).
- JWT contract: `mem:architecture`.
- Register requires `accept_legal: true` + `legal_version`; stored as `users.legal_consent {version, accepted_at}` (proof of authorization, Ley 1581/Decreto 1377); 422 otherwise. Not exposed in API.
