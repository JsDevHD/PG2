import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface PageHeaderProps {
  title: string;
  /** Contexto de la pantalla (curso, proyecto), como el chip gris de los mockups. */
  context?: ReactNode;
  back?: { to: string; label: string };
  actions?: ReactNode;
  /** Título de la pestaña, si debe ser distinto del encabezado (p. ej. "Hola, Ana"). */
  documentTitle?: string;
}

export function PageHeader({ title, context, back, actions, documentTitle }: PageHeaderProps) {
  useDocumentTitle(documentTitle ?? title);
  return (
    // En celular el encabezado es una banda blanca de borde a borde sobre la plancha de corte;
    // desde `sm` se integra al flujo de la página.
    <div className="-mx-4 -mt-6 mb-6 flex flex-col gap-4 border-b border-border bg-surface px-4 pb-5 pt-5 sm:mx-0 sm:mt-0 sm:mb-8 sm:border-0 sm:bg-transparent sm:p-0 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        {back && (
          <Link
            to={back.to}
            className="-ml-1 inline-flex w-fit items-center gap-0.5 rounded-md py-0.5 pr-2 text-sm text-muted hover:text-ink"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {context && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">{context}</div>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ContextChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-semibold text-ink">
      {children}
    </span>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-base font-semibold tracking-tight">{children}</h2>
      {aside}
    </div>
  );
}
