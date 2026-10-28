# Informe del despliegue en Azure

**Sistema de Seguimiento de Proyectos Gráficos.** Proyecto de grado, UDI.

Este informe reúne lo que pasó al llevar el sistema a Azure:
- **qué resultó**: recursos, URLs, pruebas, tiempos y costos;
- **qué problemas aparecieron**, por qué y cómo se resolvieron;
- **por qué se usó cada comando** con esos parámetros;
- **qué cambiar** para que otra persona lo monte en su propia cuenta de Azure.

| Documento | Para qué sirve |
|---|---|
| [`DESPLIEGUE_AZURE.md`](DESPLIEGUE_AZURE.md) | Guía paso a paso para desplegar desde cero, con comandos listos para copiar |
| [`DOCUMENTACION_TECNICA.md`](DOCUMENTACION_TECNICA.md), sección 19 | Registro técnico: cada comando ejecutado con su salida real |
| **Este informe** | Resultados, problemas y lecciones, y cómo adaptar el despliegue a otro ambiente |

> Las fechas y horas son de Colombia (UTC−5). En este informe no aparece ningún secreto. Las
> contraseñas, claves y cadenas de conexión viven solo en `infra/azure/secretos.sh`, que está en
> `.gitignore`.

---

## 1. Resumen

| | |
|---|---|
| **Estado** | Desplegado, verificado de punta a punta y en funcionamiento |
| **Aplicación** | https://frontend.yellowsand-87b574b4.westus.azurecontainerapps.io |
| **API (gateway)** | https://apim-graficos-js2026.azure-api.net/api/v1/... |
| **Cuenta** | Cuenta gratuita de Azure (crédito de US$200 por 30 días), suscripción *Azure subscription 1* |
| **Despliegue inicial** | 16 de octubre de 2026, 21:11–22:10. Los recursos se crearon entre 21:41 y 21:51 |
| **Primera actualización** | 17 de octubre de 2026, 00:20: frontend `v2`, mensaje del registro sin rol |
| **Segunda actualización** | 28 de octubre de 2026, 00:27: frontend `v3`, rediseño de la calificación final |
| **Commits** | `16a332e` (despliegue inicial y `v2`), `bb8ec87` (código de `v3`) y `8a26b6e` (su documentación), en `main`, publicados en github.com/JsDevHD/PG2 |
| **Tiempo de creación de recursos** | ≈ 7 minutos de Azure. El resto del tiempo fue verificación |
| **Costo estimado** | ≈ US$5–6 al mes con réplicas en 0 (casi todo es el registro de contenedores) |
| **Problemas encontrados** | 17, todos resueltos (sección 4) |

---

## 2. Cronología

| Fecha | Qué pasó |
|---|---|
| 4 oct | Primer commit del repositorio (`inicial`) |
| 5 oct | En local, `docker` no se reconocía en PowerShell: Docker Desktop no estaba instalado o no estaba en el PATH (problema P1) |
| 10 oct, 19:05 | Instalación de Azure CLI: `winget` no existía en ese Windows 10 (P2) |
| 10 oct, 19:10 | Los comandos de la guía se pegaron en PowerShell en vez de Git Bash (P3). Se detectó `SUFIJO=Js2026` con mayúscula (P4) |
| 10 oct, 19:19 | En el portal, elección de la API de base de datos: **Azure DocumentDB (con compatibilidad con MongoDB)** (P5) |
| 10 oct, 19:20 | Se creó API Management, todavía con el sufijo en mayúscula: `apim-graficos-Js2026` |
| 10 oct, 19:24–19:29 | En el portal se configuró el firewall (19:24) y se creó el clúster `mongo-graficos-js2026` (19:29), Free tier, en **westus** |
| 10 oct, 20:21 | `az storage account create` falló con `SubscriptionNotFound` y el nombre en mayúscula (P4, P6). Quedó un `STORAGE_CONN=''` vacío en los secretos (P7) |
| 16 oct, 21:11 | Retoma del despliegue. La sesión de `az` había expirado (`AADSTS530035`, P8). Mientras se esperaba el inicio de sesión, se construyeron las cinco imágenes en local |
| 16 oct, 21:15 | Se encontró la cadena real de Mongo pegada en la guía (P10). Se movió a `secretos.sh` |
| 16 oct, 21:20–21:35 | La ventana de inicio de sesión no aparecía (P9). Se usó el código de dispositivo, y la sesión quedó lista |
| 16 oct, ≈21:36 | Se detectó que la base estaba en westus y el plan decía eastus (P11). Se separaron `LOC` y `APIM_LOC` |
| 16 oct, ≈21:38 | Firewall de la base actualizado con la IP del equipo (P12). La prueba de índices pasó |
| 16 oct, 21:41–21:43 | Storage (21:41), registro e imágenes subidas (21:41), Log Analytics (21:42) |
| 16 oct, 21:43–21:46 | Entorno de Container Apps |
| 16 oct, 21:46–21:50 | auth (21:46), projects (21:47), feedback (21:48), export (21:48) y frontend (21:50) |
| 16 oct, ≈21:51 | API Management: API, operaciones, named values y política. Error de codificación al subir la política (P13, P14) |
| 16 oct, 21:52–22:10 | Verificación del gateway, datos demo, prueba de tamaño, recorrido en el navegador, PDF y limpieza (P15, P16) |
| 17 oct, 00:14 | El usuario reportó el mensaje en inglés al registrarse sin rol (P17). Arreglo y prueba nueva |
| 17 oct, 00:20 | Frontend `v2` en Azure, verificado en vivo. Commit `16a332e` y push a `main` |
| 28 oct, 00:27 | Frontend `v3` en Azure (revisión `frontend--0000002`): rediseño de la calificación final (sección 10.3.2 de la documentación técnica). Build de 27 s y actualización de 21 s |
| 28 oct, 00:30 | Commits `bb8ec87` (código del frontend y 3 pruebas actualizadas) y `8a26b6e` (documentación, manual y capturas) |
| 28 oct, 06:45 | Push a `main` (`16a332e..8a26b6e`). Se comprobó que la imagen `v3` publicada sale del mismo código que `bb8ec87` |

