import { ContextChip, PageHeader, SectionTitle } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConsentCheckbox } from "@/components/ui/consent-checkbox";
import { Field } from "@/components/ui/field";
import { FileDropzone, validateFile } from "@/components/ui/file-dropzone";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useCurrentUser } from "@/features/auth/AuthContext";
import { ProjectGate } from "@/features/courses/CourseGate";
import { ProjectBrief } from "@/features/courses/ProjectBrief";
import { useFinalGrades } from "@/features/feedback/hooks";
import { LegalLink } from "@/features/legal/LegalLink";
import { LEGAL_ROUTES } from "@/features/legal/legalConfig";
import { toApiError } from "@/lib/errors";
import { groupOf, isGroupProject } from "@/lib/groups";
import { formatRelative } from "@/lib/utils";
import type { CourseResponse, ProjectResponse } from "@/types/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { History } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { numberVersions, useGroups, useUploadVersion, useVersions } from "./hooks";

const schema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Describe qué cambió en esta versión")
    .max(2000, "Máximo 2000 caracteres"),
  file: z
    .custom<File | null>()
    .refine((file): file is File => file instanceof File, "Elige el archivo de esta versión")
    .superRefine((file, ctx) => {
      const problem = file ? validateFile(file) : null;
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
    }),
  rightsDeclaration: z.literal(true, {
    errorMap: () => ({ message: "Para subir la versión debes confirmar esta declaración" }),
  }),
});
type FormValues = { description: string; file: File | null; rightsDeclaration: boolean };

function UploadVersion({ course, project }: { course: CourseResponse; project: ProjectResponse }) {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const versions = useVersions(project.id);
  const finalGrades = useFinalGrades(project.id);
  const byGroups = isGroupProject(project);
  const groups = useGroups(project.id, byGroups);
  const myGroup = groupOf(groups.data, user.id);
  const needsGroup = byGroups && groups.data !== undefined && !myGroup;
  const upload = useUploadVersion(project.id, course.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const history = `/courses/${course.id}/projects/${project.id}/versions`;
  const numbers = numberVersions(versions.data ?? []);
  // El estudiante solo recibe su propia calificación final: si existe, ya no sube más versiones.
  const isFinalized = (finalGrades.data ?? []).some((grade) => grade.student_id === user.id);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { description: "", file: null, rightsDeclaration: false },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    upload.mutate(
      { file: values.file as File, description: values.description },
      {
        onSuccess: (version) => {
          toast.success("Versión subida", { description: "Tu docente ya puede revisarla." });
          navigate(`${history}?version=${version.id}`);
        },
        onError: (error) => {
          const apiError = toApiError(error);
          // 422 de formato/tamaño (RNF-05): junto al campo del archivo, con el mensaje del backend.
          if (apiError.kind === "validation") setError("file", { message: apiError.message });
          else setServerError(apiError.message);
        },
      },
    );
  });

  return (
    <>
      <PageHeader
        title="Subir versión"
        back={{ to: `/courses/${course.id}`, label: course.name }}
        context={<ContextChip>Proyecto: {project.title}</ContextChip>}
      />
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader>
            <CardTitle>Nueva versión</CardTitle>
          </CardHeader>
          <CardContent>
            {needsGroup ? (
              <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning-ink">
                Este proyecto es por grupos: únete a un grupo para subir versiones.{" "}
                <Link
                  to={`/courses/${course.id}/projects/${project.id}/groups`}
                  className="font-semibold underline underline-offset-4"
                >
                  Elegir grupo
                </Link>
              </p>
            ) : isFinalized ? (
              <p className="rounded-lg bg-shared-soft px-4 py-3 text-sm text-shared-ink">
                Ya tienes calificación final en este proyecto, así que no admite más versiones
                tuyas.{" "}
                <Link to={history} className="font-semibold underline underline-offset-4">
                  Ver tu historial
                </Link>
              </p>
            ) : (
              <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
                <Field label="Descripción de esta versión" error={errors.description?.message}>
                  <Textarea
                    rows={3}
                    placeholder="Segunda propuesta de logo: ajusté la paleta según la retroalimentación."
                    {...register("description")}
                  />
                </Field>
                <Controller
                  control={control}
                  name="file"
                  render={({ field, fieldState }) => (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium" id="archivo-label">
                        Archivo
                      </span>
                      <FileDropzone
                        value={field.value}
                        onChange={field.onChange}
                        invalid={Boolean(fieldState.error)}
                        describedBy={fieldState.error ? "archivo-error" : undefined}
                        disabled={upload.isPending}
                      />
                      {fieldState.error && (
                        <p id="archivo-error" role="alert" className="text-sm text-danger-ink">
                          {fieldState.error.message}
                        </p>
                      )}
                    </div>
                  )}
                />
                <ConsentCheckbox
                  {...register("rightsDeclaration")}
                  error={errors.rightsDeclaration?.message}
                  label={
                    <>
                      Declaro que soy autor de esta obra o que tengo permiso para usar el material
                      de terceros que incluye, y que cuento con la autorización de las personas
                      reconocibles que aparecen en ella.
                    </>
                  }
                  details={
                    <>
                      Conservas tus derechos de autor; la plataforma solo la guarda y se la muestra
                      a tu docente. Más información en{" "}
                      <LegalLink to={LEGAL_ROUTES.copyright}>
                        Derechos de autor y contenido
                      </LegalLink>
                      . Una versión subida no se puede editar ni borrar.
                    </>
                  }
                />
                {serverError && (
                  <p
                    role="alert"
                    className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink"
                  >
                    {serverError}
                  </p>
                )}
                <Button type="submit" size="lg" loading={upload.isPending}>
                  {upload.isPending ? "Subiendo…" : "Subir versión"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <aside className="flex flex-col gap-6">
          <ProjectBrief project={project} variant="compact" />
          <div>
            <SectionTitle
              aside={
                (versions.data?.length ?? 0) > 0 ? (
                  <Link
                    to={history}
                    className="inline-flex items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline"
                  >
                    <History className="size-4" aria-hidden />
                    Historial
                  </Link>
                ) : undefined
              }
            >
              Versiones anteriores
            </SectionTitle>
            {versions.isLoading && <Skeleton className="h-24" />}
            {versions.data?.length === 0 && (
              <p className="text-sm text-muted">Esta será tu primera versión.</p>
            )}
            <ol className="flex flex-col gap-2">
              {[...(versions.data ?? [])].reverse().map((version) => (
                <li key={version.id}>
                  <Link
                    to={`${history}?version=${version.id}`}
                    className="flex items-baseline gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-sm transition-colors hover:border-ink/30"
                  >
                    <span className="text-lg font-bold tabular-nums tracking-tight">
                      v{numbers.get(version.id)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">
                      {formatRelative(version.uploaded_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </>
  );
}

/** Mockup 05_subir_version.png — RF-03 / CU-02. */
export function UploadVersionPage() {
  const { courseId = "", projectId = "" } = useParams();
  return (
    <ProjectGate courseId={courseId} projectId={projectId}>
      {(course, project) => <UploadVersion course={course} project={project} />}
    </ProjectGate>
  );
}
