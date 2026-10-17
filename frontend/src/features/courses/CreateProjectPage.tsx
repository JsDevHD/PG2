import { ContextChip, PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConsentCheckbox } from "@/components/ui/consent-checkbox";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useGroups, useVersions } from "@/features/projects/hooks";
import { toApiError } from "@/lib/errors";
import { fromLocalInput, groupFormation, groupFormationWarning, toLocalInput } from "@/lib/groups";
import { cn } from "@/lib/utils";
import type {
  CourseResponse,
  GradingMode,
  ProjectCreateRequest,
  ProjectResponse,
  WorkMode,
} from "@/types/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Award, Lock, User, Users } from "lucide-react";
import type { ReactNode } from "react";
import { type UseFormRegisterReturn, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { CourseGate, ProjectGate } from "./CourseGate";
import { isTeacherProgress, useCreateProject, useProgress, useUpdateProject } from "./hooks";

const MIN_GROUP = 2;
const MAX_GROUP = 10;

const groupSize = z
  .number({ invalid_type_error: `Escribe un número de ${MIN_GROUP} a ${MAX_GROUP}` })
  .int("Escribe un número entero")
  .min(MIN_GROUP, `Mínimo ${MIN_GROUP}`)
  .max(MAX_GROUP, `Máximo ${MAX_GROUP}`);

/**
 * `futureDeadline`: al crear (o al pasar un proyecto individual a grupos) la fecha debe ser futura.
 * En un proyecto que ya es por grupos, una fecha pasada es válida: cierra la formación de grupos.
 */
function makeSchema(futureDeadline: boolean) {
  return z
    .object({
      title: z
        .string()
        .trim()
        .min(1, "Escribe el título del proyecto")
        .max(150, "Máximo 150 caracteres"),
      description: z.string().trim().max(5000, "Máximo 5000 caracteres"),
      workMode: z.enum(["individual", "group"]),
      // Deshabilitados (estructura bloqueada) llegan como undefined: no se validan ni se envían.
      minSize: groupSize.optional(),
      maxSize: groupSize.optional(),
      deadline: z.string(),
      gradingMode: z.enum(["individual", "group"]).optional(),
      hidden: z.boolean(),
    })
    .superRefine((values, ctx) => {
      if (values.workMode !== "group") return;
      if (values.minSize !== undefined && values.maxSize !== undefined) {
        if (values.minSize > values.maxSize) {
          ctx.addIssue({
            code: "custom",
            path: ["maxSize"],
            message: "El máximo no puede ser menor que el mínimo",
          });
        }
      }
      if (!values.deadline) {
        ctx.addIssue({ code: "custom", path: ["deadline"], message: "Elige la fecha límite" });
      } else if (futureDeadline && Date.parse(fromLocalInput(values.deadline)) <= Date.now()) {
        ctx.addIssue({ code: "custom", path: ["deadline"], message: "La fecha debe ser futura" });
      }
    });
}
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

/** Una semana a partir de hoy, al final del día: un plazo razonable para formar grupos. */
function defaultDeadline(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(23, 59, 0, 0);
  return toLocalInput(date);
}

interface Choice<T extends string> {
  value: T;
  title: string;
  description: string;
  icon: typeof User;
}

/** Opciones excluyentes como tarjetas (radios nativos, accesibles con teclado). */
function ChoiceCards<T extends string>({
  legend,
  choices,
  selected,
  registration,
  disabled = false,
  footer,
}: {
  legend: string;
  choices: Choice<T>[];
  selected: T | undefined;
  registration: UseFormRegisterReturn;
  disabled?: boolean;
  footer?: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {choices.map(({ value, title, description, icon: Icon }) => (
          <label
            key={value}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink",
              disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
              selected === value
                ? "border-teacher bg-teacher-soft/50"
                : cn("border-border", !disabled && "hover:border-ink/30"),
            )}
          >
            <input type="radio" value={value} className="sr-only" {...registration} />
            <Icon className="mt-0.5 size-5 shrink-0 text-teacher" aria-hidden />
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{title}</span>
              <span className="text-xs text-muted">{description}</span>
            </span>
          </label>
        ))}
      </div>
      {footer}
    </fieldset>
  );
}

const workModes: Choice<WorkMode>[] = [
  {
    value: "individual",
    title: "Individual",
    description: "Cada estudiante entrega su propio trabajo.",
    icon: User,
  },
  {
    value: "group",
    title: "Por grupos",
    description: "Los estudiantes forman grupos y entregan juntos.",
    icon: Users,
  },
];

