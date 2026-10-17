import { ContextChip, PageHeader, SectionTitle } from "@/components/layout/PageHeader";
import { EmptyState, ErrorState } from "@/components/layout/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useCurrentUser } from "@/features/auth/AuthContext";
import { useUserNames } from "@/features/auth/useUserNames";
import { ProjectGate } from "@/features/courses/CourseGate";
import { isTeacherProgress, useProgress } from "@/features/courses/hooks";
import { toApiError } from "@/lib/errors";
import {
  fromLocalInput,
  groupFormationWarning,
  groupOf,
  groupsOpen,
  isGroupProject,
  toLocalInput,
} from "@/lib/groups";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";
import type { CourseResponse, GroupResponse, ProjectResponse } from "@/types/api";
import { AlertTriangle, CalendarClock, LogOut, Plus, UserPlus, Users } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useCreateGroup,
  useGroups,
  useJoinGroup,
  useLeaveGroup,
  useUpdateGroupDeadline,
} from "./hooks";

function DeadlineStatus({ project }: { project: ProjectResponse }) {
  const deadline = project.group_deadline ?? "";
  const open = groupsOpen(project);
  return (
    <p className="flex items-start gap-2 text-sm">
      <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      {open ? (
        <span>
          Los grupos se pueden formar hasta el <strong>{formatDateTime(deadline)}</strong> (
          {formatRelative(deadline)}).
        </span>
      ) : (
        <span>
          El plazo para formar grupos terminó el <strong>{formatDateTime(deadline)}</strong>.
        </span>
      )}
    </p>
  );
}

/** El docente amplía el plazo para los rezagados o lo cierra antes. */
function DeadlineForm({ course, project }: { course: CourseResponse; project: ProjectResponse }) {
  const update = useUpdateGroupDeadline(project.id, course.id);
  const [value, setValue] = useState(() => toLocalInput(project.group_deadline ?? new Date()));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!value) return;
    update.mutate(fromLocalInput(value), {
      onSuccess: () => toast.success("Plazo actualizado"),
      onError: (error) => toast.error(toApiError(error).message),
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <Field
        label="Cambiar fecha límite"
        hint="Una fecha pasada cierra la formación de grupos de inmediato."
        className="sm:max-w-xs"
      >
        <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" loading={update.isPending} className="sm:mb-6">
        Guardar plazo
      </Button>
    </form>
  );
}

