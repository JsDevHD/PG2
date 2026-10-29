# -*- coding: utf-8 -*-

"""

Evaluación exploratoria de usabilidad con agentes de IA («usuarios simulados»)

sobre el Sistema de Seguimiento de Proyectos Gráficos desplegado en Azure.



Herramienta: Browser Use con un modelo GPT desplegado en Azure AI Foundry.



Instalación (Python 3.11 o superior):

    python -m pip install --upgrade browser-use python-dotenv

    Si la primera ejecución pide instalar un navegador, ejecuta el comando que indique.



Crea un archivo .env junto a este script. El endpoint puede ser de dos tipos:

    # Opción A, API v1: el «Target URI» de Foundry, hasta /openai/v1 (no hace falta api-version)
    AZURE_OPENAI_ENDPOINT=https://NOMBRE-RECURSO.openai.azure.com/openai/v1
    # Opción B, endpoint clásico (con api-version; para gpt-5, 2024-12-01-preview o posterior)
    # AZURE_OPENAI_ENDPOINT=https://NOMBRE-RECURSO.openai.azure.com/
    # AZURE_OPENAI_API_VERSION=2025-04-01-preview

    AZURE_OPENAI_API_KEY=tu_clave
    MODELO=nombre-del-despliegue        # p. ej. gpt-5-mini (también se acepta AZURE_DEPLOYMENT)
    CLAVE_CUENTAS=define_una_clave_de_prueba

Antes de la evaluación, prueba la conexión (una sola pregunta, sin abrir el navegador):

    python evaluacion_ia_usabilidad_foundry.py --probar



Pon en la misma carpeta una imagen de prueba llamada muestra_version.png (menos de 20 MB).



Uso:

    python evaluacion_ia_usabilidad_foundry.py                        # escenario completo (8 personas)

    python evaluacion_ia_usabilidad_foundry.py --solo D1              # solo la docente (fase de creación)

    python evaluacion_ia_usabilidad_foundry.py --solo E1 --codigo XXXXXX   # un estudiante con un código de curso



Resultados: carpeta resultados_ia_<fecha>/ con resultados.json, resumen.csv y problemas.csv.

"""

import argparse

import asyncio

import csv

import datetime

import json

import os

import re

from pathlib import Path



from typing import Literal

from dotenv import load_dotenv
from pydantic import BaseModel, Field, ValidationError

from browser_use import Agent
from browser_use.llm import ChatAzureOpenAI, ChatOpenAI



# El .env se busca junto al script, no en la carpeta desde donde se ejecuta.
load_dotenv(Path(__file__).with_name(".env"))



URL = "https://frontend.yellowsand-87b574b4.westus.azurecontainerapps.io"

# Nombre del DESPLIEGUE en Foundry (no el del modelo base). Se aceptan los tres nombres de variable.
MODELO = os.getenv("MODELO") or os.getenv("AZURE_DEPLOYMENT") or os.getenv("AZURE_OPENAI_DEPLOYMENT")
AZURE_ENDPOINT = (os.getenv("AZURE_OPENAI_ENDPOINT") or "").strip()
AZURE_API_KEY = (os.getenv("AZURE_OPENAI_API_KEY") or os.getenv("AZURE_OPENAI_KEY") or "").strip()
# Solo para el endpoint clásico (…/openai/deployments/…). gpt-5 necesita 2024-12-01-preview o posterior.
AZURE_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION") or "2025-04-01-preview"

CLAVE = os.getenv("CLAVE_CUENTAS", "PruebaIA2026!")

ARCHIVO = Path(__file__).with_name("muestra_version.png").resolve()

SELLO = datetime.datetime.now().strftime("%m%d%H%M")

SALIDA = Path(__file__).with_name(f"resultados_ia_{SELLO}")

# Con una acción por paso (ver correr) cada formulario toma varios pasos: 80 da margen de sobra.
MAX_PASOS = 80

# Una acción por paso, como una persona que mira la pantalla después de cada clic. Con lotes de
# acciones, browser-use solo corta el lote si cambia la URL: el agente marcaba «Por grupos» y
# pulsaba «Crear proyecto» en el mismo paso, sin ver los campos de grupo que aparecen al elegirlo,
# y luego reportaba que esos campos no existían (un falso hallazgo de usabilidad).
ACCIONES_POR_PASO = 1

