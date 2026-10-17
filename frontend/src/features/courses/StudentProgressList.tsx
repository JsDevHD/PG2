import { Avatar } from "@/components/ui/avatar";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatPercent, pluralize } from "@/lib/utils";
import type { StudentProgressItem } from "@/types/api";

function statusText(student: StudentProgressItem): string {
  if (student.versions_count === 0) return "Sin versiones subidas";
  const pending = student.versions_count - student.versions_with_feedback;
  if (pending === 0) return "Todo revisado";
  return `${pluralize(pending, "versión pendiente", "versiones pendientes")} de revisión`;
}

/** Progreso por estudiante (RF-08). El cálculo lo hace Projects Service; aquí solo se muestra. */
export function StudentProgressList({
  students,
  limit,
}: { students: StudentProgressItem[]; limit?: number }) {
  const shown = limit ? students.slice(0, limit) : students;
  return (
    <>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        {shown.map((student) => {
          const name = student.student_name ?? "Nombre no disponible";
          return (
            <li
              key={student.student_id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={name} userRole="estudiante" />
                <div className="min-w-0">
                  <p
                    className={
                      student.student_name
                        ? "truncate font-semibold"
                        : "truncate font-semibold text-muted"
                    }
                  >
                    {name}
                  </p>
                  <p className="text-sm text-muted">
                    {pluralize(student.versions_count, "versión", "versiones")}.{" "}
                    {statusText(student)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:w-56">
                <ProgressBar
                  value={student.progress_percentage}
                  label={`Progreso de ${name}`}
                  tone="student"
                />
                <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {formatPercent(student.progress_percentage)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {limit && students.length > limit && (
        <p className="mt-2 text-sm text-muted">
          y {pluralize(students.length - limit, "estudiante más", "estudiantes más")}.
        </p>
      )}
    </>
  );
}
