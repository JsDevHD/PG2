import { Link } from "react-router-dom";
import { LegalDocument, type LegalSection } from "./LegalDocument";
import { LEGAL_ROUTES, RESPONSIBLE } from "./legalConfig";

const sections: LegalSection[] = [
  {
    id: "objeto",
    title: "Objeto",
    content: (
      <p>
        La plataforma sirve para el seguimiento académico de proyectos de diseño gráfico: los
        estudiantes suben versiones de sus proyectos y el docente del curso las revisa, comenta y
        califica. Al crear una cuenta aceptas estos términos, la{" "}
        <Link to={LEGAL_ROUTES.privacy}>Política de tratamiento de datos</Link> y las reglas de{" "}
        <Link to={LEGAL_ROUTES.copyright}>Derechos de autor y contenido</Link>.
      </p>
    ),
  },
  {
    id: "cuenta",
    title: "Tu cuenta",
    content: (
      <ul>
        <li>Usa tu correo institucional y datos verdaderos.</li>
        <li>
          El rol (estudiante o docente) se fija al registrarte y no se puede cambiar desde la
          plataforma.
        </li>
        <li>
          Tu cuenta es personal: no compartas tu contraseña. Eres responsable de lo que se haga con
          ella; si sospechas un uso indebido, cámbiala y avísanos.
        </li>
      </ul>
    ),
  },
  {
    id: "uso",
    title: "Uso permitido",
    content: (
      <>
        <p>Puedes usar la plataforma solo con fines académicos. No está permitido:</p>
        <ul>
          <li>subir obras ajenas como propias o material sin los permisos necesarios;</li>
          <li>
            subir contenido ilegal, violento, sexual, discriminatorio o que vulnere la intimidad, la
            honra o la imagen de otras personas;
          </li>
          <li>subir archivos con código malicioso o que no correspondan a su formato;</li>
          <li>intentar acceder a cursos, versiones o cuentas de otras personas;</li>
          <li>afectar el funcionamiento o la seguridad de la plataforma.</li>
        </ul>
      </>
    ),
  },
  {
    id: "contenido",
    title: "Versiones, comentarios y calificaciones",
    content: (
      <ul>
        <li>
          Las versiones subidas, los comentarios y las calificaciones son registros académicos: no
          se pueden editar ni borrar desde la plataforma.
        </li>
        <li>
          Una versión puede tener varios comentarios, pero solo una calificación parcial vigente; si
          el docente la cambia, la anterior queda en el historial como reemplazada.
        </li>
        <li>
          La calificación final se asigna una sola vez por estudiante y proyecto; después no se
          admiten más versiones.
        </li>
      </ul>
    ),
  },
  {
    id: "docentes",
    title: "Obligaciones del docente",
    content: (
      <p>
        El docente usa las obras y los datos de sus estudiantes solo para la evaluación del curso,
        mantiene la confidencialidad de las calificaciones y no reutiliza las piezas fuera de ese
        fin sin autorización de su autor.
      </p>
    ),
  },
  {
    id: "suspension",
    title: "Incumplimientos",
    content: (
      <p>
        Si se incumplen estos términos, el responsable puede restringir el acceso a un contenido o
        suspender la cuenta, sin perjuicio de las medidas que contemple el reglamento estudiantil o
        docente de la institución.
      </p>
    ),
  },
  {
    id: "disponibilidad",
    title: "Disponibilidad y responsabilidad",
    content: (
      <p>
        La plataforma se ofrece como herramienta académica y puede tener interrupciones por
        mantenimiento o fallas. Guarda copia de tus archivos originales: la plataforma no reemplaza
        tu propio respaldo. Cada usuario responde por el contenido que sube.
      </p>
    ),
  },
  {
    id: "cambios",
    title: "Cambios y contacto",
    content: (
      <p>
        Estos términos pueden actualizarse; los cambios sustanciales se informarán en la plataforma.
        Para cualquier duda escribe a {RESPONSIBLE.email}. Estos términos se rigen por las leyes de
        la República de Colombia.
      </p>
    ),
  },
];

export function TermsPage() {
  return (
    <LegalDocument
      title="Términos y condiciones de uso"
      summary={
        <>
          En resumen: es una herramienta académica. Usa tu cuenta solo tú, sube solo obras propias o
          con permiso, y recuerda que versiones, comentarios y calificaciones quedan como registro y
          no se borran.
        </>
      }
      sections={sections}
    />
  );
}