INSTRUCCION_SISTEMA = (
    "Antes de enviar un formulario, revisa todos sus campos visibles y desplázate hasta el final: "
    "elegir una opción (un botón de radio, una tarjeta o un selector) puede mostrar campos nuevos. "
    "Si después de crear algo el resultado no coincide con lo pedido, busca la forma de corregirlo "
    "en la interfaz (por ejemplo, una acción «Editar») antes de darlo por terminado."
)



# Respuesta final estructurada: browser-use obliga al agente a entregarla con este esquema, en vez
# de confiar en que escriba el JSON a mano (antes llegaba texto y el código del curso se perdía).

class Tarea(BaseModel):
    tarea: str
    completada: bool
    observacion: str


class Problema(BaseModel):
    descripcion: str
    gravedad: Literal["alta", "media", "baja"]
    pantalla: str


class ResultadoPersona(BaseModel):
    tareas: list[Tarea]
    problemas: list[Problema]
    sus: list[int] = Field(description="Exactamente 10 enteros de 1 a 5, en el orden de las preguntas")
    comentario_final: str


class ResultadoDocente(ResultadoPersona):
    codigo_curso: str = Field(description="Código de matrícula del curso creado, tal como lo muestra la interfaz")



SUS_ITEMS = [

    "Creo que me gustaría usar este sistema con frecuencia.",

    "Encontré el sistema innecesariamente complejo.",

    "Pensé que el sistema era fácil de usar.",

    "Creo que necesitaría el apoyo de una persona técnica para poder usar este sistema.",

    "Encontré que las diversas funciones del sistema estaban bien integradas.",

    "Pensé que había demasiada inconsistencia en el sistema.",

    "Imagino que la mayoría de las personas aprendería a usar este sistema muy rápidamente.",

    "Encontré el sistema muy engorroso de usar.",

    "Me sentí muy seguro/a usando el sistema.",

    "Necesité aprender muchas cosas antes de poder empezar a usar el sistema.",

]



PERSONAS = {

    "D1": {"rol": "docente", "perfil": "Docente de diseño gráfico de 45 años. Usa Google Classroom y Drive, da la retroalimentación de forma oral y tiene poca paciencia con herramientas complejas."},

    "E1": {"rol": "estudiante", "perfil": "Estudiante de 4.º semestre. Usa casi siempre el celular y tiene poca experiencia con plataformas académicas."},

    "E2": {"rol": "estudiante", "perfil": "Estudiante de 8.º semestre, muy organizada, que guarda todas las versiones de sus trabajos."},

    "E3": {"rol": "estudiante", "perfil": "Estudiante de 5.º semestre, distraído, que suele entregar a última hora."},

    "E4": {"rol": "estudiante", "perfil": "Estudiante de 9.º semestre, hábil con la tecnología e impaciente con interfaces lentas."},

    "E5": {"rol": "estudiante", "perfil": "Estudiante de 6.º semestre, inseguro con la tecnología, que lee todo antes de hacer clic."},

    "E6": {"rol": "estudiante", "perfil": "Estudiante de 7.º semestre que prefiere el trabajo en equipo y quiere organizar su grupo."},

    "E7": {"rol": "estudiante", "perfil": "Estudiante de 4.º semestre, muy visual, que se guía más por íconos que por textos."},

}



def correo(pid):

    return f"ia.{pid.lower()}.{SELLO}@udi.edu.co"



TAREAS_D1_A = (

    "1) Crea una cuenta como docente con el correo {correo} y la contraseña {clave}. "

    "2) Crea un curso llamado «Diseño Editorial – prueba IA {sello}». "

    "3) Dentro del curso, crea un proyecto por grupos llamado «Campaña cultural», con grupos de 2 a 3 integrantes, "

    "calificación grupal y una fecha límite para formar grupos dentro de 7 días. "

    "4) Anota el código de matrícula del curso."

)

TAREAS_E = (

    "1) Crea una cuenta como estudiante con el correo {correo} y la contraseña {clave}. "

    "2) Únete al curso con el código {codigo}. "

    "3) En el proyecto «Campaña cultural», forma un grupo nuevo o únete a uno que tenga cupo. "

    "4) Sube una versión de tu trabajo usando el archivo de imagen que tienes disponible, con una descripción breve. "

    "5) Revisa el historial de versiones del proyecto. "

    "6) Genera tu portafolio académico en PDF."

)

