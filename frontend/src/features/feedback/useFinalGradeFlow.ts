import { toast } from "@/components/ui/toast";
import { versionKeys } from "@/features/projects/hooks";
import { toApiError } from "@/lib/errors";
import type { FeedbackResponse, VersionResponse } from "@/types/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { feedbackKeys, useAssignFinalGrade, useFinalGrades } from "./hooks";
import { type FinalGradeFormValues, finalGradeSchema } from "./schemas";

/**
 * A quién se califica:
 * - `student`: un estudiante (proyecto individual, o un integrante si el grupo se califica
 *   individualmente; en ese caso `inGroup` hace que se envíe su id).
 * - `group`: todo el grupo a la vez (calificación grupal); Feedback Service crea un registro por
 *   integrante.
 */
export type GradeTarget =
  | { kind: "student"; studentId: string; name?: string; inGroup?: boolean; groupName?: string }
  | { kind: "group"; groupId: string; name: string; memberNames: string[] };

export function findGrade(grades: FeedbackResponse[] | undefined, target: GradeTarget) {
  return grades?.find((item) =>
    target.kind === "group"
      ? item.group_id === target.groupId
      : item.student_id === target.studentId,
  );
}

/**
 * Estado de la calificación final de quien se revisa: `none` (todavía no hay a quién calificar),
 * `loading`, `error`, `pending` (sin calificación final) o `graded`.
 */
export type FinalGradeStatus = "none" | "loading" | "error" | "pending" | "graded";

interface ConfirmError {
  message: string;
  /** 409: ya tenía calificación final. No tiene sentido reintentar, solo cerrar. */
  conflict: boolean;
}

interface FinalGradeFlowOptions {
  projectId: string;
  courseId: string;
  /** `undefined` si no hay a quién calificar (o si quien mira es un estudiante). */
  target?: GradeTarget;
  /** Versiones del hilo calificado (del estudiante o del grupo), en orden ascendente. */
  versions: VersionResponse[];
}

/**
 * Flujo de la calificación final del docente (RF-09), compartido por la barra superior, el bloque
 * «Calificación final (definitiva)» y el diálogo de confirmación. El formulario solo se valida: la
 * petición sale una sola vez, al confirmar en el diálogo.
 */
