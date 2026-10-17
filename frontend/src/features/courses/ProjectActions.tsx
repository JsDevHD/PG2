import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useVersions } from "@/features/projects/hooks";
import { toApiError } from "@/lib/errors";
import { cn, pluralize } from "@/lib/utils";
import type { CourseResponse, ProjectResponse } from "@/types/api";
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useDeleteProject, useUpdateProject } from "./hooks";

interface ProjectActionsProps {
  course: CourseResponse;
  project: ProjectResponse;
  /** Tras eliminar (p. ej. volver al curso si se estaba dentro del proyecto). */
  onDeleted?: () => void;
  className?: string;
}

/**
 * Acciones del docente sobre un proyecto: editar, ocultar o mostrar, y eliminar. Eliminar solo es
 * posible sin versiones: con versiones hay evidencia académica que no se borra (RNF-08) y se ofrece
 * ocultarlo en su lugar.
 */
export function ProjectActions({ course, project, onDeleted, className }: ProjectActionsProps) {
  const update = useUpdateProject(course.id, project.id);
  const [confirming, setConfirming] = useState(false);

  const toggleHidden = () =>
    update.mutate(
      { hidden: !project.hidden },
      {
        onSuccess: (saved) =>
          toast.success(saved.hidden ? "Proyecto oculto" : "Proyecto visible", {
            description: saved.hidden
              ? "Los estudiantes ya no lo ven."
              : "Los estudiantes ya pueden verlo.",
          }),
        onError: (error) => toast.error(toApiError(error).message),
      },
    );

  return (
    <div className={cn("flex flex-wrap gap-0.5", className)}>
      <Button asChild variant="ghost" size="sm" className="px-2">
        <Link to={`/courses/${course.id}/projects/${project.id}/edit`}>
          <Pencil aria-hidden />
          Editar
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="px-2"
        loading={update.isPending}
        onClick={toggleHidden}
      >
        {project.hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
        {project.hidden ? "Mostrar" : "Ocultar"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="px-2 text-danger-ink hover:bg-danger-soft"
        onClick={() => setConfirming(true)}
      >
        <Trash2 aria-hidden />
        Eliminar
      </Button>
      {confirming && (
        <DeleteProjectDialog
          course={course}
          project={project}
          onClose={() => setConfirming(false)}
          onHide={() => {
            setConfirming(false);
            if (!project.hidden) toggleHidden();
          }}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}

function DeleteProjectDialog({
  course,
  project,
  onClose,
  onHide,
  onDeleted,
}: {
  course: CourseResponse;
  project: ProjectResponse;
  onClose: () => void;
  onHide: () => void;
  onDeleted?: () => void;
}) {
  // Todas las versiones del proyecto (el docente las ve todas): decide si se puede eliminar.
  const versions = useVersions(project.id);
  const remove = useDeleteProject(course.id);
  const count = versions.data?.length ?? 0;

  const confirm = () =>
    remove.mutate(project.id, {
      onSuccess: () => {
        toast.success("Proyecto eliminado", { description: project.title });
        onClose();
        onDeleted?.();
      },
      // 409 si alguien subió una versión mientras el diálogo estaba abierto.
      onError: (error) => toast.error(toApiError(error).message),
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Eliminar «${project.title}»`}
        description={
          count > 0
            ? "Este proyecto ya tiene entregas, así que no se puede eliminar."
            : "Se elimina el proyecto y los grupos que se hayan formado. No se puede deshacer."
        }
      >
        {versions.isLoading ? (
          <Skeleton className="h-16" />
        ) : count > 0 ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              Tiene {pluralize(count, "versión", "versiones")} con su retroalimentación. Son
              evidencia académica de los estudiantes y no se borran. Si ya no lo necesitas,{" "}
              <strong>ocúltalo</strong>: los estudiantes dejan de verlo y todo se conserva.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              {!project.hidden && (
                <Button onClick={onHide}>
                  <EyeOff aria-hidden />
                  Ocultar en su lugar
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="destructive" loading={remove.isPending} onClick={confirm}>
              <Trash2 aria-hidden />
              Eliminar proyecto
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