const gradingModes: Choice<GradingMode>[] = [
  {
    value: "individual",
    title: "Individual",
    description: "Cada integrante recibe su propia calificación final.",
    icon: User,
  },
  {
    value: "group",
    title: "Por grupo",
    description: "Una sola calificación final para todo el grupo.",
    icon: Award,
  },
];

function GroupFormationNotice({
  students,
  min,
  max,
}: { students: number; min?: number; max?: number }) {
  if (min === undefined || max === undefined) return null;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const warning = groupFormationWarning(students, min, max);
  if (warning) {
    return (
      <output className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning-ink">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {warning} Puedes guardar el proyecto igual: la advertencia se actualiza a medida que se
          inscriben estudiantes.
        </span>
      </output>
    );
  }
  if (min > max) return null;
  const { fewestGroups, mostGroups } = groupFormation(students, min, max);
  return (
    <output className="block text-sm text-muted">
      Con {students} estudiantes inscritos se pueden formar{" "}
      {fewestGroups === mostGroups
        ? `${fewestGroups} ${fewestGroups === 1 ? "grupo" : "grupos"}`
        : `entre ${fewestGroups} y ${mostGroups} grupos`}
      .
    </output>
  );
}

/**
 * Formulario de proyecto. Sin `project` crea uno; con `project` lo edita. `locked`: el proyecto ya
 * tiene grupos o versiones, así que la modalidad, el tamaño de los grupos y la calificación quedan
 * fijos (el backend lo hace cumplir con 409); el resto se puede cambiar.
 */
