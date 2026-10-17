# API Gateway

- Local: Nginx (`gateway/nginx.conf`) in root compose on :8080. Azure target: API Management with the same route table (`gateway/README.md` has route table + APIM migration steps). Frontend only changes `VITE_API_GATEWAY_URL`.
- No path rewriting: full `/api/v1/...` path is forwarded. Routing by prefix/regex: auth/users → auth; `/api/v1/courses*` and `/projects/{id}/versions*` → projects; `/versions/{id}/feedback`, `/projects/{id}/(feedback|final-grade)` → feedback; `/projects/{id}/export` → export; others → JSON 404.
- Upstreams resolved per request via Docker DNS (`resolver 127.0.0.11` + `set $var`), so recreating a service doesn't require restarting the gateway.
- CORS in exactly one place (duplicate Allow-Origin breaks browsers): locally in each service (`CORS_ALLOWED_ORIGINS`, Nginx forwards OPTIONS); in Azure a global APIM `cors` policy (APIM 404s unmatched OPTIONS) exposing `Content-Disposition`, with services' `CORS_ALLOWED_ORIGINS=[]`. JWT validated by services, not the gateway.
- APIM needs a unique URL suffix per API ⇒ use ONE API with empty suffix and `set-backend-service` per operation to keep `/api/v1/...` paths.
- `client_max_body_size 25m` (uploads ≤ 20 MB), `proxy_read_timeout 120s` (PDF export).
- Any new backend endpoint must be added to nginx.conf, gateway README and APIM.
