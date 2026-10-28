import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatDateTime, formatScoreComma } from "@/lib/utils";
import { Stamp, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { FinalGradeFlow, GradeTarget } from "./useFinalGradeFlow";

function whoOf(target: GradeTarget): string {
  if (target.kind === "group") return `${target.name} (${target.memberNames.join(", ")})`;
  const name = target.name ?? "Estudiante";
  return target.groupName ? `${name}, del grupo ${target.groupName}` : name;
}

function warningOf(target: GradeTarget): string {
  return target.kind === "group"
    ? "La calificación final es definitiva: no se puede corregir y ningún integrante del grupo podrá subir más versiones de este proyecto."
    : "La calificación final es definitiva: no se puede corregir y el estudiante dejará de poder subir versiones de este proyecto.";
}

interface ConfirmFinalGradeDialogProps {
  flow: FinalGradeFlow;
  projectTitle: string;
  numbers: Map<string, number>;
}

/**
 * Último paso antes de registrar la calificación final, que no se puede corregir. Cancelar, Esc o
 * un clic fuera cierran sin enviar; mientras se registra no se puede cerrar ni volver a enviar.
 */
export function ConfirmFinalGradeDialog({
  flow,
  projectTitle,
  numbers,
}: ConfirmFinalGradeDialogProps) {
  const { target, confirming, error, pending } = flow;
  const warningId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const version = flow.versions.find((v) => v.id === flow.versionId);

  // El botón pulsado se deshabilitó mientras se registraba: tras un error el foco vuelve al
  // diálogo para reintentar o, si ya estaba calificado, para cerrar.
  useEffect(() => {
    if (error) (error.conflict ? cancelRef : confirmRef).current?.focus();
  }, [error]);

  return (
    <Dialog open={Boolean(confirming && target)} onOpenChange={(open) => !open && flow.cancel()}>
      <DialogContent
        title="Confirmar calificación final"
        aria-modal="true"
        aria-describedby={warningId}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          flow.restoreFocus();
        }}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        {confirming && target && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-1 gap-x-4 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-y-2">
              <dt className="text-muted">{target.kind === "group" ? "Grupo" : "Estudiante"}</dt>
              <dd className="mb-2 break-words font-medium sm:mb-0">{whoOf(target)}</dd>
              <dt className="text-muted">Proyecto</dt>
              <dd className="mb-2 break-words font-medium sm:mb-0">{projectTitle}</dd>
              <dt className="text-muted">Versión calificada</dt>
              <dd className="mb-2 font-medium sm:mb-0">
                {version
                  ? `v${numbers.get(version.id)}${version.id === flow.latest?.id ? " (la última)" : ""}, subida el ${formatDateTime(version.uploaded_at)}`
                  : "—"}
              </dd>
              <dt className="text-muted">Nota</dt>
              <dd className="mb-2 sm:mb-0">
                <span className="text-2xl font-bold tabular-nums tracking-tight">
                  {formatScoreComma(confirming.score)}
                </span>
                <span className="font-semibold text-muted"> / 5,0</span>
              </dd>
              <dt className="text-muted">Comentario</dt>
              <dd className="whitespace-pre-line break-words">{confirming.comment}</dd>
            </dl>

            <p
              id={warningId}
              className="flex items-start gap-2 rounded-lg border border-warning bg-warning-soft px-3 py-2.5 text-sm font-semibold text-warning-ink"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{warningOf(target)}</span>
            </p>

            {error && (
              <p
                role="alert"
                className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink"
              >
                {error.message}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                ref={cancelRef}
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={flow.cancel}
              >
                {error?.conflict ? "Cerrar" : "Cancelar"}
              </Button>
              {!error?.conflict && (
                <Button ref={confirmRef} type="button" loading={pending} onClick={flow.submit}>
                  {!pending && <Stamp aria-hidden />}
                  {pending ? "Registrando…" : "Confirmar calificación final"}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
