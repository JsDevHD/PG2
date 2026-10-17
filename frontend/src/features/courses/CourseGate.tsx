import { EmptyState, ErrorState } from "@/components/layout/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CourseResponse, ProjectResponse } from "@/types/api";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useCourse, useProject } from "./hooks";

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy aria-label="Cargando">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-4 h-40 w-full" />
    </div>
  );
}

function NoAccess({ what }: { what: "curso" | "proyecto" }) {
  return (
    <EmptyState
      icon={Lock}
      title={`No tienes acceso a este ${what}.`}
      description={
        what === "curso"
          ? "Pide al docente el código del curso para unirte."
          : "Puede que el proyecto ya no exista o no sea de tu curso."
      }
      action={
        <Button asChild variant="secondary">
          <Link to="/">Ir a mis cursos</Link>
        </Button>
      }
      className="mt-6"
    />
  );
}

/**
 * Resuelve el curso de la URL desde los cursos del usuario. Si no está en su listado, no es
 * miembro (H-6): se muestra "sin acceso", nunca un 404 que oculte la causa.
 */
export function CourseGate({
  courseId,
  children,
}: { courseId: string; children: (course: CourseResponse) => ReactNode }) {
  const { course, isLoading, isError, error, refetch } = useCourse(courseId);
  if (isLoading) return <PageSkeleton />;
  if (isError)
    return (
      <ErrorState
        error={error}
        onRetry={() => refetch()}
        forbiddenMessage="No tienes acceso a este curso."
      />
    );
  if (!course) return <NoAccess what="curso" />;
  return <>{children(course)}</>;
}

export function ProjectGate({
  courseId,
  projectId,
  children,
}: {
  courseId: string;
  projectId: string;
  children: (course: CourseResponse, project: ProjectResponse) => ReactNode;
}) {
  const projectQuery = useProject(courseId, projectId);
  return (
    <CourseGate courseId={courseId}>
      {(course) => {
        if (projectQuery.isLoading) return <PageSkeleton />;
        if (projectQuery.isError)
          return (
            <ErrorState
              error={projectQuery.error}
              onRetry={() => projectQuery.refetch()}
              forbiddenMessage="No tienes acceso a este curso."
            />
          );
        if (!projectQuery.project) return <NoAccess what="proyecto" />;
        return children(course, projectQuery.project);
      }}
    </CourseGate>
  );
}