---

## 3. Resultados

### 3.1 Qué quedó desplegado

Todos los recursos están en el grupo `rg-graficos-udi`.

| Recurso | Tipo | Región | Tamaño / SKU | Versión |
|---|---|---|---|---|
| `frontend` | Container App | westus | 0,25 vCPU · 0,5 GiB · 0–2 réplicas | `v3` |
| `auth-service` | Container App | westus | 0,25 vCPU · 0,5 GiB · 0–2 réplicas | `v1` |
| `projects-service` | Container App | westus | 0,5 vCPU · 1 GiB · 0–2 réplicas | `v1` |
| `feedback-service` | Container App | westus | 0,25 vCPU · 0,5 GiB · 0–2 réplicas | `v1` |
| `export-service` | Container App | westus | 0,5 vCPU · 1 GiB · 0–2 réplicas | `v1` |
| `cae-graficos` | Entorno de Container Apps | westus | Consumo | |
| `mongo-graficos-js2026` | Azure DocumentDB | westus | Free tier · MongoDB 8.0 · 32 GB | |
| `stgraficosjs2026` | Storage Account | westus | Standard_LRS · TLS 1.2 · privado | |
| `acrgraficosjs2026` | Container Registry | westus | Basic | |
| `log-graficos` | Log Analytics | westus | 30 días · tope de 0,5 GB/día | |
| `apim-graficos-Js2026` | API Management | eastus | Consumption | |

### 3.2 Verificaciones

| Prueba | Resultado |
|---|---|
| Prueba de índices únicos parciales y multikey sobre DocumentDB Free | **OK**: la base rechaza los duplicados con el error 11000 |
| `/health` de los cuatro servicios | **OK**: `{"status":"ok"}` en los cuatro |
| Logs de arranque | Auth, Projects y Feedback registran «Índices … verificados». Ningún error |
| `config.js` y CSP del frontend | Apuntan a la URL de APIM |
| `GET /api/v1/auth/me` sin token, por APIM | **401**: la ruta llega a Auth |
| Ruta inexistente por APIM | **404** «Ruta no encontrada en el API Gateway» |
| Preflight CORS desde el frontend | **200** con `Access-Control-Allow-Origin` = frontend |
| Preflight CORS desde otro origen | Sin `Access-Control-Allow-Origin`: el navegador lo bloquea |
| Datos demo con contraseña privada | Login **200**. Con la contraseña del repositorio, **401** |
| Subida de 18,0 MB por APIM Consumption | **201** en 3,4 s. La descarga llegó **idéntica byte a byte** |
| Subida de 21,9 MB | **422** de la aplicación (límite de 20 MB). APIM no la cortó |
| Recorrido en Chrome (docente, estudiante y modo oscuro) | Sin errores de consola, CORS, CSP ni HTTP ≥ 400 |
| PDF del proyecto y portafolio académico | **200**. 4 y 5 páginas, con 3 imágenes de Blob y los comentarios |
| Registro sin rol, frontend `v2` en vivo | Mensaje en español. Ninguna petición a `/auth/register` |
| Pruebas automáticas del frontend | **76/76**, más Biome y el build de producción sin errores |
| Calificación final rediseñada, frontend `v3` | 52 comprobaciones con Playwright en local (escritorio, 360 px, modo oscuro, 409 y error de red). En Azure, los textos nuevos están en el JavaScript publicado |