export function useFinalGradeFlow({
  projectId,
  courseId,
  target,
  versions,
}: FinalGradeFlowOptions) {
  const queryClient = useQueryClient();
  const finalGrades = useFinalGrades(projectId);
  const assign = useAssignFinalGrade(projectId, courseId);
  // El foco va al primer campo con error a mano (`reveal`): el bloque puede estar fuera de vista.
  const form = useForm<FinalGradeFormValues>({
    resolver: zodResolver(finalGradeSchema),
    shouldFocusError: false,
  });
  const [selectedId, setSelectedId] = useState("");
  const [confirming, setConfirming] = useState<FinalGradeFormValues | null>(null);
  const [error, setError] = useState<ConfirmError | null>(null);
  // Ref y no estado: un doble clic llega antes de que React vuelva a pintar el botón deshabilitado.
  const sending = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  /** Bloque del formulario: adonde lleva la barra si falta escribir algo. */
  const blockRef = useRef<HTMLElement>(null);
  /** Indicador de estado: recibe el foco si el botón que abrió el diálogo ya no existe. */
  const statusRef = useRef<HTMLElement>(null);

  const key = target
    ? target.kind === "group"
      ? `group:${target.groupId}`
      : `student:${target.studentId}`
    : "";
  // Otro estudiante o grupo: se empieza de cero, como cuando el panel se montaba con su key.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` es el disparador.
  useEffect(() => {
    form.reset({ comment: "", score: undefined });
    setSelectedId("");
    setConfirming(null);
    setError(null);
  }, [key]);

  const grade = target ? findGrade(finalGrades.data, target) : undefined;
  const status: FinalGradeStatus = !target
    ? "none"
    : finalGrades.isLoading
      ? "loading"
      : grade
        ? "graded"
        : finalGrades.isError
          ? "error"
          : "pending";

  const latest = versions.at(-1);
  // Solo se envía una versión del hilo que se está calificando (por omisión, la última).
  const versionId = versions.some((v) => v.id === selectedId) ? selectedId : (latest?.id ?? "");

  /** Lleva al bloque del formulario y pone el foco en un campo, esté donde esté la página. */
  const reveal = (field: keyof FinalGradeFormValues) => {
    const block = blockRef.current;
    if (!block) return;
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    block.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    block.querySelector<HTMLElement>(`[name="${field}"]`)?.focus({ preventScroll: true });
  };

  /**
   * Abre la confirmación si el formulario es válido; si no, lleva al campo que falta. Desde la
   * barra y con el formulario vacío no marca errores: el docente todavía no ha escrito nada.
   */
  const request = (from: HTMLElement | null, source: "bar" | "form") => {
    if (status !== "pending" || versions.length === 0) return;
    opener.current = from;
    const { comment, score } = form.getValues();
    if (source === "bar" && !comment?.trim() && `${score ?? ""}` === "") {
      reveal("comment");
      return;
    }
    form.handleSubmit(
      (values) => {
        setError(null);
        setConfirming(values);
      },
      (errors) => reveal(errors.comment ? "comment" : "score"),
    )();
  };

  /** «Confirmar calificación final»: la única vía por la que sale la petición. */
  const submit = () => {
    if (!target || !confirming || sending.current) return;
    sending.current = true;
    setError(null);
    const studentId = target.kind === "student" && target.inGroup ? target.studentId : undefined;
    assign.mutate(
      { ...confirming, version_id: versionId, ...(studentId ? { student_id: studentId } : {}) },
      {
        onSuccess: (created) => {
          // El indicador cambia ya; las consultas invalidadas lo confirman con el servidor.
          queryClient.setQueryData<FeedbackResponse[]>(
            feedbackKeys.finalGrades(projectId),
            (old) => [...(old ?? []), ...created],
          );
          queryClient.invalidateQueries({ queryKey: versionKeys.project(projectId) });
          toast.success("Calificación final registrada");
          form.reset({ comment: "", score: undefined });
          setConfirming(null);
        },
        onError: (cause) => {
          const apiError = toApiError(cause);
          if (apiError.kind === "conflict") {
            // Ya se había registrado (otra pestaña u otro dispositivo): se muestra la que existe.
            queryClient.invalidateQueries({ queryKey: feedbackKeys.finalGrades(projectId) });
            queryClient.invalidateQueries({ queryKey: feedbackKeys.project(projectId) });
            setError({
              conflict: true,
              message:
                target.kind === "group"
                  ? "Este grupo ya tiene una calificación final registrada."
                  : "Este estudiante ya tiene una calificación final registrada.",
            });
            return;
          }
          // Sin conexión o 5xx: "No se pudo conectar con el servidor. Intenta de nuevo."; 422: el
          // `detail` del backend.
          setError({ conflict: false, message: apiError.message });
        },
        onSettled: () => {
          sending.current = false;
        },
      },
    );
  };

  /** Cancelar, Esc o clic fuera: cierra sin enviar y conserva lo escrito. */
  const cancel = () => {
    if (sending.current) return;
    setConfirming(null);
    setError(null);
  };

  /** Al cerrar, el foco vuelve a quien abrió el diálogo o, si ya no está, al indicador. */
  const restoreFocus = () => {
    const from = opener.current;
    opener.current = null;
    (from?.isConnected ? from : statusRef.current)?.focus();
  };

  return {
    target,
    versions,
    latest,
    versionId,
    selectVersion: setSelectedId,
    grade,
    status,
    retry: () => finalGrades.refetch(),
    form,
    errors: form.formState.errors,
    request,
    confirming,
    error,
    pending: assign.isPending,
    submit,
    cancel,
    restoreFocus,
    blockRef,
    statusRef,
  };
}

export type FinalGradeFlow = ReturnType<typeof useFinalGradeFlow>;
