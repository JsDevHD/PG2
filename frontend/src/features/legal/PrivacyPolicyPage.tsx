import { Link } from "react-router-dom";
import { LegalDocument, type LegalSection } from "./LegalDocument";
import { LEGAL_ROUTES, RESPONSIBLE } from "./legalConfig";

const sections: LegalSection[] = [
  {
    id: "responsable",
    title: "Responsable del tratamiento",
    content: (
      <>
        <p>
          Esta plataforma es un proyecto de grado desarrollado en la{" "}
          <strong>{RESPONSIBLE.name}</strong>, identificada con NIT {RESPONSIBLE.taxId}, con
          domicilio en {RESPONSIBLE.address} y teléfono {RESPONSIBLE.phone}. La UDI es la
          responsable del tratamiento de los datos personales que se registran en ella.
        </p>
        <p>
          El canal designado por la UDI para peticiones, consultas y reclamos sobre datos personales
          es <strong>{RESPONSIBLE.email}</strong>. Esta política se aplica junto con la{" "}
          <a href={RESPONSIBLE.institutionalPolicyUrl} target="_blank" rel="noopener noreferrer">
            Política de Tratamiento de Datos Personales de la UDI
          </a>{" "}
          (Acuerdo No. 03 del Consejo Directivo, 2019).
        </p>
      </>
    ),
  },
  {
    id: "marco",
    title: "Marco legal",
    content: (
      <p>
        Esta política se rige por el artículo 15 de la Constitución Política, la Ley Estatutaria
        1581 de 2012, el Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015) y las
        instrucciones de la Superintendencia de Industria y Comercio (SIC).
      </p>
    ),
  },
  {
    id: "datos",
    title: "Qué datos tratamos",
    content: (
      <>
        <ul>
          <li>
            <strong>De tu cuenta:</strong> nombre, correo institucional, rol (estudiante o docente)
            y contraseña, que guardamos cifrada con bcrypt: nadie puede leerla, ni siquiera el
            equipo de la plataforma.
          </li>
          <li>
            <strong>De tu actividad académica:</strong> cursos a los que perteneces, proyectos,
            versiones que subes (archivos e imágenes con su descripción y fecha), comentarios y
            calificaciones.
          </li>
          <li>
            <strong>Evidencias:</strong> fecha y versión de los documentos legales que aceptaste, y
            la declaración de autoría que haces al subir cada versión.
          </li>
        </ul>
        <p>
          No pedimos datos sensibles (salud, origen étnico, orientación, datos biométricos, etc.).
          Si una obra que subes contiene datos de otras personas, como su imagen, eres responsable
          de contar con su autorización (ver{" "}
          <Link to={LEGAL_ROUTES.copyright}>Derechos de autor y contenido</Link>).
        </p>
      </>
    ),
  },
  {
    id: "finalidades",
    title: "Para qué usamos tus datos",
    content: (
      <>
        <ul>
          <li>Crear y administrar tu cuenta y verificar tu identidad al iniciar sesión.</li>
          <li>
            Permitir el seguimiento académico: que el docente del curso vea tus versiones, deje
            retroalimentación y calificaciones, y que tú veas tu progreso.
          </li>
          <li>
            Generar el portafolio en PDF de tus proyectos cuando tú o tu docente lo soliciten.
          </li>
          <li>Atender tus consultas y reclamos y cumplir obligaciones legales.</li>
          <li>Mantener la seguridad de la plataforma.</li>
        </ul>
        <p>
          No usamos tus datos con fines comerciales o publicitarios, no los vendemos y no los
          compartimos con terceros para esos fines.
        </p>
      </>
    ),
  },
  {
    id: "acceso",
    title: "Quién puede ver tu información",
    content: (
      <ul>
        <li>
          <strong>Tú:</strong> tus versiones, la retroalimentación que recibes y tu progreso.
        </li>
        <li>
          <strong>El docente titular del curso:</strong> las versiones, la retroalimentación y el
          progreso de los estudiantes inscritos en ese curso.
        </li>
        <li>
          <strong>Otros estudiantes:</strong> no ven tus versiones ni tus calificaciones.
        </li>
      </ul>
    ),
  },
  {
    id: "derechos",
    title: "Tus derechos",
    content: (
      <>
        <p>Como titular de los datos tienes derecho a (Ley 1581 de 2012, artículo 8):</p>
        <ul>
          <li>Conocer, actualizar y rectificar tus datos personales.</li>
          <li>Pedir prueba de la autorización que otorgaste.</li>
          <li>Ser informado, previa solicitud, del uso que se ha dado a tus datos.</li>
          <li>
            Revocar la autorización o pedir que se supriman tus datos cuando no se respeten los
            principios, derechos y garantías legales, salvo que exista un deber legal o contractual
            de conservarlos (por ejemplo, registros académicos).
          </li>
          <li>Acceder gratuitamente a tus datos.</li>
          <li>
            Presentar quejas ante la Superintendencia de Industria y Comercio, después de agotar el
            trámite de consulta o reclamo ante el responsable.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "procedimiento",
    title: "Cómo ejercer tus derechos",
    content: (
      <>
        <p>
          Escribe a <strong>{RESPONSIBLE.email}</strong> indicando tu nombre, el correo de tu
          cuenta, lo que solicitas y un medio de respuesta.
        </p>
        <ul>
          <li>
            <strong>Consultas</strong> (conocer qué datos tenemos y cómo se usan): se responden en
            máximo 10 días hábiles, prorrogables hasta 5 días hábiles más con aviso previo (Ley 1581
            de 2012, art. 14).
          </li>
          <li>
            <strong>Reclamos</strong> (corrección, actualización, supresión o incumplimiento): se
            responden en máximo 15 días hábiles, prorrogables hasta 8 días hábiles más con aviso
            previo. Si el reclamo está incompleto, se te pedirá completarlo dentro de los 5 días
            siguientes (art. 15).
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "almacenamiento",
    title: "Dónde se guardan y por cuánto tiempo",
    content: (
      <>
        <p>
          Los datos se guardan en una base de datos y los archivos en un almacenamiento privado al
          que solo se accede a través de la plataforma, con tu sesión y según tu rol.
        </p>
        <p>
          <strong>Tus datos no salen de la universidad:</strong> se usan únicamente dentro de este
          proyecto académico de la UDI, no se transfieren a otras entidades ni a otros países y no
          se comparten con terceros.
        </p>
        <p>
          Conservamos los datos mientras tu cuenta esté activa y durante el tiempo que exijan los
          reglamentos académicos y la ley. Después se suprimen o se anonimizan.
        </p>
      </>
    ),
  },
  {
    id: "navegador",
    title: "Almacenamiento en tu navegador",
    content: (
      <p>
        La plataforma guarda en el almacenamiento local de tu navegador únicamente el token de tu
        sesión, que es indispensable para que puedas usarla y caduca a los 60 minutos. No usamos
        cookies de seguimiento, analítica ni publicidad, y las fuentes tipográficas se sirven desde
        la propia plataforma, sin enviar tus datos a terceros. Al cerrar sesión, el token se borra.
      </p>
    ),
  },
  {
    id: "seguridad",
    title: "Seguridad",
    content: (
      <p>
        Aplicamos medidas técnicas y organizativas razonables: contraseñas cifradas, sesiones con
        vencimiento, control de acceso por rol y por curso, archivos en almacenamiento privado y
        comunicaciones cifradas (HTTPS) en producción. Ningún sistema es infalible: si detectas un
        problema de seguridad, avísanos de inmediato.
      </p>
    ),
  },
  {
    id: "menores",
    title: "Menores de edad",
    content: (
      <p>
        La plataforma está dirigida a estudiantes de educación superior. Si un menor de edad la usa,
        el tratamiento de sus datos respetará su interés superior y requerirá la autorización de su
        representante legal, conforme al artículo 7 de la Ley 1581 de 2012.
      </p>
    ),
  },
  {
    id: "vigencia",
    title: "Vigencia y cambios",
    content: (
      <p>
        Esta política rige desde su publicación. Si cambia de forma sustancial (por ejemplo, el
        responsable o las finalidades), te lo informaremos antes de aplicar el cambio y, cuando la
        ley lo exija, te pediremos una nueva autorización.
      </p>
    ),
  },
];

export function PrivacyPolicyPage() {
  return (
    <LegalDocument
      title="Política de tratamiento de datos personales"
      summary={
        <>
          En resumen: este es un proyecto de grado de la UDI. Usamos tu nombre, correo, rol y lo que
          subes solo para el seguimiento académico de tus proyectos, y tus datos no salen de la
          universidad. Solo tú y el docente de tu curso ven tu trabajo. No vendemos ni compartimos
          tus datos con fines comerciales, y puedes consultarlos, corregirlos o pedir su supresión
          escribiendo a {RESPONSIBLE.email}.
        </>
      }
      sections={sections}
    />
  );
}