TAREAS_D1_B = (

    "1) Inicia sesión con el correo {correo} y la contraseña {clave}. "

    "2) En el curso «Diseño Editorial – prueba IA {sello}», revisa el progreso de los estudiantes. "

    "3) Deja un comentario con una calificación parcial en la versión más reciente de uno de los grupos. "

    "4) Asigna la calificación final a ese grupo. "

    "5) Crea un proyecto nuevo llamado «Borrador» y ocúltalo a los estudiantes."

)



FORMATO = (

    '{"tareas": [{"tarea": "texto", "completada": true, "observacion": "texto"}], '

    '"problemas": [{"descripcion": "texto", "gravedad": "alta|media|baja", "pantalla": "texto"}], '

    '"sus": [10 enteros de 1 a 5], "comentario_final": "texto"%s}'

)



PLANTILLA = """Eres un usuario simulado en una prueba de usabilidad.

Persona: {perfil}

Sistema: {url}

Hoy es {hoy}. Úsalo para las fechas relativas («dentro de 7 días»).

Úsalo solo a través de la interfaz, como lo haría esa persona: no escribas direcciones internas,

no uses herramientas de desarrollador y no modifiques información de otras personas.

Si algo te resulta confuso, anótalo. Si una tarea no se puede completar en un tiempo razonable,

abandónala, explica por qué y continúa con la siguiente.



Tareas:

{tareas}



Al terminar, responde el cuestionario SUS desde el punto de vista de la persona

(1 = totalmente en desacuerdo, 5 = totalmente de acuerdo):

{items}



Tu respuesta final debe ser SOLO un objeto JSON con este formato:

{formato}

"""



def extraer_json(texto):

    if not texto:

        return {}

    ini, fin = texto.find("{"), texto.rfind("}")

    if ini == -1 or fin <= ini:

        return {}

    try:

        return json.loads(texto[ini:fin + 1])

    except json.JSONDecodeError:

        limpio = re.sub(r",\s*([}\]])", r"\1", texto[ini:fin + 1])

        try:

            return json.loads(limpio)

        except json.JSONDecodeError:

            return {}



def puntaje_sus(respuestas):

    if not isinstance(respuestas, list) or len(respuestas) != 10:

        return None

    try:

        r = [int(x) for x in respuestas]

    except (TypeError, ValueError):

        return None

    if any(x < 1 or x > 5 for x in r):

        return None

    total = sum((r[i] - 1) if i % 2 == 0 else (5 - r[i]) for i in range(10))

    return total * 2.5



def es_api_v1():

    return "/openai/v1" in AZURE_ENDPOINT



def crear_llm():

    """Cliente del modelo según el tipo de endpoint que haya en AZURE_OPENAI_ENDPOINT.

    - API v1 de Azure (https://<recurso>.openai.azure.com/openai/v1, el «Target URI» de Foundry):
      cliente OpenAI normal con base_url, sin api-version.
    - Endpoint clásico (https://<recurso>.openai.azure.com/): cliente Azure, que arma la ruta
      /openai/deployments/<despliegue>/chat/completions?api-version=…

    Darle el endpoint v1 al cliente Azure produce 404 «Resource not found», porque la ruta queda
    …/openai/v1/openai/deployments/… (era el error original).
    """

    faltan = [nombre for nombre, valor in (
        ("AZURE_OPENAI_ENDPOINT", AZURE_ENDPOINT),
        ("AZURE_OPENAI_API_KEY", AZURE_API_KEY),
        ("MODELO (o AZURE_DEPLOYMENT)", MODELO),
    ) if not valor]
    if faltan:
        raise SystemExit("Falta en el archivo .env: " + ", ".join(faltan))

    if es_api_v1():
        base_url = AZURE_ENDPOINT.split("/openai/v1")[0] + "/openai/v1/"
        return ChatOpenAI(model=MODELO, api_key=AZURE_API_KEY, base_url=base_url)

    # Clásico: el cliente agrega /openai/… por su cuenta, así que se quita si venía en el endpoint.
    raiz = AZURE_ENDPOINT.rstrip("/").split("/openai")[0]
    return ChatAzureOpenAI(
        model=MODELO, azure_endpoint=raiz, api_key=AZURE_API_KEY, api_version=AZURE_API_VERSION,
    )