Las capturas de la aplicación en Azure están en [`img/azure/`](img/azure/) (sección 19.7 de la
documentación técnica).

### 3.3 Tiempos medidos

| Paso | Duración |
|---|---|
| Crear el Storage | 26 s |
| Crear el registro | 10 s |
| Subir las 5 imágenes (≈ 1,3 GB sin comprimir) | 28 s |
| Crear Log Analytics | 36 s |
| Crear el entorno de Container Apps | **138 s** (el más lento) |
| Crear auth / projects / feedback / export / frontend | 45 / 29 / 23 / 17 / 17 s |
| Crear la API y las 5 operaciones en APIM | 14 s |
| Cargar los datos demo | 15 s |
| **Total de creación en Azure** | **≈ 6,6 minutos** |
| Primer `/health` con réplicas en 0 (arranque en frío) | 13 s |
| `GET /courses` en caliente: por APIM / directo al servicio | 0,42–0,48 s / 0,48–0,56 s |
| Build y despliegue del frontend `v2` | 31 s de build + 20 s de actualización |
| Build y despliegue del frontend `v3` | 27 s de build + 21 s de actualización |

Pasar por APIM, que está en eastus mientras los servicios están en westus, **no añadió una
latencia apreciable**.

### 3.4 Costos

| Recurso | Al mes |
|---|---|
| Container Apps, réplicas en 0 | US$0 (lo cubre la cuota gratuita) |
| Container Registry Basic | ≈ US$5 |
| API Management Consumption | US$0 hasta un millón de llamadas |
| DocumentDB Free tier | US$0 |
| Storage | Centavos |
| Log Analytics | US$0 (dentro de los 5 GB gratuitos) |
| **Total** | **≈ US$5–6** |
| Réplicas en 1 en las cinco apps | +≈ US$1,4 al día (≈ US$40 al mes) |

> El crédito de la cuenta gratuita **vence a los 30 días**. Después hay que pasar la suscripción a
> pago por uso, o Azure deshabilita los recursos.

---

## 4. Problemas, causas y soluciones

Cada problema indica qué se vio, por qué pasó, cómo se resolvió y qué hacer para que no se repita
en otro ambiente.

### Preparación del equipo

**P1. `docker` no se reconoce en PowerShell**
- **Síntoma:** `docker : El término 'docker' no se reconoce como nombre de un cmdlet…`
- **Causa:** Docker Desktop no estaba instalado o la terminal se abrió antes de instalarlo.
- **Solución:** instalar Docker Desktop (con WSL 2) y abrir una terminal nueva.
- **Prevención:** antes de empezar, comprobar que `docker version` muestre el *Server*. Si solo
  muestra el *Client*, Docker Desktop no está encendido.

**P2. `winget` no existe**
- **Síntoma:** `winget : El término 'winget' no se reconoce…` al instalar Azure CLI.
- **Causa:** algunos Windows 10 no traen el instalador de paquetes `winget`.
- **Solución:** el instalador `.msi` oficial (`https://aka.ms/installazurecliwindowsx64`), con
  PowerShell como administrador o con doble clic.
- **Prevención:** la guía ya ofrece las dos vías. Después de instalar, hay que cerrar y abrir las
  terminales para que reconozcan `az`.

**P3. Comandos de bash pegados en PowerShell**
- **Síntoma:** `touch`, `source` y `openssl` «no se reconocen». Además, tres comandos quedaron
  pegados en una línea (`vars.shtouch …`).
- **Causa:** la guía está escrita para **Git Bash** y se usó PowerShell.
- **Solución:** abrir Git Bash (en VS Code: flecha ⌄ junto al **+** de la terminal → *Git Bash*).
- **Prevención:** el prompt de Git Bash termina en `$`, no en `PS C:\…>`. La guía lo advierte al
  inicio. PowerShell además rompe los `&` y `=` de las cadenas de conexión.

### Nombres, cuenta y sesión

**P4. Sufijo con mayúscula (`Js2026`)**
- **Síntoma:** el Storage `stgraficosJs2026` no se pudo crear.
- **Causa:** el nombre de un Storage Account solo admite **minúsculas y números**, de 3 a 24
  caracteres. APIM sí acepta mayúsculas, por eso alcanzó a crearse como `apim-graficos-Js2026`.
- **Solución:** `SUFIJO=js2026`. El APIM se dejó como estaba: los nombres de Azure no distinguen
  mayúsculas y su dominio sale en minúsculas.
- **Prevención:** `SUFIJO` en minúsculas y números, máximo 8. Comprobar antes con
  `az storage account check-name` y `az acr check-name`.

**P5. ¿Cuál API de Cosmos DB elegir?**
- **Síntoma:** el portal ofrecía *Azure Cosmos DB for NoSQL* y *Azure DocumentDB (con
  compatibilidad con MongoDB)*.
