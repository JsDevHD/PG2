import { LegalDocument, type LegalSection } from "./LegalDocument";
import { RESPONSIBLE } from "./legalConfig";

const sections: LegalSection[] = [
  {
    id: "autoria",
    title: "Tus obras son tuyas",
    content: (
      <>
        <p>
          Las piezas que subes (bocetos, logotipos, carteles, ilustraciones, documentos) son obras
          protegidas por la Ley 23 de 1982 y la Decisión Andina 351 de 1993 desde el momento de su
          creación, sin necesidad de registro.
        </p>
        <p>
          Subirlas a la plataforma <strong>no te quita la autoría</strong>: conservas tus derechos
          morales (que se reconozca tu nombre y se respete la integridad de la obra) y tus derechos
          patrimoniales (decidir cómo se reproduce, distribuye o comercializa).
        </p>
      </>
    ),
  },
  {
    id: "licencia",
    title: "Qué permiso le das a la plataforma",
    content: (
      <>
        <p>
          Al subir una versión otorgas una licencia{" "}
          <strong>no exclusiva, gratuita, revocable y limitada a fines académicos</strong> para:
        </p>
        <ul>
          <li>almacenar el archivo de forma privada;</li>
          <li>mostrarlo al docente titular del curso para su revisión y calificación;</li>
          <li>incluirlo en el portafolio en PDF de tu proyecto.</li>
        </ul>
        <p>
          La plataforma no publica tus obras, no las usa con fines comerciales y no las cede a
          terceros. La licencia termina cuando se suprimen tus datos o cuando la revocas, salvo lo
          que deba conservarse como registro académico.
        </p>
      </>
    ),
  },
  {
    id: "docente",
    title: "Uso por parte del docente",
    content: (
      <p>
        El docente puede ver, comentar y calificar las versiones, y generar el portafolio para la
        evaluación. Usar las obras fuera de ese fin (por ejemplo, exhibirlas, publicarlas o
        reutilizarlas en otros materiales) requiere la autorización previa del estudiante y la
        mención de su nombre.
      </p>
    ),
  },
  {
    id: "terceros",
    title: "Material de terceros",
    content: (
      <>
        <p>
          Si tu pieza incluye material que no es tuyo (fotografías, tipografías, ilustraciones,
          íconos, texturas, marcas o textos), debes tener derecho a usarlo:
        </p>
        <ul>
          <li>
            porque es de dominio público o tiene una licencia que lo permite (por ejemplo, Creative
            Commons), respetando sus condiciones de atribución;
          </li>
          <li>porque el titular te dio permiso; o</li>
          <li>
            porque se trata de una cita breve con fines de enseñanza o crítica, indicando la fuente
            y el autor, como permite la ley.
          </li>
        </ul>
        <p>
          Indica en la descripción de la versión las fuentes y licencias del material de terceros.
        </p>
      </>
    ),
  },
  {
    id: "imagen",
    title: "Imágenes de personas",
    content: (
      <p>
        La imagen de una persona identificable está protegida por su derecho a la propia imagen, que
        la Corte Constitucional ha reconocido como derecho fundamental. Si tu pieza muestra a
        alguien reconocible, necesitas su autorización para ese uso; si es menor de edad, la de su
        representante legal. Evita incluir datos personales de terceros (documentos, teléfonos,
        direcciones).
      </p>
    ),
  },
  {
    id: "declaracion",
    title: "Declaración al subir cada versión",
    content: (
      <p>
        Antes de subir una versión debes declarar que eres autor de la obra o que tienes los
        permisos sobre el material de terceros y la autorización de las personas que aparecen. La
        plataforma registra esa declaración con su fecha. Si la declaración es falsa, la
        responsabilidad frente al titular de los derechos es de quien subió el archivo.
      </p>
    ),
  },
  {
    id: "reporte",
    title: "Reportar una infracción",
    content: (
      <>
        <p>
          Si crees que una versión infringe tus derechos de autor o tu derecho a la imagen, escribe
          a <strong>{RESPONSIBLE.email}</strong> indicando:
        </p>
        <ol>
          <li>tu nombre y un medio de contacto;</li>
          <li>la obra o imagen afectada y por qué te pertenece;</li>
          <li>el curso, proyecto y versión donde aparece, si los conoces;</li>
          <li>una declaración de que la información es verídica.</li>
        </ol>
        <p>
          Revisaremos el caso, podremos restringir el acceso al contenido mientras tanto y
          responderemos en un plazo razonable. Las versiones no se pueden borrar desde la plataforma
          (son registros académicos), así que el retiro lo hace el responsable.
        </p>
      </>
    ),
  },
];

export function CopyrightPage() {
  return (
    <LegalDocument
      title="Derechos de autor y contenido"
      summary={
        <>
          En resumen: lo que subes sigue siendo tuyo. La plataforma solo lo guarda y se lo muestra a
          tu docente para evaluarlo. Sube únicamente obras propias o material que tengas permiso de
          usar, y pide autorización a las personas reconocibles que aparezcan en tus piezas.
        </>
      }
      sections={sections}
    />
  );
}
