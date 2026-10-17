# ---- build stage ----
FROM node:22-slim AS builder
WORKDIR /app
# Misma versión de pnpm que "packageManager" en package.json.
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---- runtime stage ----
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# Plantilla procesada con envsubst al arrancar (CSP con la URL del gateway).
COPY nginx.conf /etc/nginx/templates/default.conf.template
# Genera /config.js con la URL del gateway del entorno: la misma imagen sirve en local y en Azure.
COPY --chmod=755 docker/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
# API_GATEWAY_URL vacío = mismo origen: Nginx reenvía /api/ a API_PROXY_UPSTREAM (un solo puerto).
# Con una URL (p. ej. Azure API Management) el navegador llama directo a ese gateway.
ENV API_GATEWAY_URL="" API_PROXY_UPSTREAM=""
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null || exit 1