- **Causa:** en 2025 Microsoft renombró *Cosmos DB for MongoDB vCore* a **Azure DocumentDB**.
- **Solución:** **Azure DocumentDB**. Los servicios usan el driver de MongoDB (Motor) y funcionan
  sin cambiar código. *NoSQL* obligaría a reescribir el acceso a datos de los cuatro servicios.
- **Prevención:** elegir el modelo **vCore (clúster)**, no RU, y el nivel **Free tier**.

**P6. `SubscriptionNotFound` al crear el Storage**
- **Síntoma:** `(SubscriptionNotFound) Subscription <id> was not found.` y después
  `ResourceNotFound` al pedir la cadena de conexión.
- **Causa más probable:** suscripción recién creada. Se crearon recursos antes de que el
  proveedor `Microsoft.Storage` terminara de registrarse. Con los proveedores en `Registered`, el
  mismo comando funcionó el 16 de octubre.
- **Solución:** `az provider register --namespace <p> --wait` para cada proveedor, y comprobar que
  todos digan `Registered`.
- **Prevención:** la guía ya usa `--wait` y verifica los seis proveedores (paso 3).

**P7. Una cadena de conexión vacía en los secretos**
- **Síntoma:** `secretos.sh` tenía `STORAGE_CONN=''`.
- **Causa:** el bloque de la guía guardaba la cadena aunque el Storage no se hubiera creado.
- **Solución:** borrar la línea y repetir el paso.
- **Prevención:** guardar solo si hay valor: `[ -n "$STORAGE_CONN" ] && echo … >> "$SECRETOS"`.

**P8. `AADSTS530035: Access has been blocked by security defaults`**
- **Síntoma:** todos los comandos `az` fallaban, aunque `az account show` mostraba la
  suscripción.
- **Causa:** la sesión guardada de `az` expiró. Los *security defaults* de Entra ID exigen volver
  a autenticarse con MFA.
- **Solución:** iniciar sesión otra vez: `az login --tenant <id-del-tenant>` o
  `az login --use-device-code --tenant <id>`.
- **Prevención:** si se retoma el despliegue días después, empezar con
  `az group list -o table`. Si falla, iniciar sesión antes de cualquier otro paso.

**P9. `az login` se queda esperando**
- **Síntoma:** el comando solo muestra *Select the account you want to log in with* y no avanza.
- **Causa:** en Windows, `az` usa el agente de cuentas del sistema (WAM). La ventana para elegir
  la cuenta se abre **detrás** de las demás.
- **Solución:** buscarla en la barra de tareas, o usar `--use-device-code`: se abre
  https://login.microsoft.com/device y se escribe el código que muestra la terminal.
- **Prevención:** en equipos donde la ventana no aparece, usar el código de dispositivo, o
  `az config set core.enable_broker_on_windows=false` para que abra el navegador normal.

### Seguridad y configuración

**P10. La cadena real de Mongo, con contraseña, estaba pegada en la guía**
- **Síntoma:** `DESPLIEGUE_AZURE.md` mostraba el usuario y la contraseña del clúster en el
  ejemplo de la cadena de conexión.
- **Causa:** al crear el clúster se copió la cadena real sobre el ejemplo.
- **Solución:**
  1. Se movió a `MONGODB_URI` en `secretos.sh`, que está en `.gitignore`.
  2. La guía volvió a tener `<usuario>:<password>`.
  3. Antes del commit se buscaron en todos los archivos los valores reales de cada secreto: cero
     coincidencias.
  4. El archivo nunca entró a git.
- **Prevención:** las credenciales van **solo** en `secretos.sh`. Si una contraseña llega a un
  commit publicado, hay que **cambiarla** en Azure, no basta con borrarla del archivo.

**P11. La base quedó en otra región que el resto del plan**
- **Síntoma:** el clúster estaba en `westus`, pero `vars.sh` decía `LOC=eastus`, y APIM ya existía
  en eastus.
- **Causa:** la región del clúster se eligió en el portal.
- **Solución:** `LOC=westus` para todo lo que habla con Mongo (servicios, Storage, registro y
  logs) y una variable nueva, `APIM_LOC=eastus`. Cada petición hace varias consultas a Mongo, así
  que los servicios deben estar en la región de la base. APIM solo añade un salto por petición, y
  medido no se nota.
- **Prevención:** **crear primero la base** y usar su región como `LOC`.

**P12. `mongosh` desde el equipo no llegaba a la base**
- **Síntoma:** la prueba de índices desde el PC necesitaba acceso, y la regla del firewall tenía la
  IP del 10 de octubre.
