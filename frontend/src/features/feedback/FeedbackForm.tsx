import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { toApiError } from "@/lib/errors";
import { formatScore } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { useForm } from "react-hook-form";
import { currentPartialGrade, useCreateFeedback, useFeedback } from "./hooks";
import { type FeedbackFormValues, feedbackSchema } from "./schemas";

interface FeedbackFormProps {
  versionId: string;
  versionNumber: number;
  projectId: string;
  courseId: string;
}

/**
 * Retroalimentación parcial del docente titular (RF-05). Se pueden dejar varios comentarios por
 * versión; la calificación es opcional y hay una sola vigente: una nota nueva reemplaza a la
 * anterior, que queda en el historial como reemplazada. Los comentarios no se editan (RNF-08).
 */
export function FeedbackForm({ versionId, versionNumber, projectId, courseId }: FeedbackFormProps) {
  const createFeedback = useCreateFeedback(versionId, projectId, courseId);
  const current = currentPartialGrade(useFeedback(versionId).data);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<FeedbackFormValues>({ resolver: zodResolver(feedbackSchema) });

  const typedScore = watch("score") as unknown;
  const willReplace = Boolean(current) && typedScore !== "" && typedScore !== undefined;

  const onSubmit = handleSubmit((values) => {
    const replacing = Boolean(current) && values.score !== undefined;
    createFeedback.mutate(values.score === undefined ? { comment: values.comment } : values, {
      onSuccess: () => {
        toast.success(
          replacing
            ? `Comentario guardado y calificación de v${versionNumber} reemplazada`
            : `Retroalimentación guardada en v${versionNumber}`,
        );
        reset({ comment: "", score: undefined });
      },
      onError: (error) => {
        const apiError = toApiError(error);
        // 422/409: el mensaje del backend junto al formulario; red/5xx/403: aviso general.
        if (apiError.kind === "validation" || apiError.kind === "conflict")
          setError("comment", { message: apiError.message });
        else toast.error(apiError.message);
      },
    });
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5"
    >
      <h3 className="font-semibold">Agregar retroalimentación a v{versionNumber}</h3>
      <Field label="Comentario" error={errors.comment?.message}>
        <Textarea
          rows={4}
          placeholder="Buena paleta de color. Ajusta el espaciado de la tipografía principal."
          {...register("comment")}
        />
      </Field>
      <Field
        label="Calificación (opcional)"
        error={errors.score?.message}
        hint={current ? `De 0 a 5. Vigente: ${formatScore(current.score ?? 0)}` : "De 0 a 5"}
        className="w-full max-w-[13rem]"
      >
        <Input
          type="number"
          inputMode="decimal"
          step="0.1"
          min={0}
          max={5}
          placeholder={current ? formatScore(current.score ?? 0) : "4.2"}
          {...register("score")}
        />
      </Field>
      {/* Aviso en vivo: aparece al escribir una nota cuando la versión ya tiene una vigente. */}
      <div aria-live="polite">
        {willReplace && current && (
          <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning-ink">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Esta versión ya tiene una calificación parcial de{" "}
              <strong className="tabular-nums">{formatScore(current.score ?? 0)} / 5.0</strong>. Al
              guardar, la nueva calificación la reemplaza; la anterior queda en el historial como
              reemplazada.
            </span>
          </p>
        )}
      </div>
      {/* flex-wrap: el botón baja a su propia línea según el ancho del formulario, no de la
          pantalla (en "Ver en grande" el formulario va en una columna angosta). */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <p className="min-w-0 flex-1 basis-56 text-xs text-muted">
          Puedes dejar varios comentarios en una versión, pero solo una calificación queda vigente.
          Los comentarios guardados no se pueden editar ni borrar.
        </p>
        <Button type="submit" loading={createFeedback.isPending} className="ml-auto shrink-0">
          {willReplace ? "Guardar y reemplazar nota" : "Guardar retroalimentación"}
        </Button>
      </div>
    </form>
  );
}
