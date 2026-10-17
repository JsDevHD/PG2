import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { toApiError } from "@/lib/errors";
import { formatScore } from "@/lib/utils";
import type { FeedbackResponse, VersionResponse } from "@/types/api";
import { FileDown } from "lucide-react";
import { useExportPortfolio } from "./hooks";

interface ExportButtonProps {
  projectId: string;
  /** Obligatorio para el docente; el backend lo ignora para el estudiante. */
  studentId?: string;
  versions: VersionResponse[];
  feedback: FeedbackResponse[];
  disabledReason?: string;
}

/** Mockup 07_exportar_pdf.png, embebido en el historial (no es una página aparte). RF-07 / CU-04. */
export function ExportButton({
  projectId,
  studentId,
  versions,
  feedback,
  disabledReason,
}: ExportButtonProps) {
  const exportPdf = useExportPortfolio(projectId, studentId);
  // Promedio de las calificaciones parciales vigentes (una por versión como máximo).
  const partial = feedback.filter(
    (item) => !item.is_final && !item.score_replaced && item.score !== null,
  );
  const average = partial.length
    ? partial.reduce((sum, item) => sum + (item.score ?? 0), 0) / partial.length
    : null;

  const run = () =>
    exportPdf.mutate(undefined, {
      onSuccess: () => toast.success("Portafolio descargado"),
      onError: (error) => toast.error(toApiError(error).message),
    });

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ink/[0.06]">
          <FileDown className="size-5" aria-hidden />
        </span>
        <div>
          <h3 className="font-semibold">Exportar portafolio</h3>
          <p className="text-sm text-muted">
            Un PDF con las versiones, la retroalimentación y las calificaciones del proyecto.
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 border-y border-border py-3 text-center">
        <div>
          <dt className="text-xs text-muted">Versiones</dt>
          <dd className="font-semibold tabular-nums">{versions.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Comentarios</dt>
          <dd className="font-semibold tabular-nums">{feedback.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Promedio</dt>
          <dd className="font-semibold tabular-nums">
            {average === null ? "—" : formatScore(average)}
          </dd>
        </div>
      </dl>
      <Button
        onClick={run}
        loading={exportPdf.isPending}
        disabled={Boolean(disabledReason)}
        className="w-full"
      >
        {exportPdf.isPending ? "Generando PDF…" : "Exportar portafolio en PDF"}
      </Button>
      {disabledReason ? (
        <p className="text-center text-xs text-muted">{disabledReason}</p>
      ) : (
        versions.length === 0 && (
          <p className="text-center text-xs text-muted">
            Sin versiones, el PDF dirá que no hay evidencias registradas.
          </p>
        )
      )}
    </div>
  );
}
