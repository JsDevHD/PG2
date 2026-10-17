#!/bin/sh
# Genera /config.js con la configuración del entorno al arrancar el contenedor, para que la misma
# imagen sirva en local, en un túnel (p. ej. el reenvío de puertos de VS Code) y en Azure. Lo
# ejecuta el entrypoint oficial de la imagen de Nginx (scripts en /docker-entrypoint.d/).
#
#   API_GATEWAY_URL=""          → mismo origen: el navegador llama a /api/... de este mismo
#                                  servidor y Nginx lo reenvía a API_PROXY_UPSTREAM.
#   API_GATEWAY_URL="https://…" → el navegador llama directo a ese gateway (p. ej. API Management).
set -eu
API_GATEWAY_URL="${API_GATEWAY_URL-}"
APP_NAME="${APP_NAME:-Seguimiento de Proyectos Gráficos}"
if [ -z "$API_GATEWAY_URL" ] && [ -z "${API_PROXY_UPSTREAM-}" ]; then
  echo "40-runtime-config: API_GATEWAY_URL vacío requiere API_PROXY_UPSTREAM (URL del gateway)" >&2
  exit 1
fi
cat > /usr/share/nginx/html/config.js <<JS
window.__ENV__ = { API_GATEWAY_URL: "${API_GATEWAY_URL}", APP_NAME: "${APP_NAME}" };
JS
