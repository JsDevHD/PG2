import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** Enlace a un documento legal desde un formulario: abre en otra pestaña para no perder lo escrito. */
export function LegalLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      target="_blank"
      rel="noopener"
      className="font-semibold text-ink underline underline-offset-4"
      // Evita que el clic en el enlace marque o desmarque la casilla que lo contiene.
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </Link>
  );
}
