# Variables del despliegue en Azure (sin secretos). Se cargan en cada terminal de Git Bash, desde
# la raíz del repositorio:
#
#   source infra/azure/vars.sh && source infra/azure/secretos.sh
#
# Guía completa: docs/DESPLIEGUE_AZURE.md

# Git Bash convierte los argumentos que empiezan por "/" en rutas de Windows ("/*" se volvería
# "C:/Program Files/Git/*"); esto lo desactiva para az y docker.
export MSYS_NO_PATHCONV=1
# az en Windows imprime con la página de códigos de la consola (cp1252) y falla con caracteres
# como el BOM que devuelve API Management al subir la política ("charmap codec can't encode").
export PYTHONIOENCODING=utf-8

# Cambia SUFIJO por algo tuyo (minúsculas y números, máx. 8): ACR, Storage y APIM necesitan
# nombres únicos en todo Azure.
SUFIJO=js2026
# Región de la base (el clúster DocumentDB gratuito quedó en westus), las Container Apps, el
# Storage y el registro: todo lo que habla con Mongo va en la misma región.
LOC=westus
# API Management (Consumption) ya estaba creado en eastus. Solo añade un salto por petición
# (~65 ms entre costas); recrearlo exigiría borrarlo y purgarlo.
APIM_LOC=eastus
RG=rg-graficos-udi

ACR=acrgraficos$SUFIJO
ACR_SERVER=$ACR.azurecr.io
STORAGE=stgraficos$SUFIJO
MONGO_CLUSTER=mongo-graficos-$SUFIJO
ENV_NAME=cae-graficos
APIM=apim-graficos-$SUFIJO
APIM_URL=https://$APIM.azure-api.net
TAG=v1

# Archivo de secretos (está en .gitignore; nunca se sube al repositorio).
SECRETOS=infra/azure/secretos.sh

# FQDN público de una Container App: fqdn auth-service
fqdn() { az containerapp show -n "$1" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv; }
