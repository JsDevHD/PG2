# api-gateway

Punto de entrada único del frontend hacia los cuatro microservicios. En local es un Nginx
(`nginx.conf`) que corre en el `docker-compose.yml` de la raíz; en Azure se reemplaza por
**Azure API Management (APIM)** con la misma tabla de rutas. El frontend no cambia entre ambos
entornos: solo cambia el valor de `VITE_API_GATEWAY_URL`.

| Entorno | Gateway | `VITE_API_GATEWAY_URL` |
|---|---|---|
| Local | Nginx en `http://localhost:8080` | `http://localhost:8080` |
| Azure | API Management | `https://<nombre-apim>.azure-api.net` (o el dominio propio) |

## Tabla de enrutamiento (contrato)

Es la tabla de la sección 8 de `frontend/06_Frontend_Especificacion.md`, ajustada a las rutas
que existen en el backend. El gateway **no reescribe paths**: reenvía la ruta completa
(`/api/v1/...`) al servicio, que ya la expone así.

| Ruta | Servicio | Upstream local |
|---|---|---|
| `/api/v1/auth/*`, `/api/v1/users/*` | Auth | `auth-service:8000` |
| `/api/v1/courses`, `/api/v1/courses/*` (incluye `/{id}/projects` y `/{id}/progress`) | Projects | `projects-service:8000` |
| `/api/v1/projects/{id}/versions`, `/api/v1/projects/{id}/versions/{versionId}[/file]` | Projects | `projects-service:8000` |
| `/api/v1/projects/{id}` (PATCH editar, DELETE eliminar) | Projects | `projects-service:8000` |
| `/api/v1/projects/{id}/groups`, `/api/v1/projects/{id}/groups/{groupId}/(join|leave)`, `/api/v1/projects/{id}/group-deadline` | Projects | `projects-service:8000` |
| `/api/v1/versions/{id}/feedback` | Feedback | `feedback-service:8000` |
| `/api/v1/projects/{id}/feedback`, `/api/v1/projects/{id}/final-grade` | Feedback | `feedback-service:8000` |
| `/api/v1/projects/{id}/export` | Export | `export-service:8000` |
| `/api/v1/portfolio/export` | Export | `export-service:8000` |
| `/health` | El propio gateway | — |

Cualquier otra ruta responde `404 {"detail": "Ruta no encontrada en el API Gateway"}`.

Si agregas un endpoint en un servicio, agrégalo aquí, en `nginx.conf` y en APIM.

## Decisiones que se mantienen en Azure

- **El JWT lo validan los servicios**, no el gateway; APIM solo reenvía `Authorization`. Agregar
  `validate-jwt` en APIM es opcional (defensa adicional), nunca un reemplazo.
- **Tamaño de petición**: hasta 25 MB (las versiones admiten 20 MB). En APIM revisar el límite
  del tier elegido.
- **Timeout**: 120 s, por la exportación de PDF (`forward-request timeout="120"` en APIM).

### CORS: en un solo lugar

- **Local:** lo resuelve cada servicio (`CORS_ALLOWED_ORIGINS`) y Nginx reenvía todo, incluido el
  preflight `OPTIONS`.
- **Azure:** APIM rechaza (404) un `OPTIONS` que no coincida con ninguna operación, así que el
  preflight nunca llegaría a los servicios. Se configura la política `cors` **global en APIM** y se
  deja `CORS_ALLOWED_ORIGINS=[]` en los servicios (tenerla en ambos lados duplica
  `Access-Control-Allow-Origin` y el navegador rechaza la respuesta):

```xml
<cors allow-credentials="false">
  <allowed-origins><origin>https://<dominio-del-frontend></origin></allowed-origins>
  <allowed-methods><method>GET</method><method>POST</method><method>PATCH</method><method>DELETE</method></allowed-methods>
  <allowed-headers><header>Authorization</header><header>Content-Type</header></allowed-headers>
  <expose-headers><header>Content-Disposition</header></expose-headers>
</cors>
```

`Content-Disposition` debe quedar expuesta: el frontend la usa para el nombre del PDF exportado.

## Migrar a Azure API Management (resumen)

El paso a paso completo, con comandos, está en [`docs/DESPLIEGUE_AZURE.md`](../docs/DESPLIEGUE_AZURE.md).
En resumen:

1. Cada servicio se despliega en Azure Container Apps.
2. En APIM se crea **una sola API** (`graficos`) con sufijo `api/v1` y operaciones comodín
   (`GET /*`, `POST /*`, `PATCH /*`, `DELETE /*`, `OPTIONS /*`).
3. La política [`apim-policy.xml`](apim-policy.xml) es el equivalente de `nginx.conf`: elige el
   servicio según la ruta (`set-backend-service` con *named values*), aplica el `cors` de arriba y
   el `forward-request timeout="120"`, y responde 404 a las rutas desconocidas.
4. La API no exige clave de suscripción: la autenticación es el JWT propio.
5. El contenedor del frontend se despliega con `API_GATEWAY_URL=https://<apim>.azure-api.net`. Se
   lee al arrancar, así que no hay que reconstruir la imagen.

## Probar en local

```powershell
docker compose up -d --build
Invoke-RestMethod http://localhost:8080/health
Invoke-RestMethod http://localhost:8080/api/v1/auth/me   # 401: llegó a Auth Service
```
