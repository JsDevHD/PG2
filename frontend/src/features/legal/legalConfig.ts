/**
 * Datos de los documentos legales. Un solo lugar para mantenerlos y versionarlos.
 *
 * La plataforma es un proyecto de grado de la Universidad de Investigación y Desarrollo – UDI.
 * Los datos del responsable son los de la política institucional de la UDI (Acuerdo No. 03 del
 * Consejo Directivo, 7 de octubre de 2019), publicada en `institutionalPolicyUrl`.
 */

/**
 * Versión de los documentos. Se envía al registrarse y Auth Service la guarda como prueba de la
 * autorización (Decreto 1377 de 2013). Si cambian la finalidad o el responsable, hay que cambiar
 * la versión y pedir una nueva autorización.
 */
export const LEGAL_VERSION = "2026-10-08";
export const LEGAL_UPDATED_AT = "8 de octubre de 2026";

/** Responsable del tratamiento de los datos (Ley 1581 de 2012, art. 3, literal e). */
export const RESPONSIBLE = {
  name: "Universidad de Investigación y Desarrollo – UDI",
  shortName: "la UDI",
  taxId: "890212433-5",
  address: "Calle 9 No. 23-55, Bucaramanga, Santander, Colombia",
  /** Canal designado por la UDI para peticiones, consultas y reclamos de datos personales. */
  email: "datos@udi.edu.co",
  phone: "(607) 6352525",
  institutionalPolicyUrl: "https://www.udi.edu.co/politica-de-proteccion-de-datos-udi.pdf",
} as const;

export const LEGAL_ROUTES = {
  privacy: "/legal/privacidad",
  terms: "/legal/terminos",
  copyright: "/legal/derechos-de-autor",
} as const;
