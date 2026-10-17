import { ContextChip, PageHeader, SectionTitle } from "@/components/layout/PageHeader";
import { ErrorState } from "@/components/layout/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/features/auth/AuthContext";
import { useUserNames } from "@/features/auth/useUserNames";
import { ProjectGate } from "@/features/courses/CourseGate";
import { FeedbackForm } from "@/features/feedback/FeedbackForm";
import { FeedbackThread } from "@/features/feedback/FeedbackThread";
import { downloadBlob } from "@/lib/download";
import { formatDateTime } from "@/lib/utils";
import type { CourseResponse, ProjectResponse } from "@/types/api";
import { Download } from "lucide-react";
import { useParams } from "react-router-dom";
import { VersionPreview } from "./VersionPreview";
import { fileNameOf, numberVersions, useVersion, useVersionFileUrl, useVersions } from "./hooks";

function VersionDetail({
  course,
  project,
  versionId,
}: { course: CourseResponse; project: ProjectResponse; versionId: string }) {
  const user = useCurrentUser();
  const isTeacher = user.role === "docente";
  const version = useVersion(project.id, versionId);
  // Número de la versión dentro de su hilo: el de su autor, o el de su grupo.
  const siblings = useVersions(
    project.id,
    version.data?.group_id
      ? { groupId: version.data.group_id }
      : { studentId: version.data?.student_id },
    { enabled: Boolean(version.data) },
  );
  const number = version.data ? (numberVersions(siblings.data ?? []).get(version.data.id) ?? 0) : 0;
  const { nameOf } = useUserNames([isTeacher ? version.data?.student_id : undefined]);
  const file = useVersionFileUrl(project.id, versionId, Boolean(version.data));
  const history = `/courses/${course.id}/projects/${project.id}/versions`;

  if (version.isLoading) return <Skeleton className="h-96 w-full" />;
  if (version.isError || !version.data) {
    return (
      <ErrorState
        error={version.error}
        onRetry={() => version.refetch()}
        forbiddenMessage="No tienes acceso a esta versión."
      />
    );
  }
  const data = version.data;

  return (
    <>
      <PageHeader
        title={number ? `Versión ${number}` : "Versión"}
        back={{ to: `${history}?version=${data.id}`, label: "Historial" }}
        context={
          <>
            <ContextChip>Proyecto: {project.title}</ContextChip>
            {isTeacher && <span>{nameOf(data.student_id, "Estudiante")}</span>}
            <span>{formatDateTime(data.uploaded_at)}</span>
          </>
        }
        actions={
          file.blob && (
            // Se descarga como octet-stream: un enlace al blob: abierto en otra pestaña podría
            // ejecutar un SVG en el origen de la app.
            <Button
              variant="secondary"
              onClick={() => file.blob && downloadBlob(file.blob, fileNameOf(data))}
            >
              <Download aria-hidden />
              Descargar original
            </Button>
          )
        }
      />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-3">
          <VersionPreview version={data} number={number} size="large" />
          <p className="whitespace-pre-line break-words text-sm leading-relaxed">
            {data.description}
          </p>
          <p className="text-xs text-muted">{fileNameOf(data)}</p>
        </div>
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <SectionTitle>Retroalimentación</SectionTitle>
            <FeedbackThread versionId={data.id} />
          </section>
          {isTeacher && (
            <FeedbackForm
              versionId={data.id}
              versionNumber={number}
              projectId={project.id}
              courseId={course.id}
            />
          )}
        </div>
      </div>
    </>
  );
}

export function VersionDetailPage() {
  const { courseId = "", projectId = "", versionId = "" } = useParams();
  return (
    <ProjectGate courseId={courseId} projectId={projectId}>
      {(course, project) => (
        <VersionDetail course={course} project={project} versionId={versionId} />
      )}
    </ProjectGate>
  );
}
