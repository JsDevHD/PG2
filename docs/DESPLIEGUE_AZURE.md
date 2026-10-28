# Despliegue en Azure, paso a paso

Esta guía lleva el sistema que hoy corre con `docker compose` a Azure, con comandos listos para
copiar. Se sigue en orden; cada paso indica qué debe salir para continuar.

> **El sistema ya se desplegó con esta guía** (16 de octubre de 2026). El registro de ese
> despliegue está en la sección 19 de [`DOCUMENTACION_TECNICA.md`](DOCUMENTACION_TECNICA.md):
> recursos, URLs, salidas reales, tiempos, capturas y problemas encontrados. Esta guía ya incorpora
> esas correcciones. El informe [`INFORME_DESPLIEGUE_AZURE.md`](INFORME_DESPLIEGUE_AZURE.md)
> explica cada problema y el porqué de cada comando, y dice **qué cambiar para montarlo en otra
> cuenta, región o sistema operativo** (sección 6).

> **Antes de empezar:** sigue los comandos en **Git Bash**, desde la raíz del repositorio.
> PowerShell y `cmd` interpretan mal los `&` y `=` de las cadenas de conexión, y en Git Bash el
> archivo `infra/azure/vars.sh` ya desactiva la conversión de rutas que rompería algunos comandos.

---

## 0. Qué se va a construir

```
Navegador
   │  https://frontend.<dominio>.azurecontainerapps.io          (SPA + Nginx)
   ▼
frontend ──(el navegador llama a)──►  API Management (Consumption)
                                      https://apim-graficos-<sufijo>.azure-api.net/api/v1/...
                                         │  enruta por path (gateway/apim-policy.xml)
                    ┌────────────────────┼────────────────────┬────────────────────┐
                    ▼                    ▼                    ▼                    ▼
              auth-service        projects-service     feedback-service     export-service
                    │                    │   │                │                │   │
                    └──────────┬─────────┘   └──── Blob Storage (contenedor "versions") ──┘
                               ▼                                                   │
                Cosmos DB for MongoDB vCore / Azure DocumentDB  ◄──────────────────┘
                (todos los servicios usan la base graphic_tracker)
```

Cada pieza de `docker-compose.yml` tiene su equivalente en Azure:

| Local (`docker compose`) | Azure | Notas |
|---|---|---|
| Red de compose | **Container Apps Environment** | Los cinco contenedores viven en él |
| Imágenes construidas en local | **Azure Container Registry (ACR)** | Se construyen en tu PC y se suben |
| `auth/projects/feedback/export-service` | **Container Apps** (uno por servicio) | Mismas imágenes, mismo puerto 8000 |
| `frontend` | **Container App** | Misma imagen; solo cambia `API_GATEWAY_URL` |
| `gateway` (Nginx) | **API Management** (tier Consumption) | Misma tabla de rutas, en una política |
| `mongo` | **Cosmos DB for MongoDB (vCore)**, free tier | Plan B: MongoDB Atlas en región Azure |
| `azurite` | **Storage Account** (Blob) | El contenedor `versions` es privado |
| `JWT_SECRET_KEY` del `.env` | **Secretos** de cada Container App | Nunca en variables visibles |

El Nginx del gateway local **no se despliega**: lo reemplaza API Management.

**Los datos locales no se migran.** Los archivos de las versiones están en Azurite y la base de
desarrollo tiene datos de pruebas. En Azure se empieza con una base vacía y, si quieres, se cargan
los datos de demostración (paso 11).

---

## 1. Requisitos