function ProjectForm({
  course,
  project,
  locked = false,
}: { course: CourseResponse; project?: ProjectResponse; locked?: boolean }) {
  const navigate = useNavigate();
  const editing = Boolean(project);
  const createProject = useCreateProject(course.id);
  const updateProject = useUpdateProject(course.id, project?.id ?? "");
  const pending = createProject.isPending || updateProject.isPending;
  const progress = useProgress(course.id);
  // El progreso del docente lista a todos los matriculados, incluso a los que no han entregado.
  const enrolled =
    progress.data && isTeacherProgress(progress.data) ? progress.data.students.length : undefined;
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(makeSchema(project?.work_mode !== "group")),
    defaultValues: {
      title: project?.title ?? "",
      description: project?.description ?? "",
      workMode: project?.work_mode ?? "individual",
      minSize: project?.group_min_size ?? 2,
      maxSize: project?.group_max_size ?? 4,
      deadline: project?.group_deadline ? toLocalInput(project.group_deadline) : defaultDeadline(),
      gradingMode: project?.grading_mode ?? "individual",
      hidden: project?.hidden ?? false,
    },
  });
  const workMode = watch("workMode") ?? project?.work_mode;
  const gradingMode = watch("gradingMode") ?? project?.grading_mode;
  const isGroup = workMode === "group";
  const back = editing
    ? `/courses/${course.id}/projects/${project?.id}/versions`
    : `/courses/${course.id}`;

  const onSubmit = handleSubmit((values) => {
    const body: ProjectCreateRequest = {
      title: values.title,
      description: values.description,
      hidden: values.hidden,
    };
    if (!locked) {
      body.work_mode = values.workMode;
      if (values.workMode === "group") {
        Object.assign(body, {
          group_min_size: values.minSize,
          group_max_size: values.maxSize,
          grading_mode: values.gradingMode,
        });
      }
    }
    if (isGroup) body.group_deadline = fromLocalInput(values.deadline);

    const onError = (error: unknown) => {
      const apiError = toApiError(error);
      if (apiError.kind === "validation") setError("title", { message: apiError.message });
      else toast.error(apiError.message);
    };
    if (editing) {
      updateProject.mutate(body, {
        onSuccess: (saved) => {
          toast.success("Proyecto actualizado", { description: saved.title });
          navigate(back);
        },
        onError,
      });
    } else {
      createProject.mutate(body, {
        onSuccess: (saved) => {
          toast.success(saved.hidden ? "Proyecto creado oculto" : "Proyecto creado", {
            description: saved.title,
          });
          navigate(`/courses/${course.id}`);
        },
        onError,
      });
    }
  });

  return (
    <>
      <PageHeader
        title={editing ? "Editar proyecto" : "Crear proyecto"}
        documentTitle={editing ? `Editar: ${project?.title}` : undefined}
        back={{ to: back, label: editing ? "Historial" : course.name }}
        context={<ContextChip>{course.name}</ContextChip>}
      />
      <Card className="max-w-2xl">
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
            <Field label="Título" error={errors.title?.message}>
              <Input placeholder="Rediseño de marca" {...register("title")} />
            </Field>
            <Field
              label="Descripción"
              error={errors.description?.message}
              hint="Opcional. Explica el objetivo y los entregables esperados."
            >
              <Textarea
                rows={5}
                placeholder="Propuesta de identidad visual para una marca local: logotipo, paleta y aplicaciones."
                {...register("description")}
              />
            </Field>

            {locked && (
              <p className="flex items-start gap-2 rounded-lg bg-ink/[0.04] px-3 py-2.5 text-sm text-muted">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Este proyecto ya tiene grupos o versiones: la modalidad, el tamaño de los grupos y
                  la calificación ya no se pueden cambiar. El título, la descripción, la visibilidad
                  y la fecha límite sí.
                </span>
              </p>
            )}

            <ChoiceCards
              legend="Modalidad"
              choices={workModes}
              selected={workMode}
              registration={register("workMode", { disabled: locked })}
              disabled={locked}
            />

            {isGroup && (
              <div className="flex flex-col gap-5 rounded-lg border border-border p-4">
                <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                  <Field label="Mínimo por grupo" error={errors.minSize?.message}>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={MIN_GROUP}
                      max={MAX_GROUP}
                      {...register("minSize", { valueAsNumber: true, disabled: locked })}
                    />
                  </Field>
                  <Field label="Máximo por grupo" error={errors.maxSize?.message}>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={MIN_GROUP}
                      max={MAX_GROUP}
                      {...register("maxSize", { valueAsNumber: true, disabled: locked })}
                    />
                  </Field>
                </div>
                {enrolled !== undefined && !locked && (
                  <GroupFormationNotice
                    students={enrolled}
                    min={watch("minSize")}
                    max={watch("maxSize")}
                  />
                )}
                <Field
                  label="Fecha límite para formar grupos"
                  error={errors.deadline?.message}
                  hint={
                    editing
                      ? "Puedes ampliarla para los rezagados o poner una fecha pasada para cerrar la formación de grupos."
                      : "Hasta entonces los estudiantes del curso pueden crear grupos, unirse o salir. Puedes ampliarla después."
                  }
                  className="sm:max-w-xs"
                >
                  <Input type="datetime-local" {...register("deadline")} />
                </Field>
                <ChoiceCards
                  legend="Calificación final"
                  choices={gradingModes}
                  selected={gradingMode}
                  registration={register("gradingMode", { disabled: locked })}
                  disabled={locked}
                  footer={
                    <p className="text-xs text-muted">
                      Son excluyentes. Solo se pueden cambiar mientras el proyecto no tenga grupos
                      ni versiones.
                    </p>
                  }
                />
              </div>
            )}

            <ConsentCheckbox
              label={editing ? "Oculto para los estudiantes" : "Crear oculto (borrador)"}
              details="Un proyecto oculto no aparece para los estudiantes ni pueden trabajar en él. Sus versiones y retroalimentación se conservan, y puedes mostrarlo cuando quieras."
              {...register("hidden")}
            />

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => navigate(back)}>
                Cancelar
              </Button>
              <Button type="submit" loading={pending}>
                {editing ? "Guardar cambios" : "Crear proyecto"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

export function CreateProjectPage() {
  const { courseId = "" } = useParams();
  return <CourseGate courseId={courseId}>{(course) => <ProjectForm course={course} />}</CourseGate>;
}

/** Espera a saber si el proyecto ya tiene grupos o versiones antes de mostrar el formulario. */
function EditProject({ course, project }: { course: CourseResponse; project: ProjectResponse }) {
  const versions = useVersions(project.id);
  const groups = useGroups(project.id, project.work_mode === "group");
  const loading = versions.isLoading || (project.work_mode === "group" && groups.isLoading);
  if (loading) return <Skeleton className="h-96 max-w-2xl" />;
  const locked = (versions.data?.length ?? 0) > 0 || (groups.data?.length ?? 0) > 0;
  return <ProjectForm course={course} project={project} locked={locked} />;
}

export function EditProjectPage() {
  const { courseId = "", projectId = "" } = useParams();
  return (
    <ProjectGate courseId={courseId} projectId={projectId}>
      {(course, project) => <EditProject key={project.id} course={course} project={project} />}
    </ProjectGate>
  );
}