- **Causa:** la IP pública de un hogar cambia con el tiempo.
- **Solución:** agregar la IP actual con `az rest` (regla `ClienteDespliegue`) y **borrarla al
  terminar**.
- **Prevención:** las Container Apps no necesitan esa regla: entran por *Permitir servicios de
  Azure*. Solo hace falta para administrar la base desde el PC.

**P13. `'charmap' codec can't encode character` al subir la política de APIM**
- **Síntoma:** `az rest --method put …` terminó con un *traceback* de Python
  (`UnicodeEncodeError`, carácter BOM U+FEFF).
- **Causa:** APIM responde con un BOM UTF-8, y `az` en Windows imprime con la página de códigos
  cp1252. **La política sí se guardó**: el error ocurre al imprimir la respuesta.
- **Solución:** `export PYTHONIOENCODING=utf-8`, que ya está en `vars.sh`, y comprobar la política
  guardada con un `GET`.
- **Prevención:** cargar siempre `vars.sh` en cada terminal.

**P14. El `GET` de la política no devuelve JSON**
- **Síntoma:** al leer la respuesta como JSON: `Unexpected token '<', "<policies>"… is not valid
  JSON`.
- **Causa:** con `&format=rawxml`, la API devuelve el XML tal cual.
- **Solución:** guardar con `--output-file` y contar las rutas con `grep -c '<when '`. Deben ser
  9.

### Datos y pruebas

**P15. La prueba de tamaño ensució los datos demo**
- **Síntoma:** la versión de prueba de 18 MB (ruido de colores) aparecía en el historial de Ana,
  y su PDF pesaba 22,5 MB.
- **Causa:** la prueba se hizo con una cuenta demo real.
- **Solución:** se borró el documento de `versions` y su blob. No tenía retroalimentación. El
  resultado de la prueba quedó registrado.
- **Prevención:** hacer la prueba de tamaño con una cuenta y un curso creados solo para eso.

**P16. No se pudieron tomar capturas del portal de Azure**
- **Síntoma:** la extensión de Chrome para automatizar el navegador no estaba conectada en esa
  sesión.
- **Solución:** las capturas de la aplicación se tomaron con Playwright, con Chrome sin cabeza. El
  lado de la infraestructura se documentó con las salidas de `az`: inventario, estados, logs y
  respuestas.
- **Prevención:** para capturas del portal, iniciar sesión en portal.azure.com en ese Chrome y
  conectar la extensión antes de empezar.

### Aplicación

**P17. Mensaje en inglés al registrarse sin elegir rol**
- **Síntoma:** `Expected 'estudiante' | 'docente', received null`. Lo reportó el usuario después
  del despliegue.
- **Causa:** con ningún radio marcado, react-hook-form entrega `null`. `required_error` de Zod solo
  cubre `undefined`, así que salía el mensaje por defecto.
- **Solución:** el esquema usa `errorMap`, con el mensaje «Elige si te registras como estudiante
  o como docente». Se agregó una prueba de regresión y se publicó el frontend `v2`, verificado en
  vivo.
- **Prevención:** en campos de selección (radios), usar `errorMap` en vez de `required_error`.

### Avisos que se pueden ignorar

| Aviso | Por qué no importa |
|---|---|
| `WARNING: api_id is not a known attribute of class ApiContract` en `az apim api create` | Es un aviso interno de la CLI. La API se crea con el id correcto |
| `LF will be replaced by CRLF` en `git add` | `core.autocrlf=true` en Windows. Git guarda LF, y `.gitattributes` fuerza LF en los `.sh` |
| `Running ..` repetido en `az containerapp create` | Es el indicador de progreso de la CLI |
| La cadena de Storage es muy larga (≈ 440 caracteres) | Las CLI nuevas incluyen todos los endpoints (blob, file, queue, table) |

---

## 5. Por qué cada comando

