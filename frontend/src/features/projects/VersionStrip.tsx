import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import type { VersionResponse } from "@/types/api";
import { MessageSquare } from "lucide-react";
import { VersionPreview } from "./VersionPreview";
import { threadOf } from "./hooks";

interface VersionStripProps {
  versions: VersionResponse[];
  numbers: Map<string, number>;
  selectedId?: string;
  onSelect: (version: VersionResponse) => void;
  /** Versiones que ya tienen al menos una retroalimentación. */
  reviewedIds: Set<string>;
  /** Autor o grupo de la versión (cuando en la tira se mezclan varios hilos o integrantes). */
  authorOf?: (version: VersionResponse) => string | undefined;
}

/**
 * Historial como tira de pruebas: la más reciente arriba, con el número de versión como
 * protagonista. Es una secuencia real, por eso la numeración.
 */
export function VersionStrip({
  versions,
  numbers,
  selectedId,
  onSelect,
  reviewedIds,
  authorOf,
}: VersionStripProps) {
  const ordered = [...versions].reverse();
  // Última versión de cada hilo (estudiante o grupo): en la vista del docente se mezclan varios.
  const latestIds = new Set<string>();
  const seen = new Set<string>();
  for (const version of ordered) {
    if (!seen.has(threadOf(version))) latestIds.add(version.id);
    seen.add(threadOf(version));
  }

  return (
    <ol className="flex flex-col gap-3" aria-label="Historial de versiones">
      {ordered.map((version) => {
        const number = numbers.get(version.id) ?? 0;
        const selected = version.id === selectedId;
        const author = authorOf?.(version);
        return (
          <li key={version.id}>
            <button
              type="button"
              onClick={() => onSelect(version)}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "flex w-full items-start gap-4 rounded-lg border bg-surface p-3 text-left shadow-sm transition-colors",
                selected ? "border-ink ring-1 ring-ink" : "border-border hover:border-ink/30",
              )}
            >
              <VersionPreview version={version} number={number} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold leading-none tracking-tighter tabular-nums">
                    v{number}
                  </span>
                  <span className="text-sm text-muted">{formatDate(version.uploaded_at)}</span>
                </div>
                {author && (
                  <span className="truncate text-xs font-semibold text-student-ink">{author}</span>
                )}
                <p className="line-clamp-2 break-words text-sm text-ink/80">
                  {version.description}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {latestIds.has(version.id) && <Badge>Última versión</Badge>}
                  {reviewedIds.has(version.id) && (
                    <Badge tone="shared">
                      <MessageSquare aria-hidden />
                      Revisada
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
