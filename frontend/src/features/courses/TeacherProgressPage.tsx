import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState, ErrorState } from "@/components/layout/States";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent } from "@/lib/utils";
import type { CourseResponse } from "@/types/api";
import { Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CourseCode } from "./CourseCode";
import { CourseGate } from "./CourseGate";
import { StudentProgressList } from "./StudentProgressList";
import { isTeacherProgress, useProgress } from "./hooks";

type SortKey = "progress-asc" | "progress-desc" | "name";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xl font-bold tabular-nums tracking-tight">{value}</span>
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}

function TeacherProgress({ course }: { course: CourseResponse }) {
  const progress = useProgress(course.id);
  const [sort, setSort] = useState<SortKey>("progress-asc");
  const data = progress.data && isTeacherProgress(progress.data) ? progress.data : undefined;

  const students = useMemo(() => {
    const list = [...(data?.students ?? [])];
    if (sort === "name")
      list.sort((a, b) => (a.student_name ?? "").localeCompare(b.student_name ?? "", "es"));
    else
      list.sort(
        (a, b) =>
          (sort === "progress-asc" ? 1 : -1) * (a.progress_percentage - b.progress_percentage),
      );
    return list;
  }, [data, sort]);

  return (
    <>
      <PageHeader
        title="Progreso del curso"
        back={{ to: `/courses/${course.id}`, label: course.name }}
        context={
          <>
            <span>{course.name}</span>
            <CourseCode code={course.course_code} />
          </>
        }
      />
      {progress.isLoading && <Skeleton className="h-64 w-full" />}
      {progress.isError && <ErrorState error={progress.error} onRetry={() => progress.refetch()} />}
      {data && (
        <>
          <Card className="mb-6">
            <CardContent className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Stat value={formatPercent(data.progress_percentage)} label="Progreso del curso" />
              <Stat value={String(data.students.length)} label="Estudiantes" />
              <Stat value={String(data.versions_count)} label="Versiones subidas" />
              <Stat
                value={String(data.versions_count - data.versions_with_feedback)}
                label="Pendientes de revisión"
              />
            </CardContent>
          </Card>
          {data.students.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Aún no hay estudiantes inscritos"
              description={`Comparte el código ${course.course_code} para que se unan.`}
            />
          ) : (
            <>
              <div className="mb-3 flex items-center justify-end gap-2">
                <label htmlFor="orden" className="text-sm text-muted">
                  Ordenar por
                </label>
                <Select
                  id="orden"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                  className="h-9 w-auto"
                >
                  <option value="progress-asc">Menor progreso primero</option>
                  <option value="progress-desc">Mayor progreso primero</option>
                  <option value="name">Nombre</option>
                </Select>
              </div>
              <StudentProgressList students={students} />
            </>
          )}
        </>
      )}
    </>
  );
}

export function TeacherProgressPage() {
  const { courseId = "" } = useParams();
  return (
    <CourseGate courseId={courseId}>{(course) => <TeacherProgress course={course} />}</CourseGate>
  );
}
