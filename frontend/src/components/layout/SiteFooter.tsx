import { LEGAL_ROUTES } from "@/features/legal/legalConfig";
import { Link } from "react-router-dom";

const links = [
  { to: LEGAL_ROUTES.terms, label: "Términos de uso" },
  { to: LEGAL_ROUTES.privacy, label: "Tratamiento de datos" },
  { to: LEGAL_ROUTES.copyright, label: "Derechos de autor" },
];

/**
 * Colofón de las pantallas públicas (login, registro, documentos legales): franja oscura al pie
 * de la ventana, del mismo tono que el header, que cierra el marco de la página.
 */
export function Colophon() {
  return (
    <footer className="bg-chrome text-white/60">
      <div className="flex flex-col gap-3 px-4 py-4 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Proyecto de grado de la UDI. Las obras pertenecen a sus autores.</p>
        <nav aria-label="Información legal">
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {links.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="inline-block rounded-sm py-1 underline-offset-4 hover:text-white hover:underline focus-visible:ring-offset-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

/** Enlaces legales dentro de la app: al pie de la barra lateral, sobre la cuenta. */
export function SidebarLegal({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Información legal" className="px-5 pb-3 pt-1">
      <ul className="flex flex-wrap gap-x-3 text-xs text-muted">
        {links.map((link) => (
          <li key={link.to}>
            <Link
              to={link.to}
              onClick={onNavigate}
              className="inline-block rounded-sm py-1 underline-offset-4 hover:text-ink hover:underline"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] leading-snug text-muted/80">
        Las obras pertenecen a sus autores. Uso académico.
      </p>
    </nav>
  );
}