async def probar_conexion():

    """Una sola pregunta al modelo, sin abrir el navegador: confirma endpoint, clave y despliegue."""

    from browser_use.llm.exceptions import ModelProviderError
    from browser_use.llm.messages import UserMessage

    llm = crear_llm()
    tipo = "API v1 (base_url, sin api-version)" if es_api_v1() else f"clásico (api-version {AZURE_API_VERSION})"
    print(f"Endpoint:   {AZURE_ENDPOINT}  ->  {tipo}")
    print(f"Despliegue: {MODELO}")
    try:
        respuesta = await llm.ainvoke([UserMessage(content="Responde solo con la palabra OK.")])
    except ModelProviderError as e:
        pistas = {
            401: "La clave no corresponde a este recurso. Cópiala de Foundry > tu despliegue > Clave.",
            404: "La ruta o el despliegue no existen. Revisa que MODELO sea el NOMBRE DEL DESPLIEGUE "
                 "en Foundry y que AZURE_OPENAI_ENDPOINT sea el de ese mismo recurso.",
            429: "Límite de uso del despliegue: espera un minuto o sube la cuota (TPM) en Foundry.",
        }
        print(f"\nFALLÓ ({e.status_code}): {e.message}")
        if e.status_code in pistas:
            print("Pista:", pistas[e.status_code])
        raise SystemExit(1) from None
    print(f"\nConexión correcta. El modelo respondió: {respuesta.completion!r}")



MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]


def hoy_en_texto():

    """El modelo no sabe la fecha de hoy: sin ella juzgó «lejana» una fecha que era justo +7 días."""

    d = datetime.date.today()
    return f"{d.day} de {MESES[d.month - 1]} de {d.year} ({d.isoformat()})"



async def calentar_servicios():

    """Despierta el frontend y los cuatro microservicios antes de cada persona.

    En Azure corren con réplicas mínimas en 0: tras unos minutos sin uso, la primera petición tarda
    unos 13 s. El agente no esperaba, reintentaba y luego lo reportaba como fallo del sistema.
    Sin token, cada servicio responde 401: basta para saber que está despierto.
    """

    import httpx

    async with httpx.AsyncClient(timeout=90) as http:
        config = (await http.get(f"{URL}/config.js")).text
        hallado = re.search(r'API_GATEWAY_URL:\s*"([^"]+)"', config)
        api = (hallado.group(1) if hallado else URL).rstrip("/") + "/api/v1"
        vacio = "0" * 24
        rutas = {
            "frontend": URL,
            "auth": f"{api}/auth/me",
            "projects": f"{api}/courses",
            "feedback": f"{api}/projects/{vacio}/feedback",
            "export": f"{api}/projects/{vacio}/export",
        }
        inicio = datetime.datetime.now()
        respuestas = await asyncio.gather(
            *(http.get(url) for url in rutas.values()), return_exceptions=True
        )
    segundos = (datetime.datetime.now() - inicio).total_seconds()
    estado = ", ".join(
        f"{nombre} {r.status_code if hasattr(r, 'status_code') else 'sin respuesta'}"
        for nombre, r in zip(rutas, respuestas)
    )
    print(f"Servicios despiertos en {segundos:.1f} s ({estado})")



