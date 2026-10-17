import { formatDate } from "@/lib/utils";
import type { ProjectResponse } from "@/types/api";
import { ChevronDown, FileText } from "lucide-react";
import { useId, useState } from "react";

/** Más de esto se muestra recortado, con opción de ver completo. */
const COLLAPSED_CHARS = 280;

interface ProjectBriefProps {
  project: ProjectResponse;
  /** `compact`: para columnas laterales (sin fecha, recorte más corto). */
  variant?: "full" | "compact";
}

/** Descripción del proyecto que escribió el docente al crearlo: lo que se espera entregar. */
export function ProjectBrief({ project, variant = "full" }: ProjectBriefProps) {
  const contentId = useId();
  const description = project.description.trim();
  const limit = variant === "compact" ? 180 : COLLAPSED_CHARS;
  const isLong = description.length > limit;
  const [expanded, setExpanded] = useState(false);

  return (
    <section
      aria-labelledby={`${contentId}-title`}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-center gap-2">
        <FileText className="size-4 text-muted" aria-hidden />
        <h2 id={`${contentId}-title`} className="text-sm font-semibold">
          Descripción del proyecto
        </h2>
      </div>
      {description ? (
        <>
          <p
            id={contentId}
            className={
              isLong && !expanded
                ? "line-clamp-4 whitespace-pre-line break-words text-sm leading-relaxed text-ink/90"
                : "whitespace-pre-line break-words text-sm leading-relaxed text-ink/90"
            }
          >
            {description}
          </p>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              aria-controls={contentId}
              className="inline-flex w-fit items-center gap-1 rounded-md text-sm font-semibold text-ink underline-offset-4 hover:underline"
            >
              {expanded ? "Ver menos" : "Ver descripción completa"}
              <ChevronDown
                className={
                  expanded
                    ? "size-4 rotate-180 transition-transform"
                    : "size-4 transition-transform"
                }
                aria-hidden
              />
            </button>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">
          El docente no agregó una descripción para este proyecto.
        </p>
      )}
      {variant === "full" && (
        <p className="text-xs text-muted">Creado el {formatDate(project.created_at)}</p>
      )}
    </section>
  );
}
