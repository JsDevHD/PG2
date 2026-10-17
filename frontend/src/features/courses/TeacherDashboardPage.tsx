import { PageHeader, SectionTitle } from "@/components/layout/PageHeader";
import { EmptyState, ErrorState } from "@/components/layout/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate, pluralize } from "@/lib/utils";
import type { CourseResponse, ProjectResponse } from "@/types/api";
import { ChevronRight, EyeOff, FolderOpen, Plus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { CourseCode } from "./CourseCode";
import { CourseGate } from "./CourseGate";
import { ProjectActions } from "./ProjectActions";
import { StudentProgressList } from "./StudentProgressList";
import { isTeacherProgress, useCourseProjects, useProgress } from "./hooks";

function ProjectCard({ course, project }: { course: CourseResponse; project: ProjectResponse }) {
  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-lg border bg-surface shadow-sm transition-colors",
        project.hidden ? "border-dashed border-ink/25" : "border-border hover:border-ink/30",
      )}
    >
      <Link
        to={`/courses/${course.id}/projects/${project.id}/versions`}
        className="group flex flex-1 flex-col gap-2 rounded-t-lg p-4"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="font-semibold leading-snug">{project.title}</span>
          <ChevronRight
            className="mt-0.5 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
        {project.hidden && (
          <span>
            <Badge tone="warning">
              <EyeOff aria-hidden />
              Oculto para los estudiantes
            </Badge>
          </span>
        )}
        {project.work_mode === "group" && (
          <span className="flex flex-wrap gap-1.5">
            <Badge tone="teacher">
              <Users aria-hidden />
              Grupos de {project.group_min_size} a {project.group_max_size}
            </Badge>
            <Badge>Nota {project.grading_mode === "group" ? "por grupo" : "individual"}</Badge>
          </span>
        )}
        {project.description && (
          <span className="line-clamp-2 break-words text-sm text-muted">{project.description}</span>
        )}
        <span className="mt-auto pt-1 text-xs text-muted">
          Creado el {formatDate(project.created_at)}
        </span>
      </Link>
      <ProjectActions
        course={course}
        project={project}
        className="border-t border-border px-2 py-1.5"
      />
    </div>
  );
}

function TeacherDashboard({ course }: { course: CourseResponse }) {
  const projects = useCourseProjects(course.id);
  const progress = useProgress(course.id);
  const teacherProgress =
    progress.data && isTeacherProgress(progress.data) ? progress.data : undefined;

  return (
    <>
      <PageHeader
        title={course.name}
        back={{ to: "/", label: "Mis cursos" }}
        context={
          <>
            <span>Código para tus estudiantes</span>
            <CourseCode code={course.course_code} />
          </>
        }
        actions={
          <Button asChild>
            <Link to={`/courses/${course.id}/projects/new`}>
              <Plus aria-hidden />
              Crear proyecto
            </Link>
          </Button>
        }
      />

      <section aria-labelledby="proyectos" className="mb-10">
        <SectionTitle>
          <span id="proyectos">Proyectos del curso</span>
        </SectionTitle>
        {projects.isLoading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        )}
        {projects.isError && (
          <ErrorState error={projects.error} onRetry={() => projects.refetch()} />
        )}
        {projects.data?.length === 0 && (
          <EmptyState
            icon={FolderOpen}
            title="Este curso aún no tiene proyectos"
            description="Crea el primero para que tus estudiantes empiecen a subir versiones."
            action={
              <Button asChild>
                <Link to={`/courses/${course.id}/projects/new`}>Crear proyecto</Link>
              </Button>
            }
          />
        )}
        {projects.data && projects.data.length > 0 && (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.data.map((project) => (
              <li key={project.id}>
                <ProjectCard course={course} project={project} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="progreso">
        <SectionTitle
          aside={
            teacherProgress && teacherProgress.students.length > 0 ? (
              <Link
                to={`/courses/${course.id}/progress`}
                className="text-sm font-semibold text-ink underline-offset-4 hover:underline"
              >
                Ver detalle
              </Link>
            ) : undefined
          }
        >
          <span id="progreso">Progreso de estudiantes</span>
        </SectionTitle>
        {progress.isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}
        {progress.isError && (
          <ErrorState error={progress.error} onRetry={() => progress.refetch()} />
        )}
        {teacherProgress && teacherProgress.students.length === 0 && (
          <EmptyState
            icon={Users}
            title="Aún no hay estudiantes inscritos"
            description={
              <>
                Comparte el código{" "}
                <span className="font-mono font-semibold">{course.course_code}</span> para que se
                unan.
              </>
            }
          />
        )}
        {teacherProgress && teacherProgress.students.length > 0 && (
          <>
            <p className="mb-3 text-sm text-muted">
              {pluralize(
                teacherProgress.versions_with_feedback,
                "versión revisada",
                "versiones revisadas",
              )}{" "}
              de {teacherProgress.versions_count} en todo el curso.
            </p>
            <StudentProgressList students={teacherProgress.students} limit={6} />
          </>
        )}
      </section>
    </>
  );
}

/** Mockup 03_dashboard_docente.png. */
export function TeacherDashboardPage({ courseId }: { courseId: string }) {
  return (
    <CourseGate courseId={courseId}>{(course) => <TeacherDashboard course={course} />}</CourseGate>
  );
}
