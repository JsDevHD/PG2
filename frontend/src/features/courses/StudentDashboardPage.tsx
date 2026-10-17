import { PageHeader, SectionTitle } from "@/components/layout/PageHeader";
import { EmptyState, ErrorState } from "@/components/layout/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/features/auth/AuthContext";
import { useFinalGrades, useProjectFeedback } from "@/features/feedback/hooks";
import { useGroups, useVersions } from "@/features/projects/hooks";
import { groupOf, groupsOpen, isGroupProject } from "@/lib/groups";
import { formatDateTime, formatPercent, formatScore, pluralize } from "@/lib/utils";
import type { CourseResponse, ProjectResponse } from "@/types/api";
import { Award, FolderOpen, History, Upload, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { CourseGate } from "./CourseGate";
import { isStudentProgress, useCourseProjects, useProgress } from "./hooks";

function ProjectRow({ course, project }: { course: CourseResponse; project: ProjectResponse }) {
  const user = useCurrentUser();
  const byGroups = isGroupProject(project);
  const groups = useGroups(project.id, byGroups);
  const myGroup = groupOf(groups.data, user.id);
  const needsGroup = byGroups && groups.data !== undefined && !myGroup;
  const versions = useVersions(project.id);
  const feedback = useProjectFeedback(project.id);
  const finalGrades = useFinalGrades(project.id);

  const total = versions.data?.length ?? 0;
  const reviewed = new Set((feedback.data ?? []).map((item) => item.version_id)).size;
  const finalGrade = finalGrades.data?.[0];
  const loading = versions.isLoading || feedback.isLoading;
  const base = `/courses/${course.id}/projects/${project.id}`;

  let status = <Badge>Sin versiones aún</Badge>;
  if (needsGroup) {
    status = <Badge tone="warning">Sin grupo</Badge>;
  } else if (finalGrade) {
    status = (
      <Badge tone="shared">
        <Award aria-hidden />
        Calificación final {formatScore(finalGrade.score ?? 0)}
      </Badge>
    );
  } else if (total > 0 && reviewed < total) {
    status = <Badge tone="warning">Pendiente de revisión</Badge>;
  } else if (total > 0) {
    status = <Badge tone="shared">Retroalimentación recibida</Badge>;
  }

  return (
    <li className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5 md:flex-row md:items-center md:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold leading-snug">{project.title}</h3>
          {!loading && status}
          {myGroup && (
            <Badge tone="student">
              <Users aria-hidden />
              {myGroup.name}
            </Badge>
          )}
        </div>
        {project.description && (
          <p className="line-clamp-2 max-w-2xl break-words text-sm text-ink/80">
            {project.description}
          </p>
        )}
        {loading ? (
          <Skeleton className="h-4 w-48" />
        ) : (
          <p className="text-sm text-muted">
            {needsGroup
              ? groupsOpen(project)
                ? `Proyecto por grupos: únete a uno antes del ${formatDateTime(project.group_deadline ?? "")}.`
                : "El plazo para formar grupos terminó: pídele a tu docente que lo amplíe."
              : total === 0
                ? byGroups
                  ? "Tu grupo aún no ha subido versiones."
                  : "Sube la primera versión cuando la tengas lista."
                : `${pluralize(total, "versión subida", "versiones subidas")}, ${reviewed} con retroalimentación`}
          </p>
        )}
        {/* Sin porcentaje por proyecto: la fórmula de progreso (RF-08) es de Projects Service,
            que solo la expone por curso. Aquí se muestran solo los conteos. */}
      </div>
      <div className="grid grid-cols-2 gap-2 md:flex">
        <Button asChild variant="secondary">
          <Link to={`${base}/versions`}>
            <History aria-hidden />
            Ver historial
          </Link>
        </Button>
        {needsGroup ? (
          <Button asChild>
            <Link to={`${base}/groups`}>
              <Users aria-hidden />
              Elegir grupo
            </Link>
          </Button>
        ) : finalGrade ? (
          <Button variant="primary" disabled title="Ya tienes calificación final en este proyecto">
            <Upload aria-hidden />
            Subir versión
          </Button>
        ) : (
          <Button asChild>
            <Link to={`${base}/upload`}>
              <Upload aria-hidden />
              Subir versión
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}

function StudentDashboard({ course }: { course: CourseResponse }) {
  const projects = useCourseProjects(course.id);
  const progress = useProgress(course.id);
  const mine = progress.data && isStudentProgress(progress.data) ? progress.data : undefined;

  return (
    <>
      <PageHeader
        title={course.name}
        back={{ to: "/", label: "Mis cursos" }}
        context="Tus proyectos de este curso."
      />

      <Card className="mb-8">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-semibold">Tu progreso general</h2>
            {mine && (
              <span className="text-2xl font-bold tabular-nums tracking-tight">
                {formatPercent(mine.progress_percentage)}
              </span>
            )}
          </div>
          {progress.isLoading && <Skeleton className="h-2 w-full" />}
          {progress.isError && <p className="text-sm text-muted">No se pudo cargar tu progreso.</p>}
          {mine && (
            <>
              <ProgressBar
                value={mine.progress_percentage}
                label="Tu progreso general"
                tone="student"
              />
              <p className="text-sm text-muted">
                {mine.versions_count === 0
                  ? "Cuando subas versiones y tu docente las revise, verás aquí tu avance."
                  : `${mine.versions_with_feedback} de ${pluralize(mine.versions_count, "versión tiene", "versiones tienen")} retroalimentación.`}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="mis-proyectos">
        <SectionTitle>
          <span id="mis-proyectos">Mis proyectos</span>
        </SectionTitle>
        {projects.isLoading && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        )}
        {projects.isError && (
          <ErrorState
            error={projects.error}
            onRetry={() => projects.refetch()}
            forbiddenMessage="No tienes acceso a este curso."
          />
        )}
        {projects.data?.length === 0 && (
          <EmptyState
            icon={FolderOpen}
            title="Tu docente aún no ha creado proyectos"
            description="Cuando lo haga, aparecerán aquí para que subas tus versiones."
          />
        )}
        {projects.data && projects.data.length > 0 && (
          <ul className="flex flex-col gap-3">
            {projects.data.map((project) => (
              <ProjectRow key={project.id} course={course} project={project} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** Mockup 04_dashboard_estudiante.png. */
export function StudentDashboardPage({ courseId }: { courseId: string }) {
  return (
    <CourseGate courseId={courseId}>{(course) => <StudentDashboard course={course} />}</CourseGate>
  );
}