| Comando | Qué hace | Por qué así |
|---|---|---|
| `export MSYS_NO_PATHCONV=1` | Desactiva la conversión de rutas de Git Bash | Si no, `--url-template "/*"` se convierte en `C:/Program Files/Git/*` |
| `export PYTHONIOENCODING=utf-8` | `az` imprime en UTF-8 | Evita el error de P13 |
| `az provider register … --wait` | Habilita cada servicio en la suscripción | Sin `--wait`, los primeros recursos fallan (P6) |
| Clúster DocumentDB **Free tier**, vCore | La base MongoDB | Gratis y compatible con el driver. Uno por suscripción |
| Prueba de índices con `mongosh` | Comprueba que la base **haga cumplir** los únicos parciales y multikey | Los grupos y las calificaciones dependen de eso. No basta con que cree el índice: hay que forzar el error 11000 |
| `docker build --platform linux/amd64` | Construye cada imagen | Container Apps corre en amd64. En un Mac con chip Apple, sin esto la imagen no arrancaría |
| `az storage account create … --allow-blob-public-access false --min-tls-version TLS1_2` | Storage para los archivos | Los archivos solo salen por la API, con autorización. TLS moderno |
| `az storage container create --name versions` | Contenedor privado | Es el que esperan Projects y Export (`AZURE_STORAGE_CONTAINER`) |
| `az acr create --sku Basic --admin-enabled true` | Registro de imágenes | Basic es el más barato. El usuario administrador es la forma más simple de que las apps descarguen |
| `az monitor log-analytics workspace create --retention-time 30 --quota 0.5` | Destino de los logs | Si no se crea, el entorno crea uno **sin tope**. Con tope, el gasto no se dispara |
| `az containerapp env create --logs-workspace-id … --logs-workspace-key …` | Red y escalado compartidos | Usa el espacio de logs con tope |
| `az containerapp create --ingress external --target-port 8000` | Cada microservicio | APIM Consumption solo llega a endpoints públicos. Los servicios escuchan en el 8000 (Dockerfile) |
| `--cpu 0.25 --memory 0.5Gi` / `--cpu 0.5 --memory 1.0Gi` | Tamaño | Container Apps exige memoria = 2 × CPU. Projects y Export llevan más porque manejan archivos de hasta 20 MB y PDF |
| `--min-replicas 0 --max-replicas 2` | Escalado | En 0 no cobra en reposo, a cambio de un arranque en frío de ~13 s |
| `--secrets "mongodb-uri=…" … --env-vars MONGODB_URI=secretref:mongodb-uri` | Configuración sensible | El valor no aparece en las variables visibles del portal ni en los logs |
| `CORS_ALLOWED_ORIGINS=[]` | CORS apagado en los servicios | Lo hace APIM. En los dos lados, la cabecera saldría duplicada y el navegador rechazaría la respuesta |
| `AUTH_SERVICE_URL=https://<fqdn de auth>` | Projects y Export piden nombres a Auth | Llamada directa entre servicios, con el mismo JWT |
| `az containerapp create -n frontend … --env-vars API_GATEWAY_URL=$APIM_URL` | El frontend | La imagen genera `/config.js` y la CSP al arrancar: la misma imagen sirve en local y en Azure |
| `az apim api create --path api/v1 --subscription-required false` | La API del gateway | La autenticación es el JWT propio, no la clave de suscripción de APIM |
| 5 operaciones `/*` (GET, POST, PATCH, DELETE, OPTIONS) | Comodines | La política decide el destino por la ruta. OPTIONS es para el preflight de CORS |
| `az apim nv create` (5 named values) | URLs de destino y origen permitido | La política (`gateway/apim-policy.xml`) es igual en cualquier ambiente. Solo cambian los named values |
| `az rest --method put …/policies/policy` | Sube la política | `az` no tiene un comando directo para esto |
| `DEMO_PASSWORD=… seed_demo.py "$APIM_URL"` | Datos demo por el gateway | Prueba el gateway de verdad. La contraseña del repositorio no sirve en Azure |
| `az containerapp update --image …:v2` | Publica un cambio | Crea una revisión nueva con el 100 % del tráfico. La anterior queda para volver atrás |

---

## 6. Cómo montarlo en otro ambiente

### 6.1 Qué cambiar sí o sí

Todo se cambia en `infra/azure/vars.sh` y en un `secretos.sh` nuevo. **El código no se toca.**

| Qué | Dónde | Regla |
|---|---|---|
| `SUFIJO` | `vars.sh` | Único en Azure, **minúsculas y números**, máximo 8. Los nombres del Storage, el registro, APIM y el clúster se construyen con él |
| `LOC` | `vars.sh` | La región donde se cree la base. Todo lo que habla con Mongo va ahí |
| `APIM_LOC` | `vars.sh` | Cualquiera. Lo ideal es la misma que `LOC` si se crea desde cero |
| `RG`, `ENV_NAME` | `vars.sh` | Libres. Cambiarlos si conviven varios ambientes en la misma suscripción |
| `JWT_SECRET_KEY` | `secretos.sh` | **Nueva**: `openssl rand -hex 32`. La misma en los cuatro servicios |
| `MONGODB_URI` | `secretos.sh` | La del clúster nuevo, con contraseña de solo letras y números |
| `STORAGE_CONN`, `ACR_USER`, `ACR_PASS` | `secretos.sh` | Las generan los pasos 5 y 6 de la guía |
| `DEMO_PASSWORD` | `secretos.sh` | Nueva. Solo si se cargan datos demo |
| Publisher email de APIM | Paso 3 de la guía | El correo del responsable |

Las URLs (`*.azurecontainerapps.io`) **no se escriben a mano**: la función `fqdn` las consulta y
los named values las toman de ahí. Por eso `frontend-origin`, `API_GATEWAY_URL` y
`AUTH_SERVICE_URL` siempre coinciden con el ambiente nuevo.

