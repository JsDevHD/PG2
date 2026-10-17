import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/features/auth/AuthContext";
import { useCourseProjects, useCourses } from "@/features/courses/hooks";
import { cn, initials } from "@/lib/utils";
import type { CourseResponse, Role } from "@/types/api";
import { BarChart3, EyeOff, FileDown, FolderOpen, Home, LogOut, Plus } from "lucide-react";
import { Link, NavLink, useMatch } from "react-router-dom";
import { SidebarLegal } from "./SiteFooter";

const roleLabel = { docente: "Docente", estudiante: "Estudiante" } as const;

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
    isActive
      ? "bg-ink/[0.07] font-semibold text-ink"
      : "text-ink/75 hover:bg-ink/[0.04] hover:text-ink",
  );
}

function CourseProjects({
  course,
  role,
  onNavigate,
}: { course: CourseResponse; role: Role; onNavigate?: () => void }) {
  const projects = useCourseProjects(course.id);
  const base = `/courses/${course.id}`;

  return (
    <div className="ml-[22px] mt-1 flex flex-col gap-0.5 border-l border-border pl-3">
      {projects.isLoading && <Skeleton className="my-1 h-6 w-36" />}
      {projects.data?.map((project) => (
        <NavLink
          key={project.id}
          to={`${base}/projects/${project.id}/versions`}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "truncate rounded-md px-2 py-1.5 text-sm transition-colors",
              isActive
                ? "bg-ink/[0.07] font-semibold text-ink"
                : "text-ink/70 hover:bg-ink/[0.04] hover:text-ink",
            )
          }
        >
          {project.hidden ? (
            <span className="flex items-center gap-1.5 text-ink/50">
              <EyeOff className="size-3.5 shrink-0" aria-label="Oculto para los estudiantes" />
              <span className="truncate">{project.title}</span>
            </span>
          ) : (
            project.title
          )}
        </NavLink>
      ))}
      {projects.data?.length === 0 && (
        <p className="px-2 py-1.5 text-xs text-muted">Sin proyectos todavía</p>
      )}
      {role === "docente" && (
        <>
          <NavLink to={`${base}/projects/new`} onClick={onNavigate} className={navClass}>
            <Plus className="size-4" aria-hidden />
            Crear proyecto
          </NavLink>
          <NavLink to={`${base}/progress`} onClick={onNavigate} className={navClass}>
            <BarChart3 className="size-4" aria-hidden />
            Progreso del curso
          </NavLink>
        </>
      )}
    </div>
  );
}

interface AppSidebarProps {
  onSignOut: () => void;
  /** Para cerrar el panel en celular al navegar. */
  onNavigate?: () => void;
}

/**
 * Navegación lateral: los cursos del usuario y, dentro del curso abierto, sus proyectos.
 * En escritorio es una columna fija; en celular se abre como panel desde el menú.
 */
export function AppSidebar({ onSignOut, onNavigate }: AppSidebarProps) {
  const user = useCurrentUser();
  const courses = useCourses();
  const activeCourseId = useMatch("/courses/:courseId/*")?.params.courseId;
  const roleTone =
    user.role === "docente"
      ? "bg-teacher-soft text-teacher-ink"
      : "bg-student-soft text-student-ink";

  return (
    <nav aria-label="Navegación principal" className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <NavLink to="/" end onClick={onNavigate} className={navClass}>
          <Home className="size-4" aria-hidden />
          Inicio
        </NavLink>
        {user.role === "estudiante" && (
          <NavLink to="/portafolio" onClick={onNavigate} className={navClass}>
            <FileDown className="size-4" aria-hidden />
            Mi portafolio
          </NavLink>
        )}

        <div className="mb-2 mt-6 flex items-center justify-between px-2.5">
          <h2 className="text-xs font-semibold text-muted">Mis cursos</h2>
          <Link
            to="/"
            onClick={onNavigate}
            className="-mr-1.5 flex size-7 items-center justify-center rounded-md text-muted hover:bg-ink/5 hover:text-ink"
            aria-label={user.role === "docente" ? "Crear curso" : "Unirme a un curso"}
            title={user.role === "docente" ? "Crear curso" : "Unirme a un curso"}
          >
            <Plus className="size-4" aria-hidden />
          </Link>
        </div>

        {courses.isLoading && (
          <div className="flex flex-col gap-2 px-2.5">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        )}
        {courses.data?.length === 0 && (
          <p className="flex items-start gap-2 px-2.5 text-sm text-muted">
            <FolderOpen className="mt-0.5 size-4 shrink-0" aria-hidden />
            {user.role === "docente"
              ? "Crea tu primer curso desde Inicio."
              : "Únete a un curso desde Inicio."}
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {courses.data?.map((course) => {
            const active = course.id === activeCourseId;
            return (
              <li key={course.id}>
                <Link
                  to={`/courses/${course.id}`}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                    active ? "bg-ink/[0.07] font-semibold" : "text-ink/80 hover:bg-ink/[0.04]",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                      roleTone,
                    )}
                  >
                    {initials(course.name)}
                  </span>
                  <span className="truncate">{course.name}</span>
                </Link>
                {active && (
                  <CourseProjects course={course} role={user.role} onNavigate={onNavigate} />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <SidebarLegal onNavigate={onNavigate} />
      <div className="flex items-center gap-3 border-t border-border px-4 py-3">
        <Avatar name={user.name} userRole={user.role} className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="text-xs text-muted">{roleLabel[user.role]}</p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-md p-2 text-muted transition-colors hover:bg-ink/5 hover:text-ink"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </nav>
  );
}
