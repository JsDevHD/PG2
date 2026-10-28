import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatScoreComma } from "@/lib/utils";
import { Award, CircleDashed, Stamp } from "lucide-react";
import { useId } from "react";
import type { FinalGradeFlow, GradeTarget } from "./useFinalGradeFlow";

/** Por qué todavía no se puede asignar: va escrito junto al botón, no solo en un tooltip. */
function blockedReason({ status, target, versions }: FinalGradeFlow): string | undefined {
  if (status === "none") return "Todavía no hay versiones para calificar.";
  if (status === "loading") return "Consultando si ya tiene calificación final…";
  if (status === "error") return "No se pudo consultar la calificación final.";
  if (status === "pending" && versions.length === 0)
    return target?.kind === "group"
      ? "Este grupo aún no ha subido versiones: no hay nada que calificar."
      : "Este estudiante aún no ha subido versiones: no hay nada que calificar.";
  return undefined;
}

function whoOf(target: GradeTarget): string {
  if (target.kind === "group") return target.name;
  const name = target.name ?? "Estudiante";
  return target.groupName ? `${name} (${target.groupName})` : name;
}

interface FinalGradeBarProps {
  flow: FinalGradeFlow;
  /** La versión que el docente tiene abierta, p. ej. "v3, subida el 12 oct 2026, 14:05". */
  viewing?: string;
}

/**
 * Parte superior de la revisión (solo docente): el estado de la calificación final de quien se
 * revisa y el acceso para asignarla, a la vista sin desplazarse también en celular.
 */
export function FinalGradeBar({ flow, viewing }: FinalGradeBarProps) {
  const reasonId = useId();
  const { target, grade, status } = flow;
  const reason = blockedReason(flow);

  return (
    <section
      aria-label="Calificación final"
      className="mb-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm md:flex-row md:items-center md:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-0.5 text-sm">
        {target && (
          <p className="break-words">
            <span className="text-muted">
              {target.kind === "group" ? "Grupo: " : "Estudiante: "}
            </span>
            <span className="font-semibold">{whoOf(target)}</span>
          </p>
        )}
        {viewing && <p className="text-muted">Viendo {viewing}</p>}
      </div>

      <div className="flex flex-col gap-2 md:items-end">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* El indicador anuncia el cambio al registrar y recibe el foco si el botón desaparece. */}
          <span
            ref={flow.statusRef}
            tabIndex={-1}
            aria-live="polite"
            className="w-fit rounded-full"
          >
            {status === "graded" && grade && (
              <Badge tone="shared" className="px-3 py-1 text-sm">
                <Award aria-hidden />
                Calificación final: {formatScoreComma(grade.score ?? 0)}
              </Badge>
            )}
            {status === "pending" && (
              <Badge className="px-3 py-1 text-sm">
                <CircleDashed aria-hidden />
                Sin calificación final
              </Badge>
            )}
          </span>
          {status !== "graded" && (
            <Button
              onClick={(event) => flow.request(event.currentTarget, "bar")}
              disabled={Boolean(reason)}
              aria-describedby={reason ? reasonId : undefined}
              className="w-full sm:w-auto"
            >
              <Stamp aria-hidden />
              Asignar calificación final
            </Button>
          )}
        </div>
        {reason && (
          <p id={reasonId} className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {reason}
            {status === "error" && (
              <Button variant="ghost" size="sm" className="px-2" onClick={flow.retry}>
                Reintentar
              </Button>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