### 6.2 Según el tipo de cuenta

| Cuenta | Qué tener en cuenta |
|---|---|
| **Cuenta gratuita (US$200)** | Es la que se usó. El crédito vence a los 30 días. Crear un presupuesto con alerta |
| **Azure for Students** | Sin tarjeta, pero con **regiones limitadas**. Si aparece `RequestDisallowedByPolicy`, cambiar `LOC` (`eastus2`, `centralus` o `brazilsouth`) |
| **Pago por uso** | Sin límites. Este despliegue cuesta ≈ US$5–6 al mes con réplicas en 0 |
| **Suscripción de la universidad** | Puede tener políticas que bloqueen el acceso público, ciertas regiones o el usuario administrador del registro. Preguntar a TI y, si hace falta, usar identidad administrada (6.6) |

### 6.3 Según el sistema operativo

| | Windows (lo usado) | macOS | Linux / WSL |
|---|---|---|---|
| Terminal | **Git Bash** (no PowerShell) | Terminal (zsh o bash) | bash |
| `MSYS_NO_PATHCONV`, `PYTHONIOENCODING` | Necesarias (ya en `vars.sh`) | No hacen falta (no estorban) | No hacen falta |
| Montar una carpeta en `docker run -v` | `"$(pwd -W)/ruta:/t"` | `"$(pwd)/ruta:/t"` | `"$(pwd)/ruta:/t"` |
| Python del entorno virtual | `.venv/Scripts/python` | `.venv/bin/python` | `.venv/bin/python` |
| Instalar Azure CLI | `.msi` o `winget` | `brew install azure-cli` | `curl -sL https://aka.ms/InstallAzureCLIDeb \| sudo bash` |
| `docker build --platform linux/amd64` | Nativo | **Obligatorio** en chips Apple (emulado, más lento) | Nativo en x86 |
| Generar secretos | `openssl` de Git Bash | `openssl` | `openssl` |
| `az login` | Ventana WAM o `--use-device-code` | Abre el navegador | Abre el navegador, o `--use-device-code` sin escritorio |

### 6.4 Según la base de datos

| Situación | Qué hacer |
|---|---|
| Se puede crear **DocumentDB Free** | Lo recomendado. Correr la prueba de índices de la guía (paso 4.5) |
| Ya hay un DocumentDB Free en la suscripción (solo se permite uno) | Usar el nivel de pago más pequeño de DocumentDB, o el plan B |
| La prueba de índices falla | **Plan B: MongoDB Atlas M0** (gratis) desplegado en Azure, en la región más cercana a `LOC`. La cadena va igual en `MONGODB_URI`. Con Atlas la prueba siempre pasa |
| Se usa otra base compatible | Debe hacer cumplir índices **únicos parciales** y **únicos multikey**. Si no, los grupos y las calificaciones finales pueden duplicarse |

La cadena de DocumentDB trae `retrywrites=false`: DocumentDB no admite escrituras reintentables, y
el código no depende de ellas.

### 6.5 Sin Docker en el equipo

Las imágenes se pueden construir en Azure con ACR Tasks, sin Docker local:

```bash
az acr build -r "$ACR" -t auth-service:$TAG --platform linux/amd64 Auth_Service
# repetir para Projects_Service, Feedback_Service, Export_Service y frontend
```

Algunas suscripciones de prueba no permiten ACR Tasks. Si aparece un error de *tasks* no
permitidas, hay que construir en local o pasar a pago por uso. **No se probó en este despliegue.**

### 6.6 Hacia un ambiente de producción

Este despliegue es adecuado para el proyecto de grado. Para producción real se cambiaría:

| Hoy | En producción | Cómo |
|---|---|---|
| Microservicios con URL pública | Solo accesibles desde el gateway | APIM con red virtual (Developer, Premium o Standard v2) y `--ingress internal`, o una cabecera secreta que APIM agrega y los servicios exigen |
| Usuario administrador del registro | Identidad administrada con rol `AcrPull` | `az containerapp registry set -n <app> -g "$RG" --server "$ACR_SERVER" --identity system`, y luego `az acr update --admin-enabled false` |
| Secretos en cada Container App | **Key Vault** | Referencias de Key Vault desde las Container Apps, con identidad administrada |
| Firewall de la base con *servicios de Azure* (`0.0.0.0`) | Endpoint privado | Red virtual para el entorno de Container Apps y la base |
| Réplicas mínimas en 0 | 1 o más | `--min-replicas 1` (sin arranque en frío) |
| DocumentDB Free, sin alta disponibilidad | Nivel de pago con alta disponibilidad | Se elige al crear el clúster |
| Despliegue manual | CI/CD | GitHub Actions: build, push y `az containerapp update` en cada push a `main` |
| Dominio `*.azurecontainerapps.io` | Dominio propio | `az containerapp hostname add` y actualizar `frontend-origin` y `API_GATEWAY_URL` |

