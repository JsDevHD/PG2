import { PageHeader, SectionTitle } from "@/components/layout/PageHeader";
import { EmptyState, ErrorState } from "@/components/layout/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { listProjects } from "@/features/courses/api";
import { courseKeys, useCourses } from "@/features/courses/hooks";
import { toApiError } from "@/lib/errors";
import { cn, pluralize } from "@/lib/utils";
import type { CourseResponse, ProjectResponse } from "@/types/api";
import { useQueries } from "@tanstack/react-query";
import { Check, FileDown, FolderOpen, Minus, Users } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useExportStudentPortfolio } from "./hooks";

/** Casilla nativa con estado "parcial" (algunos proyectos del curso elegidos). */
function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  hint,
  strong = false,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  strong?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label
      htmlFor={id}
      className="flex min-h-9 cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-ink/[0.03] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink"
    >
      <span className="relative mt-0.5 flex size-5 shrink-0">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer size-5 cursor-pointer appearance-none rounded border border-ink/40 bg-surface checked:border-ink checked:bg-ink indeterminate:border-ink indeterminate:bg-ink"
        />
        {indeterminate ? (
          <Minus
            className="pointer-events-none absolute inset-0 m-auto size-3.5 text-surface"
            aria-hidden
          />
        ) : (
          <Check
            className="pointer-events-none absolute inset-0 m-auto size-3.5 text-surface opacity-0 peer-checked:opacity-100"
            aria-hidden
          />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={cn("break-words text-sm", strong && "font-semibold")}>{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

interface CourseWithProjects {
  course: CourseResponse;
  projects: ProjectResponse[] | undefined;
  isLoading: boolean;
}

/** Portafolio académico: el estudiante elige cursos y proyectos y qué incluir, y descarga un PDF. */
export function PortfolioPage() {
  const courses = useCourses();
  const courseList = courses.data ?? [];
  // Mismas claves que el resto de la app: comparte caché con la barra lateral y los paneles.
  const projectQueries = useQueries({
    queries: courseList.map((course) => ({
      queryKey: courseKeys.projects(course.id),
      queryFn: () => listProjects(course.id),
    })),
  });
  const items: CourseWithProjects[] = courseList.map((course, index) => ({
    course,
    projects: projectQueries[index]?.data,
    isLoading: projectQueries[index]?.isLoading ?? true,
  }));
  const allProjects = items.flatMap((item) => item.projects ?? []);

  // null = todo seleccionado (el caso más común), aunque aún estén cargando proyectos.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const isPicked = (id: string) => picked === null || picked.has(id);
  const selectedIds = allProjects.filter((p) => isPicked(p.id)).map((p) => p.id);
  const [includeFeedback, setIncludeFeedback] = useState(true);
  const [includeGrades, setIncludeGrades] = useState(true);
  const [includeImages, setIncludeImages] = useState(true);
  const exportPdf = useExportStudentPortfolio();

  const setMany = (ids: string[], value: boolean) => {
    const next = new Set(picked ?? allProjects.map((p) => p.id));
    for (const id of ids) {
      if (value) next.add(id);
      else next.delete(id);
    }
    setPicked(next);
  };

  const generate = () =>
    exportPdf.mutate(
      {
        project_ids: selectedIds,
        include_feedback: includeFeedback,
        include_grades: includeGrades,
        include_images: includeImages,
      },
      {
        onSuccess: () => toast.success("Portafolio descargado"),
        onError: (error) => toast.error(toApiError(error).message),
      },
    );

  const coursesWithSelection = items.filter((item) =>
    (item.projects ?? []).some((p) => isPicked(p.id)),
  ).length;
  const loadingProjects = projectQueries.some((q) => q.isLoading);

  return (
    <>
      <PageHeader
        title="Mi portafolio"
        context="Arma un PDF con tus proyectos: de un curso, de varios o de todos."
      />

      {courses.isLoading && <Skeleton className="h-64 max-w-3xl" />}
      {courses.isError && <ErrorState error={courses.error} onRetry={() => courses.refetch()} />}
      {courses.data?.length === 0 && (
        <EmptyState
          icon={FolderOpen}
          title="Aún no estás en ningún curso"
          description="Cuando te unas a un curso y subas versiones, podrás armar tu portafolio aquí."
          action={
            <Button asChild>
              <Link to="/">Unirme a un curso</Link>
            </Button>
          }
        />
      )}

      {courseList.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-labelledby="seleccion">
            <SectionTitle>
              <span id="seleccion">Cursos y proyectos</span>
            </SectionTitle>
            <Card>
              <CardContent className="flex flex-col gap-1">
                <Checkbox
                  strong
                  label="Todos mis cursos y proyectos"
                  checked={allProjects.length > 0 && selectedIds.length === allProjects.length}
                  indeterminate={selectedIds.length > 0 && selectedIds.length < allProjects.length}
                  onChange={(value) => setPicked(value ? null : new Set())}
                />
                <ul className="mt-2 flex flex-col gap-3 border-t border-border pt-3">
                  {items.map(({ course, projects, isLoading }) => {
                    const ids = (projects ?? []).map((p) => p.id);
                    const chosen = ids.filter(isPicked).length;
                    return (
                      <li key={course.id}>
                        <Checkbox
                          strong
                          label={course.name}
                          hint={
                            projects
                              ? pluralize(projects.length, "proyecto", "proyectos")
                              : undefined
                          }
                          checked={ids.length > 0 && chosen === ids.length}
                          indeterminate={chosen > 0 && chosen < ids.length}
                          onChange={(value) => setMany(ids, value)}
                        />
                        {isLoading && <Skeleton className="ml-10 mt-1 h-6 w-48" />}
                        {projects && projects.length === 0 && (
                          <p className="ml-10 text-xs text-muted">
                            Este curso aún no tiene proyectos.
                          </p>
                        )}
                        {projects && projects.length > 0 && (
                          <ul className="ml-7 flex flex-col">
                            {projects.map((project) => (
                              <li key={project.id}>
                                <Checkbox
                                  label={
                                    <span className="inline-flex flex-wrap items-center gap-1.5">
                                      {project.title}
                                      {project.work_mode === "group" && (
                                        <Badge>
                                          <Users aria-hidden />
                                          Grupal
                                        </Badge>
                                      )}
                                    </span>
                                  }
                                  checked={isPicked(project.id)}
                                  onChange={(value) => setMany([project.id], value)}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </section>

          <aside aria-labelledby="opciones" className="flex flex-col gap-4">
            <SectionTitle>
              <span id="opciones">Qué incluir</span>
            </SectionTitle>
            <Card>
              <CardContent className="flex flex-col gap-1">
                <Checkbox
                  label="Comentarios del docente"
                  hint="La retroalimentación de cada versión."
                  checked={includeFeedback}
                  onChange={setIncludeFeedback}
                />
                <Checkbox
                  label="Calificaciones"
                  hint="Notas parciales vigentes y calificación final."
                  checked={includeGrades}
                  onChange={setIncludeGrades}
                />
                <Checkbox
                  label="Imágenes de las versiones"
                  hint="Sin ellas el PDF pesa mucho menos. Los PDF y SVG siempre se listan por nombre."
                  checked={includeImages}
                  onChange={setIncludeImages}
                />
              </CardContent>
            </Card>
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
              <p className="text-sm" aria-live="polite">
                {selectedIds.length === 0
                  ? "Elige al menos un proyecto."
                  : `${pluralize(selectedIds.length, "proyecto", "proyectos")} de ${pluralize(coursesWithSelection, "curso", "cursos")}.`}
              </p>
              <Button
                onClick={generate}
                loading={exportPdf.isPending}
                disabled={selectedIds.length === 0 || loadingProjects}
                className="w-full"
              >
                <FileDown aria-hidden />
                {exportPdf.isPending ? "Generando PDF…" : "Generar portafolio en PDF"}
              </Button>
              <p className="text-xs text-muted">
                En los proyectos por grupos se incluyen las versiones de tu grupo y solo tu
                calificación final.
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