async def correr(pid, fase, tareas, pedir_codigo=False):

    p = PERSONAS[pid]

    extra = ', "codigo_curso": "texto"' if pedir_codigo else ""

    tarea = PLANTILLA.format(

        perfil=p["perfil"], url=URL, tareas=tareas, hoy=hoy_en_texto(),

        items="\n".join(f"{i + 1}. {t}" for i, t in enumerate(SUS_ITEMS)),

        formato=FORMATO % extra,

    )

    kwargs = {
        "task": tarea,
        "llm": crear_llm(),
        "output_model_schema": ResultadoDocente if pedir_codigo else ResultadoPersona,
        "max_actions_per_step": ACCIONES_POR_PASO,
        "extend_system_message": INSTRUCCION_SISTEMA,
    }

    if ARCHIVO.exists():

        kwargs["available_file_paths"] = [str(ARCHIVO)]

    try:

        agente = Agent(**kwargs)

    except TypeError:

        kwargs.pop("available_file_paths", None)

        agente = Agent(**kwargs)

    print(f"\n=== {pid} ({p['rol']}) · fase {fase} ===")

    await calentar_servicios()

    historia = await agente.run(max_steps=MAX_PASOS)

    texto = historia.final_result() or ""

    try:
        estructurado = historia.structured_output
    except ValidationError:
        estructurado = None
    datos = estructurado.model_dump() if estructurado else extraer_json(texto)

    # Último recurso para no frenar a los estudiantes: el código (6 letras/números) en el texto.
    if pedir_codigo and not datos.get("codigo_curso"):
        # Solo «código» ignora mayúsculas: el código va en mayúsculas, así no se confunde con
        # palabras de 6 letras de la frase («creado», «visto»…).
        hallado = re.search(r"(?i:c[oó]digo)\D{0,40}?\b([A-Z0-9]{6})\b", texto)
        if hallado:
            datos["codigo_curso"] = hallado.group(1)

    datos.update({

        "persona": pid, "rol": p["rol"], "fase": fase, "perfil": p["perfil"],

        "pasos": len(historia.history), "sus_simulado": puntaje_sus(datos.get("sus")),

    })

    if not datos.get("tareas"):

        datos["respuesta_cruda"] = texto

    return datos



def guardar(resultados):

    SALIDA.mkdir(exist_ok=True)

    (SALIDA / "resultados.json").write_text(json.dumps(resultados, ensure_ascii=False, indent=2), encoding="utf-8")

    with open(SALIDA / "resumen.csv", "w", newline="", encoding="utf-8-sig") as f:

        w = csv.writer(f, delimiter=";")

        w.writerow(["persona", "rol", "fase", "tareas_completadas", "tareas_totales", "pasos", "sus_simulado", "problemas"])

        for r in resultados:

            t = r.get("tareas") or []

            w.writerow([r["persona"], r["rol"], r["fase"], sum(1 for x in t if x.get("completada")), len(t),

                        r.get("pasos"), r.get("sus_simulado"), len(r.get("problemas") or [])])

    with open(SALIDA / "problemas.csv", "w", newline="", encoding="utf-8-sig") as f:

        w = csv.writer(f, delimiter=";")

        w.writerow(["persona", "fase", "gravedad", "pantalla", "descripcion"])

        for r in resultados:

            for pr in r.get("problemas") or []:

                w.writerow([r["persona"], r["fase"], pr.get("gravedad"), pr.get("pantalla"), pr.get("descripcion")])

    print(f"\nResultados guardados en {SALIDA}")



async def main(solo=None, codigo=None):

    resultados = []

    if solo in (None, "D1"):

        r = await correr("D1", "A", TAREAS_D1_A.format(correo=correo("D1"), clave=CLAVE, sello=SELLO), pedir_codigo=True)

        resultados.append(r)

        codigo = codigo or r.get("codigo_curso")

        print(f"Código del curso reportado por la docente: {codigo}")

    estudiantes = [k for k in PERSONAS if k.startswith("E")]

    if solo and solo.startswith("E"):

        estudiantes = [solo]

    if solo is None or solo.startswith("E"):

        if not codigo:

            raise SystemExit("Falta el código del curso: corre primero D1 o usa --codigo.")

        for pid in estudiantes:

            resultados.append(await correr(pid, "B", TAREAS_E.format(correo=correo(pid), clave=CLAVE, codigo=codigo)))

    if solo is None:

        resultados.append(await correr("D1", "C", TAREAS_D1_B.format(correo=correo("D1"), clave=CLAVE, sello=SELLO)))

    guardar(resultados)



if __name__ == "__main__":

    ap = argparse.ArgumentParser(description="Evaluación de usabilidad con agentes de IA")

    ap.add_argument("--solo", help="ID de una persona (D1, E1…E7)")

    ap.add_argument("--codigo", help="Código de matrícula de un curso ya creado")

    ap.add_argument("--probar", action="store_true", help="Solo prueba la conexión con el modelo")

    a = ap.parse_args()

    if a.probar:

        asyncio.run(probar_conexion())

    else:

        asyncio.run(main(a.solo, a.codigo))