### 6.7 Varios ambientes en la misma suscripción

Por ejemplo, pruebas y demostración: un `vars.sh` por ambiente, con **otro `RG` y otro
`SUFIJO`**. Así los nombres no chocan, y borrar un ambiente es borrar su grupo:

```bash
# infra/azure/vars.pruebas.sh (copia de vars.sh)
SUFIJO=js26qa
RG=rg-graficos-pruebas
```

El clúster DocumentDB Free solo se permite uno por suscripción: el segundo ambiente usa Atlas M0 o
un nivel de pago.

### 6.8 Si cambia el código

| Cambio | Qué hacer en Azure |
|---|---|
| Código de un servicio o del frontend | Build con una etiqueta nueva (`v3`…), push y `az containerapp update --image` (sección 13 de la guía). Anotarlo en la sección 19.13 de la documentación técnica |
| **Ruta nueva** en la API | Agregarla en `gateway/nginx.conf` **y** en `gateway/apim-policy.xml`, y volver a subir la política (paso 9.3 de la guía). Si no, APIM responde 404 |
| Variable de entorno nueva | `az containerapp update -n <app> --set-env-vars CLAVE=valor`, o `az containerapp secret set` si es sensible |
| Índice nuevo en Mongo | Lo crea el servicio al arrancar. Si es único parcial o multikey, repetir la prueba de índices |

### 6.9 Lista de verificación para otra persona

1. Docker Desktop encendido, Azure CLI instalado y **Git Bash** abierto en la raíz del
   repositorio.
2. Editar `vars.sh`: `SUFIJO` en minúsculas y `LOC`.
3. Crear `secretos.sh` con `JWT_SECRET_KEY` y `DEMO_PASSWORD` nuevos.
4. `az login`, elegir la suscripción y registrar los proveedores **con `--wait`**.
5. Crear el clúster DocumentDB Free en el portal, **en `LOC`**. Guardar `MONGODB_URI` y correr la
   **prueba de índices**.
6. Seguir los pasos 5 a 9 de [`DESPLIEGUE_AZURE.md`](DESPLIEGUE_AZURE.md).
7. Verificar con el paso 10: 401, 404, CORS, la prueba de tamaño y el recorrido en el navegador.
8. Borrar la regla temporal del firewall y crear un presupuesto con alerta.
9. Guardar el registro de lo hecho, como la sección 19 de la documentación técnica.

Para apagar todo: `az group delete -n "$RG"`. Borra los datos y los archivos, y no se puede
deshacer.

---

## 7. Lecciones aprendidas

1. **Crear la base primero** y decidir las regiones a partir de ella.
2. **Registrar los proveedores con `--wait`** en suscripciones nuevas.
3. **Nombres en minúsculas** desde el principio: algunos recursos los rechazan y otros no, y
   entonces quedan inconsistentes.
4. **Probar la base antes de desplegar.** Que la base cree un índice no garantiza que lo haga
   cumplir; hay que forzar el duplicado.
5. **Los secretos, en un solo archivo ignorado por git**, y buscarlos en el repositorio antes de
   cada commit.
6. **Verificar más allá de `/health`**: los logs de arranque, CORS desde el origen real, archivos
   grandes y el recorrido en el navegador.
7. **Un error al imprimir no siempre significa que el comando falló.** Confirmar el estado
   consultando (P13).
8. **Etiquetas de imagen versionadas** (`v1`, `v2`, `v3`): cada cambio queda trazable y se puede volver
   atrás con un comando.
9. **Las pruebas de carga, con datos propios**, no con las cuentas demo.
10. **Controlar el costo desde el inicio**: réplicas en 0, tope en Log Analytics, presupuesto con
    alerta y la fecha de vencimiento del crédito.

---

## 8. Archivos relacionados

| Archivo | Contenido |
|---|---|
| `infra/azure/vars.sh` | Variables del despliegue, sin secretos |
| `infra/azure/secretos.sh` | Secretos. **No se sube** a git |
| `gateway/apim-policy.xml` | Política de APIM: rutas, CORS, timeout y 404 |
| `gateway/nginx.conf` | Mismas rutas para el gateway local |
| `scripts/seed_demo.py` | Datos demo. Lee `DEMO_PASSWORD` |
| `docs/img/azure/` | Capturas de la aplicación en Azure |
| `docs/DESPLIEGUE_AZURE.md` | Guía paso a paso |
| `docs/DOCUMENTACION_TECNICA.md` (sección 19) | Registro técnico con las salidas reales |
