import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatScore } from "@/lib/utils";
import type { FeedbackResponse } from "@/types/api";
import { Award, Stamp } from "lucide-react";
import { useId } from "react";
import { useFinalGrades } from "./hooks";
import { type FinalGradeFlow, type GradeTarget, findGrade } from "./useFinalGradeFlow";

function FinalGradeSummary({
  grade,
  versionNumber,
  label = "Calificación final",
}: { grade: FeedbackResponse; versionNumber?: number; label?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-shared bg-shared-soft/50 p-4">
      <div className="flex items-center gap-2 text-shared-ink">
        <Award className="size-5" aria-hidden />
        <span className="font-semibold">{label}</span>
      </div>
      <p className="text-4xl font-bold tabular-nums tracking-tight">
        {formatScore(grade.score ?? 0)}
        <span className="text-lg font-semibold text-muted"> / 5.0</span>
      </p>
      <p className="whitespace-pre-line break-words text-sm">{grade.comment}</p>
      <p className="text-xs text-muted">
        Asignada el {formatDate(grade.created_at)}
        {versionNumber ? ` sobre la v${versionNumber}` : ""}
      </p>
    </div>
  );
}

interface FinalGradePanelProps {
  projectId: string;
  target: GradeTarget;
  numbers: Map<string, number>;
  /** Flujo del docente para asignarla; sin él (estudiante) el panel solo la muestra. */
  flow?: FinalGradeFlow;
}

/** RF-09: una calificación final por estudiante (o grupo) y proyecto, no revertible en el MVP. */
export function FinalGradePanel({ projectId, target, numbers, flow }: FinalGradePanelProps) {
  const finalGrades = useFinalGrades(projectId);
  const grade = findGrade(finalGrades.data, target);

  if (finalGrades.isLoading) return <Skeleton className="h-32" />;
  if (grade)
    return (
      <FinalGradeSummary
        grade={grade}
        versionNumber={numbers.get(grade.version_id)}
        label={target.kind === "group" ? "Calificación final del grupo" : "Calificación final"}
      />
    );
  if (!flow) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted">
        Aún no tienes calificación final en este proyecto.
      </p>
    );
  }
  if (flow.versions.length === 0) return null;
  return <AssignFinalGrade flow={flow} target={target} numbers={numbers} />;
}

/** A quién alcanza la calificación: importa sobre todo en los proyectos por grupos. */
function scopeText(target: GradeTarget): string {
  if (target.kind === "group") {
    return `Una sola nota para todo el grupo ${target.name} (${target.memberNames.join(", ")}). Después, ningún integrante podrá subir más versiones.`;
  }
  const who = target.name ?? "este estudiante";
  if (target.inGroup) {
    return `Es solo para ${who}. Después, ${who} no podrá subir más versiones; el resto del grupo sí, hasta que lo califiques.`;
  }
  return `Se asigna una sola vez a ${who}. Después, no podrá subir más versiones.`;
}

/**
 * Bloque «Calificación final (definitiva)»: borde y encabezado de advertencia y opacidad completa,
 * distinto del bloque de la nota parcial. Enviar no registra nada: abre la confirmación.
 */
function AssignFinalGrade({
  flow,
  target,
  numbers,
}: { flow: FinalGradeFlow; target: GradeTarget; numbers: Map<string, number> }) {
  const titleId = useId();
  const { form, errors, versions, latest, versionId } = flow;

  return (
    <section
      ref={flow.blockRef}
      aria-labelledby={titleId}
      className="scroll-mt-20 overflow-hidden rounded-lg border-2 border-warning bg-surface shadow-sm"
    >
      <div className="flex flex-col gap-1 border-b-2 border-warning bg-warning-soft px-4 py-3 text-warning-ink sm:px-5">
        <h3 id={titleId} className="flex items-center gap-2 font-semibold">
          <Stamp className="size-4 shrink-0" aria-hidden />
          Calificación final (definitiva)
        </h3>
        <p className="text-sm">
          La calificación final no se puede corregir y cierra la entrega de versiones de este
          proyecto.
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          flow.request((event.nativeEvent as SubmitEvent).submitter, "form");
        }}
        noValidate
        className="flex flex-col gap-4 p-4 sm:p-5"
      >
        <p className="text-sm text-muted">{scopeText(target)}</p>
        <Field label="Versión evaluada">
          <Select value={versionId} onChange={(event) => flow.selectVersion(event.target.value)}>
            {[...versions].reverse().map((version) => (
              <option key={version.id} value={version.id}>
                v{numbers.get(version.id)} del {formatDate(version.uploaded_at)}
                {version.id === latest?.id ? " (última)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Comentario final" error={errors.comment?.message}>
          <Textarea rows={4} {...form.register("comment")} />
        </Field>
        <Field label="Nota final" error={errors.score?.message} hint="De 0 a 5" className="sm:w-36">
          <Input
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            max={5}
            {...form.register("score")}
          />
        </Field>
        {/* Otro nombre que el botón de la barra: este no registra, lleva a la confirmación. */}
        <div className="flex justify-end">
          <Button type="submit" className="w-full sm:w-auto">
            <Stamp aria-hidden />
            Revisar y confirmar
          </Button>
        </div>
      </form>
    </section>
  );
}
