import { LegalShell } from "@/components/layout/AppShell";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LEGAL_UPDATED_AT, LEGAL_VERSION } from "./legalConfig";

export interface LegalSection {
  id: string;
  title: string;
  content: ReactNode;
}

interface LegalDocumentProps {
  title: string;
  summary: ReactNode;
  sections: LegalSection[];
}

/**
 * Documento legal: resumen, índice y cláusulas numeradas (la numeración es real: así se citan).
 * Las páginas son públicas, porque deben poder leerse antes de crear la cuenta.
 */
export function LegalDocument({ title, summary, sections }: LegalDocumentProps) {
  useDocumentTitle(title);

  return (
    <LegalShell>
      <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-12">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Link
            to="/"
            className="-ml-1 mb-4 inline-flex items-center gap-0.5 rounded-md py-0.5 pr-2 text-sm text-muted hover:text-ink"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Volver a la plataforma
          </Link>
          <nav aria-label="Contenido del documento" className="hidden lg:block">
            <ol className="flex flex-col gap-1 border-l border-border text-sm">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="-ml-px flex gap-2 border-l border-transparent py-1 pl-3 text-muted hover:border-ink hover:text-ink"
                  >
                    <span className="tabular-nums">{index + 1}.</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className="rounded-lg border border-border bg-surface px-5 py-7 shadow-sm sm:px-10 sm:py-10">
          <header className="mb-8 border-b border-border pb-6">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            <p className="mt-2 text-sm text-muted">
              Versión {LEGAL_VERSION}, actualizada el {LEGAL_UPDATED_AT}
            </p>
            <div className="mt-5 rounded-lg bg-ink/[0.04] p-4 text-sm leading-relaxed">
              {summary}
            </div>
          </header>

          <div className="flex max-w-prose flex-col gap-8 text-[15px] leading-relaxed text-ink/90 [&_a]:font-semibold [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-3 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ol]:space-y-1.5 [&_ul]:mt-3 [&_ol]:mt-3">
            {sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                aria-labelledby={`${section.id}-t`}
                className="scroll-mt-24"
              >
                <h2
                  id={`${section.id}-t`}
                  className="mb-3 flex gap-2 text-lg font-semibold tracking-tight text-ink"
                >
                  <span className="tabular-nums text-muted">{index + 1}.</span>
                  {section.title}
                </h2>
                {section.content}
              </section>
            ))}
          </div>

          <p className="mt-10 border-t border-border pt-6 text-xs text-muted">
            Sistema de Seguimiento de Proyectos Gráficos: proyecto de grado de la Universidad de
            Investigación y Desarrollo – UDI. Los datos se usan solo con fines académicos y no salen
            de la universidad.
          </p>
        </article>
      </div>
    </LegalShell>
  );
}