1. **Cuenta de Azure.** Sirve cualquiera de estas dos:
   - **Cuenta gratuita** (https://azure.microsoft.com/free): US$200 de crédito que **vencen a los
     30 días**. Es la que se usó. Después hay que pasarla a pago por uso, y este despliegue cuesta
     unos US$5–6 al mes (sección 15).
   - **Azure for Students** (https://azure.microsoft.com/free/students), con el correo de la UDI:
     da crédito sin tarjeta, pero limita las regiones permitidas. Si un comando falla con
     `RequestDisallowedByPolicy`, cambia `LOC` en `infra/azure/vars.sh` (prueba `eastus2`,
     `centralus` o `brazilsouth`) y repite el comando.
2. **Azure CLI.** Instálala desde PowerShell y luego cierra y vuelve a abrir Git Bash:
   ```powershell
   winget install -e --id Microsoft.AzureCLI
   ```
   Si `winget` no existe (pasa en algunos Windows 10), usa el instalador oficial. Abre PowerShell
   **como administrador** y ejecuta:
   ```powershell
   $ProgressPreference = 'SilentlyContinue'
   Invoke-WebRequest -Uri https://aka.ms/installazurecliwindowsx64 -OutFile "$env:TEMP\AzureCLI.msi"
   Start-Process msiexec.exe -Wait -ArgumentList "/I `"$env:TEMP\AzureCLI.msi`" /quiet"
   Remove-Item "$env:TEMP\AzureCLI.msi"
   ```
   También puedes descargar el `.msi` desde https://aka.ms/installazurecliwindowsx64 e
   instalarlo con doble clic.
3. **Docker Desktop** encendido (el mismo que usas con `docker compose`).
4. **Node** (ya lo tienes por el frontend), solo para preparar un JSON en el paso 9.

Comprueba en Git Bash:

```bash
az version
docker version
node --version
```

---

## 2. Variables del despliegue

El archivo `infra/azure/vars.sh` ya existe.

1. Ábrelo y revisa estos valores:
   - `SUFIJO`: algo tuyo, con **minúsculas** y números, máximo 8 (p. ej. `jp2026`). El registro,
     el Storage y API Management necesitan nombres únicos en todo Azure.
   - `LOC`: la región de la base de datos. Ahí van también las Container Apps, el Storage y el
     registro, porque Mongo es lo que más tráfico recibe. Si el portal crea el clúster gratuito en
     otra región (paso 4), cambia `LOC` a esa.
   - `APIM_LOC`: la región de API Management. Puede ser otra; solo añade un salto por petición.
   - Comprueba que un nombre esté libre con
     `az storage account check-name -n "$STORAGE"` y `az acr check-name -n "$ACR"`.
2. Crea el archivo de secretos. Ya está en `.gitignore`, así que nunca se sube:

```bash
source infra/azure/vars.sh
touch "$SECRETOS"
echo "JWT_SECRET_KEY='$(openssl rand -hex 32)'" >> "$SECRETOS"
# Contraseña de las cuentas de demostración en Azure (la del repositorio es pública; paso 11)
echo "DEMO_PASSWORD='Demo$(openssl rand -hex 8)'" >> "$SECRETOS"
```

> **Nunca pegues una cadena de conexión o una contraseña en esta guía ni en otro archivo del
> repositorio.** Van solo en `secretos.sh`.

**En cada terminal nueva**, antes de cualquier comando de esta guía, ejecuta:

```bash
source infra/azure/vars.sh && source infra/azure/secretos.sh
```

---

## 3. Iniciar sesión, registrar proveedores y crear el grupo de recursos

```bash
az login                                       # o: az login --use-device-code (ver nota)
az account list -o table                       # si tienes varias suscripciones:
az account set --subscription "<nombre o id>"  # elige la del crédito

# En Azure CLI 2.90 containerapp y apim ya vienen incluidos; en versiones viejas hacen falta:
az extension add --name containerapp --upgrade 2>/dev/null || true
az extension add --name apim --upgrade 2>/dev/null || true

# --wait: en una suscripción nueva, crear recursos antes de que el proveedor quede "Registered"
# da SubscriptionNotFound (pasó con Storage). Puede tardar varios minutos.
for p in Microsoft.App Microsoft.OperationalInsights Microsoft.ContainerRegistry \
         Microsoft.Storage Microsoft.DocumentDB Microsoft.ApiManagement; do
  echo "Registrando $p..."; az provider register --namespace $p --wait
done
for p in Microsoft.App Microsoft.OperationalInsights Microsoft.ContainerRegistry \
         Microsoft.Storage Microsoft.DocumentDB Microsoft.ApiManagement; do
  echo "$p: $(az provider show -n $p --query registrationState -o tsv)"   # los seis: Registered
done

az group create -n "$RG" -l "$LOC"
```

> **Si `az` responde `AADSTS530035: Access has been blocked by security defaults`:** la sesión
> guardada expiró y Entra ID exige volver a entrar con MFA. Ejecuta
> `az login --tenant <id-del-tenant>` (el id sale en el mismo error). En Windows, `az login` abre
> una ventana del sistema para elegir la cuenta. Si no aparece (puede quedar detrás de otras
> ventanas), usa `az login --use-device-code --tenant <id>`: muestra un código que se escribe en
> https://login.microsoft.com/device.

Crea ya API Management, porque tarda varios minutos. `--no-wait` deja que avances mientras tanto:

```bash
az apim create -n "$APIM" -g "$RG" -l "$APIM_LOC" \
  --sku-name Consumption \
  --publisher-name "UDI - Proyecto de grado" \
  --publisher-email "<tu-correo>" \
  --no-wait
```

---

## 4. Base de datos: Azure DocumentDB (antes Cosmos DB for MongoDB vCore)

En 2025 Microsoft renombró este servicio a **Azure DocumentDB**; en el portal puede aparecer con
cualquiera de los dos nombres. Usa el modelo **vCore**, no el "RU". El free tier se crea desde el
portal:

1. Portal de Azure → **Crear un recurso** → busca *Azure Cosmos DB for MongoDB* (o *Azure
   DocumentDB*) → elige **vCore cluster**.
2. **Básico:**
   - Grupo de recursos: `rg-graficos-udi`.
   - Nombre del clúster: p. ej. `mongo-graficos-<sufijo>`.
   - Región: la misma de `LOC`. Si ahí no se ofrece el free tier, elige otra región y cambia `LOC`
     a esa. En el despliegue real quedó en `westus`.
   - Versión de MongoDB: la más alta disponible (7.0 u 8.0).
   - **Nivel: Free tier.** Solo se permite uno por suscripción.
   - Usuario administrador y contraseña: usa **solo letras y números** en la contraseña; un `@`,
     `:` o `/` rompería la cadena de conexión.
3. **Redes:**
   - Acceso público.
   - Marca **"Permitir acceso público desde servicios de Azure"**. Las Container Apps no tienen
     IP fija, así que se necesita.
   - Agrega tu IP actual, para la prueba del punto 5. Tu IP pública cambia con el tiempo. Para
     volver a agregarla después, sin el portal:
     ```bash
     CLUSTER_ID=$(az resource list -g "$RG" --resource-type Microsoft.DocumentDB/mongoClusters --query "[0].id" -o tsv)
     IP=$(curl -s https://api.ipify.org)
     az rest --method put \n       --uri "https://management.azure.com$CLUSTER_ID/firewallRules/ClienteDespliegue?api-version=2024-07-01" \n       --body "{\"properties\":{\"startIpAddress\":\"$IP\",\"endIpAddress\":\"$IP\"}}"
     # Al terminar, quítala: el mismo --uri con --method delete
     ```
4. Crear. Cuando termine, abre el recurso → **Cadenas de conexión** y cópiala. Se ve así:
   ```
   mongodb+srv://<usuario>:<password>@mongo-graficos-<sufijo>.global.mongocluster.cosmos.azure.com/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000
   ```
   Reemplaza `<usuario>` y `<password>` y guárdala en el archivo de secretos. Abre
   `infra/azure/secretos.sh` en VS Code y agrega la línea entre comillas simples:
   ```bash
   MONGODB_URI='mongodb+srv://...'
   ```
   Luego `source infra/azure/secretos.sh`.

5. **Prueba obligatoria antes de seguir.** Feedback Service crea dos **índices únicos parciales**
   (`unique_final_grade_per_student` y `unique_current_partial_grade`). Si la base no los soporta,
   el servicio no arranca. Projects Service, además, crea un **índice único sobre un arreglo**
   (`unique_group_member_per_project`, para los grupos). Pruébalo todo con el `mongosh` de la imagen
   oficial:

   ```bash
   docker run --rm mongo:7 mongosh "$MONGODB_URI" --quiet --eval '
     const d = db.getSiblingDB("prueba_indices");
     d.t.createIndex({ a: 1 }, { unique: true,
       partialFilterExpression: { c: false, b: { $type: "number" } } });
     // Grupos: índice único sobre un arreglo (un estudiante en un solo grupo por proyecto).
     d.g.createIndex({ p: 1, m: 1 }, { unique: true });
     d.g.insertOne({ p: 1, m: ["ana", "bruno"] });
     let multikey = false;
     try { d.g.insertOne({ p: 1, m: ["ana"] }); } catch (e) { multikey = e.code === 11000; }
     if (!multikey) throw new Error("La base no hace cumplir índices únicos multikey");
     // Calificaciones: el índice parcial debe rechazar duplicados dentro del filtro.
     d.t.insertOne({ a: 1, c: false, b: 5 });
     let partial = false;
     try { d.t.insertOne({ a: 1, c: false, b: 6 }); } catch (e) { partial = e.code === 11000; }
     d.t.insertOne({ a: 1, c: true, b: 7 });   // fuera del filtro: se permite
     if (!partial) throw new Error("La base no hace cumplir índices únicos parciales");
     print("OK: la base soporta índices únicos parciales y multikey");
     d.dropDatabase();'
   ```

   - Si imprime `OK`, sigue al paso 5. El free tier de DocumentDB con MongoDB 8.0 dio `OK` en el
     despliegue real.
   - Si da un error como *"Partial indexes support is currently not enabled"*, usa el plan B.

### Plan B: MongoDB Atlas desplegado en Azure

Es MongoDB real, igual al `mongo:7` local, corriendo en un centro de datos de Azure.

1. https://www.mongodb.com/cloud/atlas/register → crea un clúster **M0 (gratis)**.
   - Proveedor: **Azure**, en la región más cercana a `LOC`.
2. **Database Access:** crea un usuario con contraseña de letras y números.
3. **Network Access:** agrega `0.0.0.0/0`. Las Container Apps no tienen IP fija; la protección es
   el usuario y la contraseña.
4. **Connect → Drivers:** copia la cadena (`mongodb+srv://...mongodb.net/?retryWrites=true&w=majority`)
   y guárdala como `MONGODB_URI` en `secretos.sh`.
5. Repite la prueba del punto 5. Con Atlas siempre da `OK`.

---

## 5. Blob Storage (reemplaza a Azurite)

```bash
az storage account create -n "$STORAGE" -g "$RG" -l "$LOC" \
  --sku Standard_LRS --kind StorageV2 \
  --min-tls-version TLS1_2 --allow-blob-public-access false

STORAGE_CONN=$(az storage account show-connection-string -n "$STORAGE" -g "$RG" \
  --query connectionString -o tsv)
echo "STORAGE_CONN='$STORAGE_CONN'" >> "$SECRETOS"

# Contenedor privado de los archivos de las versiones (Projects también lo crea si falta).
az storage container create --name versions --connection-string "$STORAGE_CONN"
```

El contenedor es privado a propósito. El frontend nunca abre el blob directamente: Projects y
Export descargan el archivo y lo sirven a través de la API, con la misma autorización.

---

## 6. Registro de contenedores (ACR) y subida de las imágenes

```bash
az acr create -n "$ACR" -g "$RG" -l "$LOC" --sku Basic --admin-enabled true
az acr login -n "$ACR"                       # Login Succeeded
```

Construye y sube las cinco imágenes con los mismos Dockerfile que usa `docker compose`:

```bash
declare -A DIRS=(
  [auth-service]=Auth_Service
  [projects-service]=Projects_Service
  [feedback-service]=Feedback_Service
  [export-service]=Export_Service
  [frontend]=frontend
)
for app in "${!DIRS[@]}"; do
  docker build --platform linux/amd64 -t "$ACR_SERVER/$app:$TAG" "${DIRS[$app]}" \
    && docker push "$ACR_SERVER/$app:$TAG" || break
done

az acr repository list -n "$ACR" -o table   # deben salir las 5
```

La construcción no necesita Azure: si la sesión de `az` todavía no está lista, construye antes y
sube después. En el despliegue real, subir las cinco imágenes tomó 28 s.

Credenciales para que las Container Apps descarguen las imágenes:

```bash
ACR_USER=$(az acr credential show -n "$ACR" --query username -o tsv)
ACR_PASS=$(az acr credential show -n "$ACR" --query "passwords[0].value" -o tsv)
echo "ACR_USER='$ACR_USER'" >> "$SECRETOS"
echo "ACR_PASS='$ACR_PASS'" >> "$SECRETOS"
```

---

## 7. Entorno de Container Apps y los cuatro microservicios

Primero, el espacio de Log Analytics para los logs. Si no lo creas, `az containerapp env create`
crea uno **sin tope de ingesta**. Este queda con 30 días de retención y un tope de 0,5 GB al día,
dentro de la cuota gratuita:

```bash
az monitor log-analytics workspace create -g "$RG" -n log-graficos -l "$LOC" \
  --retention-time 30 --quota 0.5
WS_ID=$(az monitor log-analytics workspace show -g "$RG" -n log-graficos --query customerId -o tsv)
WS_KEY=$(az monitor log-analytics workspace get-shared-keys -g "$RG" -n log-graficos --query primarySharedKey -o tsv)

# Tarda unos 2-3 minutos
az containerapp env create -n "$ENV_NAME" -g "$RG" -l "$LOC" \
  --logs-workspace-id "$WS_ID" --logs-workspace-key "$WS_KEY"
```

Configuración común. Es el `x-common-env` del `docker-compose.yml`, con los valores sensibles como
secretos (`secretref:`):

```bash
COMMON_ENV=(
  ENVIRONMENT=production
  MONGODB_URI=secretref:mongodb-uri
  MONGODB_DB_NAME=graphic_tracker
  JWT_SECRET_KEY=secretref:jwt-secret
  JWT_ALGORITHM=HS256
  JWT_EXPIRE_MINUTES=60
  'CORS_ALLOWED_ORIGINS=[]'
  LOG_LEVEL=INFO
)
COMMON_SECRETS=("mongodb-uri=$MONGODB_URI" "jwt-secret=$JWT_SECRET_KEY")
REGISTRY=(--registry-server "$ACR_SERVER" --registry-username "$ACR_USER" --registry-password "$ACR_PASS")
```

> `CORS_ALLOWED_ORIGINS=[]` es intencional: en Azure el CORS lo resuelve API Management. Si se deja
> en los dos lados, la cabecera `Access-Control-Allow-Origin` sale duplicada y el navegador rechaza
> la respuesta (ver `gateway/README.md`).

**Auth Service** va primero, porque Projects y Export necesitan su URL:

```bash
az containerapp create -n auth-service -g "$RG" --environment "$ENV_NAME" \
  --image "$ACR_SERVER/auth-service:$TAG" "${REGISTRY[@]}" \
  --ingress external --target-port 8000 \
  --cpu 0.25 --memory 0.5Gi --min-replicas 0 --max-replicas 2 \
  --secrets "${COMMON_SECRETS[@]}" \
  --env-vars "${COMMON_ENV[@]}" SERVICE_NAME=auth-service

AUTH_FQDN=$(fqdn auth-service)
curl -s "https://$AUTH_FQDN/health"   # {"status":"ok","service":"auth-service"}
```

El primer `curl` puede tardar unos segundos mientras el contenedor despierta (réplicas mínimas en
0).

**Projects Service** (Blob Storage y llamadas a Auth):

```bash
az containerapp create -n projects-service -g "$RG" --environment "$ENV_NAME" \
  --image "$ACR_SERVER/projects-service:$TAG" "${REGISTRY[@]}" \
  --ingress external --target-port 8000 \
  --cpu 0.5 --memory 1.0Gi --min-replicas 0 --max-replicas 2 \
  --secrets "${COMMON_SECRETS[@]}" "storage-conn=$STORAGE_CONN" \
  --env-vars "${COMMON_ENV[@]}" SERVICE_NAME=projects-service \
    AZURE_STORAGE_CONNECTION_STRING=secretref:storage-conn \
    AZURE_STORAGE_CONTAINER=versions \
    "AUTH_SERVICE_URL=https://$AUTH_FQDN"
```

**Feedback Service:**

```bash
az containerapp create -n feedback-service -g "$RG" --environment "$ENV_NAME" \
  --image "$ACR_SERVER/feedback-service:$TAG" "${REGISTRY[@]}" \
  --ingress external --target-port 8000 \
  --cpu 0.25 --memory 0.5Gi --min-replicas 0 --max-replicas 2 \
  --secrets "${COMMON_SECRETS[@]}" \
  --env-vars "${COMMON_ENV[@]}" SERVICE_NAME=feedback-service
```

**Export Service** (descarga de Blob y generación del PDF, por eso lleva más memoria):

```bash
az containerapp create -n export-service -g "$RG" --environment "$ENV_NAME" \
  --image "$ACR_SERVER/export-service:$TAG" "${REGISTRY[@]}" \
  --ingress external --target-port 8000 \
  --cpu 0.5 --memory 1.0Gi --min-replicas 0 --max-replicas 2 \
  --secrets "${COMMON_SECRETS[@]}" "storage-conn=$STORAGE_CONN" \
  --env-vars "${COMMON_ENV[@]}" SERVICE_NAME=export-service \
    AZURE_STORAGE_CONNECTION_STRING=secretref:storage-conn \
    AZURE_STORAGE_CONTAINER=versions \
    "AUTH_SERVICE_URL=https://$AUTH_FQDN"
```

Comprueba los cuatro:

```bash
for app in auth-service projects-service feedback-service export-service; do
  echo "$app → $(curl -s "https://$(fqdn $app)/health")"
done
```

`/health` no toca la base. Para confirmar que cada servicio llegó a Mongo y creó sus índices,
mira el arranque en los logs: debe decir «Índices ... verificados» y «Application startup
complete», sin errores. Export no crea índices.

```bash
for app in auth-service projects-service feedback-service export-service; do
  echo "== $app"
  az containerapp logs show -n $app -g "$RG" --tail 40 --format text | grep -i -E "startup|error|índices"
done
```

Si alguno no responde, revisa sus logs (sección 14). Lo más común es que no llegue a la base de
datos: revisa el firewall del paso 4 y la `MONGODB_URI`.

---

## 8. Frontend

La misma imagen sirve en local y en Azure. Al arrancar genera `/config.js` con
`API_GATEWAY_URL`, y la CSP de Nginx permite conectarse a esa URL. No hay que reconstruir nada.

```bash
az containerapp create -n frontend -g "$RG" --environment "$ENV_NAME" \
  --image "$ACR_SERVER/frontend:$TAG" "${REGISTRY[@]}" \
  --ingress external --target-port 80 \
  --cpu 0.25 --memory 0.5Gi --min-replicas 0 --max-replicas 2 \
  --env-vars "API_GATEWAY_URL=$APIM_URL"

FRONTEND_FQDN=$(fqdn frontend)
echo "Frontend: https://$FRONTEND_FQDN"
curl -s "https://$FRONTEND_FQDN/config.js"   # debe mostrar la URL de API Management
```

Todavía no funciona: falta configurar API Management.

---

## 9. API Management (reemplaza al gateway Nginx)

Espera a que termine de crearse el APIM del paso 3:

```bash
az apim wait --created -n "$APIM" -g "$RG"
```

**Cómo queda configurado:**
- Una sola API, `graficos`, con sufijo `api/v1`.
- Cinco operaciones comodín (`GET /*`, `POST /*`, `PATCH /*`, `DELETE /*` y `OPTIONS /*`).
  PATCH y DELETE son para editar y eliminar proyectos; OPTIONS, para el preflight de CORS.
- La política `gateway/apim-policy.xml`, que hace lo mismo que `gateway/nginx.conf`: elige el
  servicio según la ruta, aplica el CORS, da 120 s de timeout y responde 404 para rutas
  desconocidas.

**9.1 API y operaciones.** La API no exige clave de suscripción, porque la autenticación es el JWT
propio:

```bash
az apim api create -g "$RG" --service-name "$APIM" \
  --api-id graficos --display-name "Seguimiento de Proyectos Gráficos" \
  --path api/v1 --protocols https --subscription-required false

for m in GET POST PATCH DELETE OPTIONS; do
  az apim api operation create -g "$RG" --service-name "$APIM" --api-id graficos \
    --operation-id "todo-${m,,}" --display-name "$m /*" --method $m --url-template "/*"
done
```

**9.2 Named values.** Son las URLs que usa la política. APIM quita `api/v1` antes de reenviar, por
eso cada URL lo vuelve a incluir:

```bash
nv() { az apim nv create -g "$RG" --service-name "$APIM" \
         --named-value-id "$1" --display-name "$1" --value "$2" -o none; }

nv frontend-origin "https://$(fqdn frontend)"
nv auth-url        "https://$(fqdn auth-service)/api/v1"
nv projects-url    "https://$(fqdn projects-service)/api/v1"
nv feedback-url    "https://$(fqdn feedback-service)/api/v1"
nv export-url      "https://$(fqdn export-service)/api/v1"
```

**9.3 Política.** `az` no tiene un comando directo para esto, así que se sube con la API de Azure
Resource Manager:

```bash
node -e 'const fs=require("fs");fs.writeFileSync(process.argv[2],JSON.stringify({properties:{format:"rawxml",value:fs.readFileSync(process.argv[1],"utf8")}}))' \
  gateway/apim-policy.xml apim-policy.json

SUB_ID=$(az account show --query id -o tsv)
POLICY_URI="https://management.azure.com/subscriptions/$SUB_ID/resourceGroups/$RG/providers/Microsoft.ApiManagement/service/$APIM/apis/graficos/policies/policy?api-version=2022-08-01"
az rest --method put --uri "$POLICY_URI" --body @apim-policy.json -o none && echo "Política aplicada"
rm apim-policy.json

# Comprobación: la política guardada debe tener las 9 rutas
az rest --method get --uri "$POLICY_URI&format=rawxml" --output-file policy-remota.xml
grep -c '<when ' policy-remota.xml && rm policy-remota.xml     # 9
```

> Si `az rest` falla con `'charmap' codec can't encode character '\ufeff'`, en esa terminal no se
> cargó `vars.sh`, que define `PYTHONIOENCODING=utf-8`. La política probablemente sí se guardó,
> porque el error ocurre al imprimir la respuesta. Confírmalo con la comprobación de arriba.

> **Alternativa sin comandos:** en el portal, abre APIM → **APIs** → *Seguimiento de Proyectos
> Gráficos* → **All operations** → en *Inbound processing* el ícono `</>` → pega el contenido de
> `gateway/apim-policy.xml` → **Save**.

---

## 10. Verificación

```bash
# 1) La ruta llega a Auth Service a través de APIM: debe responder 401 (sin token).
curl -i "$APIM_URL/api/v1/auth/me"

# 2) Una ruta inexistente: 404 {"detail": "Ruta no encontrada en el API Gateway"}
curl -i "$APIM_URL/api/v1/no-existe"

# 3) Preflight de CORS desde el frontend: 200 con Access-Control-Allow-Origin = el frontend.
curl -i -X OPTIONS "$APIM_URL/api/v1/auth/login" \
  -H "Origin: https://$(fqdn frontend)" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
```

Luego, en el navegador, abre `https://<FRONTEND_FQDN>` y recorre el flujo completo:

1. Registra un docente y crea un curso.
2. En otra ventana de incógnito, registra un estudiante, únete con el código y **sube una
   versión**.
3. Como docente, deja retroalimentación y una nota parcial, asigna la calificación final y
   **exporta el PDF**.
4. **Prueba de tamaño (obligatoria):** sube una versión de **15 a 20 MB**. El tier Consumption de
   API Management tiene límites de tamaño de petición más bajos que los demás tiers, y la
   documentación no es clara sobre el valor exacto.
   - Si la subida funciona, todo está listo. En el despliegue real, un PNG de 18 MB pasó por APIM
     Consumption (201 en 3,4 s). Uno de 21,9 MB lo rechazó la propia aplicación con 422, por su
     límite de 20 MB. Detalle en la sección 19.6, paso 13, de la documentación técnica.
   - Si responde **413**, el tier Consumption no sirve para este proyecto. Crea un APIM nuevo con
     `--sku-name Developer` (no se puede cambiar de Consumption a otro tier), repite el paso 9 y
     actualiza el frontend con la nueva URL (sección 13). Developer cuesta unos US$50 al mes y
     tarda unos 40 minutos en crearse.

Abre las herramientas del navegador (F12 → Consola y Red). No debe haber errores de CORS ni de
CSP.

---

## 11. Datos de demostración (opcional)

El script `scripts/seed_demo.py` funciona contra cualquier gateway: crea el docente, los tres
estudiantes, el curso, las versiones y la retroalimentación.

```bash
DEMO_PASSWORD="$DEMO_PASSWORD" .venv/Scripts/python scripts/seed_demo.py "$APIM_URL"
```

La contraseña de las cuentas sale de la variable `DEMO_PASSWORD` de `secretos.sh` (paso 2). Si no
se pasa, el script usa la del repositorio, que **no debe usarse en una URL pública**: cualquiera
que vea el código podría entrar. Para comprobar que la del repositorio no sirve, un login con ella
debe responder 401.

---

## 12. El día de la sustentación

Con réplicas mínimas en 0 todo cuesta casi nada, pero la primera petición tras un rato de
inactividad tarda unos segundos (*cold start*). Para la presentación, deja una réplica siempre
encendida:

```bash
for app in frontend auth-service projects-service feedback-service export-service; do
  az containerapp update -n $app -g "$RG" --min-replicas 1 -o none
done
```

Después vuelve a `--min-replicas 0` con el mismo comando. Tener una réplica siempre encendida en
las cinco apps cuesta unos US$1,5 al día, unos US$40 si se olvida todo el mes.

---

## 13. Actualizar después de un cambio

Construye con una etiqueta nueva y apunta la Container App a ella. Ejemplo con Feedback:

```bash
TAG=v2
docker build --platform linux/amd64 -t "$ACR_SERVER/feedback-service:$TAG" Feedback_Service
docker push "$ACR_SERVER/feedback-service:$TAG"
az containerapp update -n feedback-service -g "$RG" --image "$ACR_SERVER/feedback-service:$TAG"
```

Los secretos y variables se conservan; no hay que volver a pasarlos. Otros casos:

```bash
# Cambiar una variable (p. ej. la URL del gateway que usa el frontend)
az containerapp update -n frontend -g "$RG" --set-env-vars "API_GATEWAY_URL=$APIM_URL"

# Rotar un secreto (p. ej. la cadena de Mongo) y reiniciar para que se lea
az containerapp secret set -n auth-service -g "$RG" --secrets "mongodb-uri=$MONGODB_URI"
az containerapp revision restart -n auth-service -g "$RG" \
  --revision "$(az containerapp show -n auth-service -g "$RG" --query properties.latestRevisionName -o tsv)"
```

Si agregas un endpoint con una ruta nueva, agrégalo en `gateway/nginx.conf` **y** en
`gateway/apim-policy.xml`, y vuelve a subir la política (paso 9.3).

---

## 14. Problemas frecuentes

**Ver los logs de un servicio:**

```bash
az containerapp logs show -n feedback-service -g "$RG" --tail 100 --follow
az containerapp logs show -n feedback-service -g "$RG" --type system   # errores al arrancar
```

| Síntoma | Causa probable | Solución |
|---|---|---|
| Un servicio se reinicia en bucle | No llega a Mongo, o Feedback no pudo crear sus índices parciales | Firewall y `MONGODB_URI` (paso 4); si es el índice, plan B |
| `ServerSelectionTimeoutError` en los logs | El firewall de la base bloquea a Azure | Activa "Permitir acceso desde servicios de Azure" (paso 4.3) |
| Error de CORS en la consola del navegador | `frontend-origin` no coincide o falta `CORS_ALLOWED_ORIGINS=[]` | Revisa el named value (sin `/` final) y las variables de los servicios |
| La CSP bloquea la conexión a la API | `API_GATEWAY_URL` del frontend mal escrita | `curl https://<frontend>/config.js` y corrige con la sección 13 |
| APIM responde 401 con *"subscription key"* | La API exige clave de suscripción | `az apim api update -g "$RG" --service-name "$APIM" --api-id graficos --subscription-required false` |
| 413 al subir versiones | Límite de tamaño del tier Consumption | Ver la prueba de tamaño del paso 10 |
| 404 de APIM en una ruta que sí existe | Falta en la política, o el named value no termina en `/api/v1` | Revisa `gateway/apim-policy.xml` y `az apim nv list -g "$RG" --service-name "$APIM" -o table` |
| Los nombres de profesor y estudiante salen vacíos | Projects o Export no llegan a Auth | Revisa `AUTH_SERVICE_URL` (debe ser `https://<fqdn de auth>`) |
| `RequestDisallowedByPolicy` | Región no permitida en Azure for Students | Cambia `LOC` (sección 1) |
| `AADSTS530035: Access has been blocked by security defaults` | Expiró la sesión de `az` y Entra ID exige MFA de nuevo | `az login --tenant <id>` o `az login --use-device-code --tenant <id>` (paso 3) |
| `az login` se queda esperando | La ventana de Windows para elegir la cuenta quedó detrás de otras | Búscala en la barra de tareas, o usa `--use-device-code` |
| `(SubscriptionNotFound) Subscription <id> was not found` al crear el Storage | Suscripción recién creada: el proveedor `Microsoft.Storage` todavía no estaba registrado | Registrar los proveedores con `--wait` (paso 3) y repetir |
| `touch`, `source` u `openssl` «no se reconoce como nombre de un cmdlet» | Los comandos se pegaron en PowerShell | Usar Git Bash: el prompt termina en `$`, no en `PS C:\...>` |
| El Storage o el registro rechazan el nombre | `SUFIJO` con mayúsculas o guiones: Storage solo admite minúsculas y números (3–24) | `SUFIJO` en minúsculas (paso 2). Si ya se guardó un `STORAGE_CONN=''` vacío, bórralo de `secretos.sh` |
| `winget` «no se reconoce» | Algunos Windows 10 no traen winget | Instalador `.msi` de Azure CLI (sección 1) |
| `'charmap' codec can't encode character '\ufeff'` | `az` en Windows imprime con cp1252 | `source infra/azure/vars.sh`, que define `PYTHONIOENCODING=utf-8` |
| `mongosh` desde tu PC no conecta (timeout) | Tu IP pública cambió desde que la agregaste al firewall | Vuelve a agregarla (paso 4.3) y quítala al terminar |
| Un comando falla con rutas tipo `C:/Program Files/Git/...` | Conversión de rutas de Git Bash | `source infra/azure/vars.sh` (define `MSYS_NO_PATHCONV=1`) |

---

## 15. Costos aproximados y cómo apagar todo

Son valores de referencia; confírmalos con la calculadora de precios de Azure.

| Recurso | Costo |
|---|---|
| Container Apps (consumo, réplicas en 0) | La cuota gratuita mensual cubre una demo. Con réplicas en 1 en las cinco apps, ≈ US$1,4 al día (≈ US$40 al mes) |
| Container Registry Basic | ≈ US$5 al mes |
| API Management Consumption | El primer millón de llamadas al mes es gratis |
| Cosmos DB vCore free tier | Gratis (uno por suscripción) |
| Storage (Blob LRS) | Centavos |
| Log Analytics (logs de Container Apps) | Los primeros 5 GB al mes son gratis; el tope de 0,5 GB/día del paso 7 evita pasarse |
| **Total con réplicas en 0** | **≈ US$5–6 al mes** (casi todo es el registro) |

> **Cuenta gratuita:** el crédito de US$200 vence a los 30 días. Si no pasas la suscripción a pago
> por uso, Azure deshabilita los recursos. Revisa la fecha en **Cost Management → Créditos**.
> Conviene crear un presupuesto con alerta por correo en **Cost Management → Presupuestos**, por
> ejemplo de US$10 al mes sobre `rg-graficos-udi`.

**Apagar todo de una vez** borra todos los recursos y los datos, y no se puede deshacer. Hazlo
solo cuando el proyecto ya no se use:

```bash
az group delete -n "$RG"
```

Si usaste MongoDB Atlas, el clúster se borra aparte, desde su página.

---

## 16. Seguridad: lo que queda resuelto y lo que no

**Resuelto:**
- Todo el tráfico va por HTTPS: Container Apps y APIM traen certificado.
- Los secretos (JWT, Mongo, Storage) están como secretos de cada Container App, no en variables
  visibles ni en el repositorio.
- El contenedor de Blob es privado.
- El JWT lo validan los servicios.
- La CSP del frontend solo permite conectarse a API Management.

**Pendiente (aceptable para el proyecto de grado, mencionable en el documento):**
- **Los microservicios tienen URL pública propia**, porque APIM Consumption no puede entrar a una
  red privada. Alguien que conozca esa URL podría saltarse APIM. Igual necesita un JWT válido, pero
  se pierde lo que APIM agregue (p. ej. límites de peticiones).
  - Para cerrarlo hay dos opciones:
    1. APIM en un tier con red virtual (Developer o Standard v2) y las Container Apps con
       `--ingress internal`.
    2. Que APIM envíe una cabecera secreta (`set-header`) y los servicios rechacen las peticiones
       que no la traigan. Esto requiere un pequeño cambio en el código.
- **Key Vault:** los secretos podrían vivir en Azure Key Vault y referenciarse desde las Container
  Apps con identidad administrada. Es la práctica recomendada en producción.
- **Dominio propio:** opcional. Se configura en la Container App del frontend
  (`az containerapp hostname add`) y en APIM. Si lo haces, actualiza `frontend-origin` y
  `API_GATEWAY_URL`.
