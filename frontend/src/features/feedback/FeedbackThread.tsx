import { EmptyState, ErrorState } from "@/components/layout/States";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserNames } from "@/features/auth/useUserNames";
import { cn, formatDateTime, formatRelative, formatScore } from "@/lib/utils";
import type { FeedbackResponse } from "@/types/api";
import { Award, ChevronDown, MessageSquare } from "lucide-react";
import { useId, useState } from "react";
import { currentPartialGrade, useFeedback } from "./hooks";

function ScorePill({ feedback }: { feedback: FeedbackResponse }) {
  if (feedback.score === null) return null; // comentario sin calificación
  if (feedback.score_replaced) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-3 py-1 text-xs font-semibold text-muted">
        Calificación reemplazada:
        <s className="tabular-nums">{formatScore(feedback.score)} / 5.0</s>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
        feedback.is_final ? "bg-shared-ink text-surface" : "bg-shared-soft text-shared-ink",
      )}
    >
      {feedback.is_final && <Award className="size-3.5" aria-hidden />}
      {feedback.is_final ? "Calificación final" : "Calificación parcial"}:
      <span className="tabular-nums">{formatScore(feedback.score)} / 5.0</span>
    </span>
  );
}

/** Un comentario más largo que esto (o con muchas líneas) se muestra recortado. */
const COLLAPSED_CHARS = 600;
const COLLAPSED_LINES = 8;

function CommentText({ text }: { text: string }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > COLLAPSED_CHARS || text.split("\n").length > COLLAPSED_LINES;
  return (
    <div className="flex flex-col gap-1.5">
      <p
        id={id}
        className={cn(
          "whitespace-pre-line break-words text-sm leading-relaxed",
          isLong && !expanded && "line-clamp-6",
        )}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={id}
          className="inline-flex w-fit items-center gap-1 rounded-md text-sm font-semibold text-ink underline-offset-4 hover:underline"
        >
          {expanded ? "Ver menos" : "Ver comentario completo"}
          <ChevronDown
            className={cn("size-4 transition-transform", expanded && "rotate-180")}
            aria-hidden
          />
        </button>
      )}
    </div>
  );
}

/** Retroalimentación de una versión en orden cronológico (RF-06). */
export function FeedbackThread({ versionId }: { versionId: string }) {
  const feedback = useFeedback(versionId);
  const { nameOf } = useUserNames((feedback.data ?? []).map((item) => item.teacher_id));

  if (feedback.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-28" />
      </div>
    );
  }
  if (feedback.isError)
    return <ErrorState error={feedback.error} onRetry={() => feedback.refetch()} />;
  if (!feedback.data?.length) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Sin retroalimentación todavía"
        description="Cuando el docente revise esta versión, sus comentarios aparecerán aquí."
      />
    );
  }

  const current = currentPartialGrade(feedback.data);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {current ? (
          <>
            Calificación parcial vigente:{" "}
            <strong className="tabular-nums text-ink">
              {formatScore(current.score ?? 0)} / 5.0
            </strong>
          </>
        ) : (
          "Esta versión aún no tiene calificación parcial."
        )}
      </p>
      <ol className="flex flex-col gap-3">
        {feedback.data.map((item) => {
          const teacher = nameOf(item.teacher_id, "Docente");
          return (
            <li
              key={item.id}
              className={cn(
                "flex flex-col gap-3 rounded-lg border bg-surface p-4 shadow-sm",
                item.is_final ? "border-shared" : "border-border",
              )}
            >
              <div className="flex items-center gap-3">
                <Avatar name={teacher} userRole="docente" className="size-8" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{teacher}</p>
                  <p className="text-xs text-muted">
                    <time dateTime={item.created_at} title={formatDateTime(item.created_at)}>
                      {formatRelative(item.created_at)}
                    </time>
                  </p>
                </div>
              </div>
              <CommentText text={item.comment} />
              {item.score !== null && (
                <div>
                  <ScorePill feedback={item} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
