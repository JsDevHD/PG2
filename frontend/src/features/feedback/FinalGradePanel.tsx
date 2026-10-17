import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { toApiError } from "@/lib/errors";
import { formatDate, formatScore } from "@/lib/utils";
import type { FeedbackResponse, VersionResponse } from "@/types/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { Award } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAssignFinalGrade, useFinalGrades } from "./hooks";
import { type FinalGradeFormValues, finalGradeSchema } from "./schemas";

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

/**
 * A quién se califica:
 * - `student`: un estudiante (proyecto individual, o un integrante si el grupo se califica
 *   individualmente; en ese caso `inGroup` hace que se envíe su id).
 * - `group`: todo el grupo a la vez (calificación grupal); Feedback Service crea un registro por
 *   integrante.
 */
export type GradeTarget =
  | { kind: "student"; studentId: string; name?: string; inGroup?: boolean }
  | { kind: "group"; groupId: string; name: string; memberNames: string[] };

interface FinalGradePanelProps {
  projectId: string;
  courseId: string;
  target: GradeTarget;
  /** Versiones del hilo (del estudiante o del grupo), para elegir sobre cuál se califica. */
  versions: VersionResponse[];
  numbers: Map<string, number>;
  canAssign: boolean;
}

function findGrade(grades: FeedbackResponse[] | undefined, target: GradeTarget) {
  return grades?.find((item) =>
    target.kind === "group"
      ? item.group_id === target.groupId
      : item.student_id === target.studentId,
  );
}

/** RF-09: una calificación final por estudiante (o grupo) y proyecto, no revertible en el MVP. */
export function FinalGradePanel({
  projectId,
  courseId,
  target,
  versions,
  numbers,
  canAssign,
}: FinalGradePanelProps) {
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
  if (!canAssign) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted">
        Aún no tienes calificación final en este proyecto.
      </p>
    );
  }
  if (versions.length === 0) return null;
  return (
    <AssignFinalGrade
      projectId={projectId}
      courseId={courseId}
      target={target}
      versions={versions}
      numbers={numbers}
    />
  );
}

function dialogText(target: GradeTarget): { prompt: string; description: string } {
  if (target.kind === "group") {
    return {
      prompt: `Cuando el grupo termine, asigna una sola calificación final para ${target.name}.`,
      description: `Se asigna una vez a todo el grupo (${target.memberNames.join(", ")}) y no se puede cambiar. Después, ningún integrante podrá subir más versiones.`,
    };
  }
  if (target.inGroup) {
    const who = target.name ?? "este integrante";
    return {
      prompt: `Asigna la calificación final de ${who}.`,
      description: `Es solo para ${who} y no se puede cambiar. Después, ${who} no podrá subir más versiones; el resto del grupo sí, hasta que lo califiques.`,
    };
  }
  return {
    prompt: "Cuando el proyecto esté terminado, asigna la calificación final.",
    description:
      "Solo se asigna una vez por estudiante y no se puede cambiar. Después, el estudiante no podrá subir más versiones.",
  };
}

function AssignFinalGrade({
  projectId,
  courseId,
  target,
  versions,
  numbers,
}: Pick<FinalGradePanelProps, "projectId" | "courseId" | "target" | "versions" | "numbers">) {
  const [open, setOpen] = useState(false);
  const assign = useAssignFinalGrade(projectId, courseId);
  const latest = versions.at(-1);
  const [selectedId, setSelectedId] = useState(latest?.id ?? "");
  // Solo se envía una versión del hilo que se está calificando, y la calificación final no se
  // puede corregir.
  const versionId = versions.some((v) => v.id === selectedId) ? selectedId : (latest?.id ?? "");
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FinalGradeFormValues>({ resolver: zodResolver(finalGradeSchema) });
  const text = dialogText(target);

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    const studentId = target.kind === "student" && target.inGroup ? target.studentId : undefined;
    assign.mutate(
      { ...values, version_id: versionId, ...(studentId ? { student_id: studentId } : {}) },
      {
        onSuccess: () => {
          toast.success(
            target.kind === "group"
              ? "Calificación del grupo asignada"
              : "Calificación final asignada",
          );
          setOpen(false);
        },
        // 409 (ya tiene calificación final) o 422: dentro del diálogo, donde se está actuando.
        onError: (error) => setServerError(toApiError(error).message),
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">{text.prompt}</p>
        <DialogTrigger asChild>
          <Button variant="secondary" className="shrink-0">
            <Award aria-hidden />
            Asignar calificación final
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent
        title={
          target.kind === "group" ? `Calificación final de ${target.name}` : "Calificación final"
        }
        description={text.description}
      >
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Versión evaluada">
            <Select value={versionId} onChange={(event) => setSelectedId(event.target.value)}>
              {[...versions].reverse().map((version) => (
                <option key={version.id} value={version.id}>
                  v{numbers.get(version.id)} del {formatDate(version.uploaded_at)}
                  {version.id === latest?.id ? " (última)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Comentario final" error={errors.comment?.message}>
            <Textarea rows={4} {...register("comment")} />
          </Field>
          <Field
            label="Nota final"
            error={errors.score?.message}
            hint="De 0 a 5"
            className="sm:w-36"
          >
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              max={5}
              {...register("score")}
            />
          </Field>
          {serverError && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              {serverError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={assign.isPending}>
              Asignar calificación final
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