/** Advertencias para el docente: quién no tiene grupo y qué grupos no llegan al mínimo. */
function TeacherWarnings({
  project,
  groups,
  enrolled,
  nameOf,
}: {
  project: ProjectResponse;
  groups: GroupResponse[];
  enrolled: string[];
  nameOf: (id: string) => string;
}) {
  const min = project.group_min_size ?? 0;
  const max = project.group_max_size ?? 0;
  const grouped = new Set(groups.flatMap((g) => g.member_ids));
  const withoutGroup = enrolled.filter((id) => !grouped.has(id));
  const small = groups.filter((g) => g.member_ids.length < min);
  const formation = groupFormationWarning(enrolled.length, min, max);
  const items = [
    formation,
    withoutGroup.length > 0 &&
      `${withoutGroup.length === 1 ? "1 estudiante no tiene" : `${withoutGroup.length} estudiantes no tienen`} grupo: ${withoutGroup.map(nameOf).join(", ")}.`,
    small.length > 0 &&
      `Por debajo del mínimo de ${min}: ${small.map((g) => `${g.name} (${g.member_ids.length})`).join(", ")}.`,
  ].filter(Boolean) as string[];
  if (items.length === 0) {
    return <p className="text-sm text-muted">Todos los estudiantes inscritos tienen grupo.</p>;
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="Advertencias">
      {items.map((item) => (
        <li
          key={item}
          className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning-ink"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CreateGroupForm({
  course,
  project,
}: { course: CourseResponse; project: ProjectResponse }) {
  const create = useCreateGroup(project.id, course.id);
  const [name, setName] = useState("");

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(name.trim() || undefined, {
      onSuccess: (group) => toast.success("Grupo creado", { description: group.name }),
      onError: (error) => toast.error(toApiError(error).message),
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <Field
        label="Nombre del grupo"
        hint="Opcional. Sin nombre, se numera solo."
        className="flex-1"
      >
        <Input
          value={name}
          maxLength={60}
          placeholder="Los tipógrafos"
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Button type="submit" loading={create.isPending} className="sm:mb-6">
        <Plus aria-hidden />
        Crear grupo
      </Button>
    </form>
  );
}

function GroupCard({
  course,
  project,
  group,
  mine,
  canJoin,
  open,
  nameOf,
}: {
  course: CourseResponse;
  project: ProjectResponse;
  group: GroupResponse;
  mine: boolean;
  canJoin: boolean;
  open: boolean;
  nameOf: (id: string) => string;
}) {
  const join = useJoinGroup(project.id, course.id);
  const leave = useLeaveGroup(project.id, course.id);
  const max = project.group_max_size ?? 0;
  const min = project.group_min_size ?? 0;
  const full = group.member_ids.length >= max;

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-surface p-4 shadow-sm",
        mine ? "border-student ring-1 ring-student" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{group.name}</h3>
        {mine && <Badge tone="student">Tu grupo</Badge>}
        <Badge tone={group.member_ids.length < min ? "warning" : "neutral"}>
          {group.member_ids.length} de {max}
        </Badge>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {group.member_ids.map((id) => (
          <li key={id} className="break-words">
            {nameOf(id)}
          </li>
        ))}
      </ul>
      {mine && open && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          loading={leave.isPending}
          onClick={() =>
            leave.mutate(group.id, {
              onSuccess: () => toast.success("Saliste del grupo"),
              onError: (error) => toast.error(toApiError(error).message),
            })
          }
        >
          <LogOut aria-hidden />
          Salir del grupo
        </Button>
      )}
      {canJoin && (
        <Button
          size="sm"
          className="self-start"
          disabled={full}
          loading={join.isPending}
          onClick={() =>
            join.mutate(group.id, {
              onSuccess: () => toast.success("Te uniste al grupo", { description: group.name }),
              onError: (error) => toast.error(toApiError(error).message),
            })
          }
        >
          <UserPlus aria-hidden />
          {full ? "Grupo completo" : "Unirme"}
        </Button>
      )}
    </li>
  );
}

function Groups({ course, project }: { course: CourseResponse; project: ProjectResponse }) {
  const user = useCurrentUser();
  const isTeacher = user.role === "docente";
  const groups = useGroups(project.id);
  const progress = useProgress(course.id);
  const list = groups.data ?? [];
  const enrolled =
    progress.data && isTeacherProgress(progress.data)
      ? progress.data.students.map((s) => s.student_id)
      : [];
  const { nameOf } = useUserNames([...list.flatMap((g) => g.member_ids), ...enrolled]);
  const open = groupsOpen(project);
  const myGroup = isTeacher ? undefined : groupOf(list, user.id);
  const history = `/courses/${course.id}/projects/${project.id}/versions`;

  return (
    <>
      <PageHeader
        title="Grupos"
        documentTitle={`Grupos: ${project.title}`}
        back={{ to: history, label: "Historial" }}
        context={<ContextChip>Proyecto: {project.title}</ContextChip>}
        actions={
          myGroup && (
            <Button asChild variant="secondary">
              <Link to={history}>Ir al historial de mi grupo</Link>
            </Button>
          )
        }
      />

      <Card className="mb-8">
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm">
            Grupos de <strong>{project.group_min_size}</strong> a{" "}
            <strong>{project.group_max_size}</strong> integrantes. Calificación final{" "}
            <strong>{project.grading_mode === "group" ? "por grupo" : "individual"}</strong>.
          </p>
          <DeadlineStatus project={project} />
          {isTeacher && <DeadlineForm course={course} project={project} />}
          {!isTeacher && !myGroup && open && (
            <>
              <p className="text-sm text-muted">
                Únete a un grupo con cupo o crea el tuyo. Hasta la fecha límite puedes cambiarte
                mientras tu grupo no haya subido versiones.
              </p>
              <CreateGroupForm course={course} project={project} />
            </>
          )}
          {!isTeacher && !myGroup && !open && (
            <p className="rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning-ink">
              No alcanzaste a unirte a un grupo. Pídele a tu docente que amplíe el plazo.
            </p>
          )}
        </CardContent>
      </Card>

      {isTeacher && groups.data && progress.data && (
        <section aria-labelledby="estado" className="mb-8">
          <SectionTitle>
            <span id="estado">Estado de los grupos</span>
          </SectionTitle>
          <TeacherWarnings
            project={project}
            groups={list}
            enrolled={enrolled}
            nameOf={(id) => nameOf(id)}
          />
        </section>
      )}

      <section aria-labelledby="lista-grupos">
        <SectionTitle>
          <span id="lista-grupos">Grupos formados</span>
        </SectionTitle>
        {groups.isLoading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        )}
        {groups.isError && (
          <ErrorState
            error={groups.error}
            onRetry={() => groups.refetch()}
            forbiddenMessage="No tienes acceso a este proyecto."
          />
        )}
        {groups.data && list.length === 0 && (
          <EmptyState
            icon={Users}
            title="Todavía no hay grupos"
            description={
              isTeacher
                ? "Los estudiantes del curso forman los grupos hasta la fecha límite."
                : open
                  ? "Sé el primero: crea un grupo y tus compañeros podrán unirse."
                  : "El plazo terminó sin grupos formados."
            }
          />
        )}
        {list.length > 0 && (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((group) => (
              <GroupCard
                key={group.id}
                course={course}
                project={project}
                group={group}
                mine={group.id === myGroup?.id}
                canJoin={!isTeacher && !myGroup && open}
                open={open}
                nameOf={(id) => nameOf(id)}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** Grupos de un proyecto por grupos: los estudiantes los forman; el docente fija el plazo. */
export function GroupsPage() {
  const { courseId = "", projectId = "" } = useParams();
  return (
    <ProjectGate courseId={courseId} projectId={projectId}>
      {(course, project) =>
        isGroupProject(project) ? (
          <Groups key={project.id} course={course} project={project} />
        ) : (
          <EmptyState
            icon={Users}
            title="Este proyecto es individual"
            description="No tiene grupos: cada estudiante entrega su propio trabajo."
          />
        )
      }
    </ProjectGate>
  );
}
