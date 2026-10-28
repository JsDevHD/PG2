import { ContextChip, PageHeader, SectionTitle } from "@/components/layout/PageHeader";
import { EmptyState, ErrorState } from "@/components/layout/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/features/auth/AuthContext";
import { useUserNames } from "@/features/auth/useUserNames";
import { ProjectGate } from "@/features/courses/CourseGate";
import { ProjectActions } from "@/features/courses/ProjectActions";
import { ProjectBrief } from "@/features/courses/ProjectBrief";
import { isTeacherProgress, useProgress } from "@/features/courses/hooks";
import { ExportButton } from "@/features/export/ExportButton";
import { ConfirmFinalGradeDialog } from "@/features/feedback/ConfirmFinalGradeDialog";
import { FeedbackForm } from "@/features/feedback/FeedbackForm";
import { FeedbackThread } from "@/features/feedback/FeedbackThread";
import { FinalGradeBar } from "@/features/feedback/FinalGradeBar";
import { FinalGradePanel } from "@/features/feedback/FinalGradePanel";
import { useFinalGrades, useProjectFeedback } from "@/features/feedback/hooks";
import {
  type FinalGradeFlow,
  type GradeTarget,
  useFinalGradeFlow,
} from "@/features/feedback/useFinalGradeFlow";
import { groupOf, isGroupProject } from "@/lib/groups";
import { formatDateTime } from "@/lib/utils";
import type {
  CourseResponse,
  FeedbackResponse,
  GroupResponse,
  ProjectResponse,
  VersionResponse,
} from "@/types/api";
import { Expand, EyeOff, ImagePlus, Upload, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { VersionStrip } from "./VersionStrip";
import { numberVersions, useGroups, useVersions } from "./hooks";

/**
 * En una sola columna (< md) la retroalimentación queda debajo de toda la tira de versiones: al
 * elegir una versión se lleva la vista a su retroalimentación, o el toque parecería no hacer nada.
 */
function showFeedbackOnSmallScreens() {
  if (!window.matchMedia?.("(max-width: 767px)").matches) return;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(() =>
    document
      .getElementById("retroalimentacion")
      ?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" }),
  );
}

/**
 * A quién se califica en el cierre: el estudiante (proyecto individual), todo el grupo
 * (calificación grupal) o un integrante (calificación individual en un proyecto por grupos).
 */
function gradeTargetOf(
  project: ProjectResponse,
  group: GroupResponse | undefined,
  studentId: string | undefined,
  nameOf: (id: string) => string,
): GradeTarget | undefined {
  if (!isGroupProject(project)) {
    return studentId ? { kind: "student", studentId, name: nameOf(studentId) } : undefined;
  }
  if (!group) return undefined;
  if (project.grading_mode === "group") {
    return {
      kind: "group",
      groupId: group.id,
      name: group.name,
      memberNames: group.member_ids.map(nameOf),
    };
  }
  return studentId
    ? { kind: "student", studentId, name: nameOf(studentId), inGroup: true, groupName: group.name }
    : undefined;
}

interface ClosingProps {
  project: ProjectResponse;
  versions: VersionResponse[];
  numbers: Map<string, number>;
  feedback: FeedbackResponse[];
  isTeacher: boolean;
  /** Lo calcula la página: la barra superior califica al mismo estudiante o grupo. */
  target?: GradeTarget;
  /** Solo el docente: el flujo de la calificación final (bloque, barra y confirmación). */
  finalGrade?: FinalGradeFlow;
}

/** Cierre de un proyecto individual: la calificación final y el portafolio de un estudiante. */
function StudentClosing({
  project,
  versions,
  numbers,
  feedback,
  isTeacher,
  target,
  finalGrade,
  studentId,
  studentName,
}: ClosingProps & { studentId: string; studentName?: string }) {
  const own = versions.filter((v) => v.student_id === studentId);
  return (
    <section aria-labelledby="cierre" className="flex flex-col gap-3">
      <h2 id="cierre" className="text-base font-semibold tracking-tight">
        {isTeacher
          ? `Cierre del proyecto de ${studentName ?? "este estudiante"}`
          : "Cierre del proyecto"}
      </h2>
      {target && (
        <FinalGradePanel
          projectId={project.id}
          target={target}
          numbers={numbers}
          flow={finalGrade}
        />
      )}
      <ExportButton
        projectId={project.id}
        studentId={isTeacher ? studentId : undefined}
        versions={own}
        feedback={feedback.filter((f) => f.student_id === studentId)}
      />
    </section>
  );
}

/**
 * Cierre de un proyecto por grupos. Con calificación grupal se califica una vez a todo el grupo;
 * con calificación individual, a cada integrante por separado (el docente elige a quién). El
 * portafolio siempre es de un estudiante: el docente elige de qué integrante.
 */
function GroupClosing({
  project,
  versions,
  numbers,
  feedback,
  isTeacher,
  target,
  finalGrade,
  group,
  memberId,
  onMemberChange,
  nameOf,
}: ClosingProps & {
  group: GroupResponse;
  /** Integrante del cierre: el que elige el docente o el propio estudiante. */
  memberId: string | undefined;
  onMemberChange: (id: string) => void;
  nameOf: (id: string) => string;
}) {
  const finalGrades = useFinalGrades(project.id);
  const groupVersions = versions.filter((v) => v.group_id === group.id);
  const groupGrading = project.grading_mode === "group";
  const gradedIds = new Set(
    (finalGrades.data ?? []).filter((g) => g.group_id === group.id).map((g) => g.student_id),
  );
  const memberFeedback = feedback.filter(
    (f) => f.group_id === group.id && (!f.is_final || f.student_id === memberId),
  );

  return (
    <section aria-labelledby="cierre" className="flex flex-col gap-3">
      <h2 id="cierre" className="text-base font-semibold tracking-tight">
        Cierre del proyecto de {group.name}
      </h2>
      <p className="text-sm text-muted">
        {groupGrading
          ? "Este proyecto se califica por grupo: una sola nota para todos los integrantes."
          : "Este proyecto se califica individualmente: cada integrante recibe su propia nota."}
      </p>
      {isTeacher && group.member_ids.length > 0 && (
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <label htmlFor="integrante" className="text-sm font-medium">
            {groupGrading ? "Portafolio de" : "Integrante"}
          </label>
          <Select id="integrante" value={memberId} onChange={(e) => onMemberChange(e.target.value)}>
            {group.member_ids.map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}
                {!groupGrading && gradedIds.has(id) ? " · calificado" : ""}
              </option>
            ))}
          </Select>
        </div>
      )}
      {target && (
        <FinalGradePanel
          projectId={project.id}
          target={target}
          numbers={numbers}
          flow={finalGrade}
        />
      )}
      {memberId && (
        <ExportButton
          projectId={project.id}
          studentId={isTeacher ? memberId : undefined}
          versions={groupVersions}
          feedback={memberFeedback}
        />
      )}
    </section>
  );
}

function VersionHistory({ course, project }: { course: CourseResponse; project: ProjectResponse }) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const isTeacher = user.role === "docente";
  const byGroups = isGroupProject(project);
  const [params, setParams] = useSearchParams();
  // El docente filtra por estudiante (individual) o por grupo; el backend fuerza lo propio al
  // estudiante (sus versiones o las de su grupo).
  const studentFilter = isTeacher && !byGroups ? (params.get("student") ?? undefined) : undefined;
  const groupFilter = isTeacher && byGroups ? (params.get("group") ?? undefined) : undefined;

  const groups = useGroups(project.id, byGroups);
  const groupList = groups.data ?? [];
  const myGroup = !isTeacher && byGroups ? groupOf(groupList, user.id) : undefined;
  const versions = useVersions(
    project.id,
    byGroups ? { groupId: groupFilter } : { studentId: studentFilter },
  );
  const projectFeedback = useProjectFeedback(project.id);
  const progress = useProgress(course.id);
  const students = progress.data && isTeacherProgress(progress.data) ? progress.data.students : [];
  const { nameOf } = useUserNames([
    ...groupList.flatMap((g) => g.member_ids),
    ...(versions.data ?? []).map((v) => v.student_id),
  ]);
  const studentName = (id: string) =>
    students.find((s) => s.student_id === id)?.student_name ?? nameOf(id, "Estudiante");
  const groupName = (id: string | null) => groupList.find((g) => g.id === id)?.name ?? "Grupo";

  const list = versions.data ?? [];
  // Numeración por hilo sobre todo el historial visible (el backend lo entrega ascendente).
  const numbers = useMemo(() => numberVersions(list), [list]);
  const reviewedIds = useMemo(
    () => new Set((projectFeedback.data ?? []).map((f) => f.version_id)),
    [projectFeedback.data],
  );

  const selected = list.find((v) => v.id === params.get("version")) ?? list.at(-1);
  const selectedNumber = selected ? (numbers.get(selected.id) ?? 0) : 0;
  // Estudiante (o grupo) del cierre: el filtrado, o el dueño de la versión elegida.
  const closingStudent = isTeacher ? (studentFilter ?? selected?.student_id) : user.id;
  const closingGroup = isTeacher
    ? groupList.find((g) => g.id === (groupFilter ?? selected?.group_id))
    : myGroup;
  // En un proyecto por grupos, el integrante del cierre: el que elige el docente (por omisión, el
  // primero) o el propio estudiante.
  const [memberChoice, setMemberChoice] = useState("");
  const closingMember = !closingGroup
    ? undefined
    : !isTeacher
      ? user.id
      : closingGroup.member_ids.includes(memberChoice)
        ? memberChoice
        : closingGroup.member_ids[0];
  const gradeTarget = gradeTargetOf(
    project,
    closingGroup,
    byGroups ? closingMember : closingStudent,
    byGroups ? (id) => nameOf(id) : studentName,
  );
  const finalGrade = useFinalGradeFlow({
    projectId: project.id,
    courseId: course.id,
    target: isTeacher ? gradeTarget : undefined,
    versions: (versions.data ?? []).filter((v) =>
      byGroups ? v.group_id === closingGroup?.id : v.student_id === closingStudent,
    ),
  });

  const updateParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  const base = `/courses/${course.id}/projects/${project.id}`;
  // El estudiante de un proyecto por grupos necesita grupo para ver y subir versiones.
  const needsGroup = byGroups && !isTeacher && groups.data !== undefined && !myGroup;

  const authorOf = (v: VersionResponse) => {
    if (byGroups) {
      const uploader = `Subida por ${nameOf(v.student_id, "un integrante")}`;
      return isTeacher && !groupFilter ? `${groupName(v.group_id)} · ${uploader}` : uploader;
    }
    return isTeacher && !studentFilter ? studentName(v.student_id) : undefined;
  };

  const closingProps: ClosingProps = {
    project,
    versions: list,
    numbers,
    feedback: projectFeedback.data ?? [],
    isTeacher,
    target: gradeTarget,
    finalGrade: isTeacher ? finalGrade : undefined,
  };

  return (
    <>
      <PageHeader
        title="Historial y retroalimentación"
        documentTitle={`Historial: ${project.title}`}
        back={{ to: `/courses/${course.id}`, label: course.name }}
        context={
          <>
            <ContextChip>Proyecto: {project.title}</ContextChip>
            {project.hidden && (
              <Badge tone="warning">
                <EyeOff aria-hidden />
                Oculto para los estudiantes
              </Badge>
            )}
            {byGroups && (
              <Link
                to={`${base}/groups`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink underline-offset-4 hover:underline"
              >
                <Users className="size-4" aria-hidden />
                {myGroup ? myGroup.name : isTeacher ? "Grupos del proyecto" : "Ver grupos"}
              </Link>
            )}
          </>
        }
        actions={
          isTeacher ? (
            <ProjectActions
              course={course}
              project={project}
              onDeleted={() => navigate(`/courses/${course.id}`, { replace: true })}
            />
          ) : (
            !needsGroup && (
              <Button asChild>
                <Link to={`${base}/upload`}>
                  <Upload aria-hidden />
                  Subir versión
                </Link>
              </Button>
            )
          )
        }
      />

      {/* Antes de la descripción: el acceso a la calificación final queda a la vista sin desplazarse. */}
      {isTeacher &&
        (versions.isLoading ? (
          <Skeleton className="mb-6 h-20" />
        ) : (
          versions.data && (
            <FinalGradeBar
              flow={finalGrade}
              viewing={
                selected
                  ? `v${selectedNumber}, subida el ${formatDateTime(selected.uploaded_at)}`
                  : undefined
              }
            />
          )
        ))}

      <div className="mb-6 max-w-3xl">
        <ProjectBrief project={project} />
      </div>

      {isTeacher && !byGroups && (
        <div className="mb-6 flex flex-col gap-1.5 sm:max-w-xs">
          <label htmlFor="filtro-estudiante" className="text-sm font-medium">
            Estudiante
          </label>
          <Select
            id="filtro-estudiante"
            value={studentFilter ?? ""}
            onChange={(event) =>
              updateParams({ student: event.target.value || undefined, version: undefined })
            }
          >
            <option value="">Todos los estudiantes</option>
            {students.map((student) => (
              <option key={student.student_id} value={student.student_id}>
                {student.student_name ?? "Nombre no disponible"}
              </option>
            ))}
          </Select>
        </div>
      )}
      {isTeacher && byGroups && (
        <div className="mb-6 flex flex-col gap-1.5 sm:max-w-xs">
          <label htmlFor="filtro-grupo" className="text-sm font-medium">
            Grupo
          </label>
          <Select
            id="filtro-grupo"
            value={groupFilter ?? ""}
            onChange={(event) =>
              updateParams({ group: event.target.value || undefined, version: undefined })
            }
          >
            <option value="">Todos los grupos</option>
            {groupList.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} · {group.member_ids.length}{" "}
                {group.member_ids.length === 1 ? "integrante" : "integrantes"}
              </option>
            ))}
          </Select>
        </div>
      )}

      {needsGroup && (
        <EmptyState
          icon={Users}
          title="Este proyecto es por grupos"
          description="Únete a un grupo o crea uno para ver el historial de tu grupo y subir versiones."
          action={
            <Button asChild>
              <Link to={`${base}/groups`}>Elegir grupo</Link>
            </Button>
          }
        />
      )}

      {!needsGroup && versions.isLoading && (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-48" />
        </div>
      )}
      {versions.isError && (
        <ErrorState
          error={versions.error}
          onRetry={() => versions.refetch()}
          forbiddenMessage="No tienes acceso a este proyecto."
        />
      )}
      {!needsGroup && versions.data && list.length === 0 && (
        <EmptyState
          icon={ImagePlus}
          title={isTeacher ? "Todavía no hay versiones" : "Sube tu primera versión"}
          description={
            isTeacher
              ? studentFilter || groupFilter
                ? byGroups
                  ? "Este grupo aún no ha subido versiones a este proyecto."
                  : "Este estudiante aún no ha subido versiones a este proyecto."
                : "Cuando los estudiantes suban versiones, aparecerán aquí."
              : byGroups
                ? "Cada versión que suba alguien de tu grupo queda en este historial con la retroalimentación del docente."
                : "Cada versión que subas queda en este historial con la retroalimentación del docente."
          }
          action={
            !isTeacher && (
              <Button asChild>
                <Link to={`${base}/upload`}>Subir versión</Link>
              </Button>
            )
          }
        />
      )}

      {selected && (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <section aria-labelledby="historial">
            <SectionTitle>
              <span id="historial">Historial de versiones</span>
            </SectionTitle>
            <VersionStrip
              versions={list}
              numbers={numbers}
              selectedId={selected.id}
              onSelect={(version) => {
                updateParams({ version: version.id });
                showFeedbackOnSmallScreens();
              }}
              reviewedIds={reviewedIds}
              authorOf={authorOf}
            />
          </section>

          <div className="flex flex-col gap-6">
            <section
              id="retroalimentacion"
              aria-labelledby="retro"
              className="flex scroll-mt-20 flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="retro" className="text-base font-semibold tracking-tight">
                    Retroalimentación de v{selectedNumber}
                  </h2>
                  <p className="text-sm text-muted">
                    {byGroups && isTeacher && (
                      <Badge className="mr-1.5 align-middle">{groupName(selected.group_id)}</Badge>
                    )}
                    {(isTeacher || byGroups) &&
                      `${byGroups ? nameOf(selected.student_id, "Un integrante") : studentName(selected.student_id)}, `}
                    subida el {formatDateTime(selected.uploaded_at)}
                  </p>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link to={`${base}/versions/${selected.id}`}>
                    <Expand aria-hidden />
                    Ver en grande
                  </Link>
                </Button>
              </div>
              <FeedbackThread versionId={selected.id} />
            </section>

            {isTeacher && (
              <FeedbackForm
                key={selected.id}
                versionId={selected.id}
                versionNumber={selectedNumber}
                projectId={project.id}
                courseId={course.id}
              />
            )}

            {/* La key va en la sección y no en cada hijo: dos hermanos con la misma key impiden
                que React desmonte los paneles anteriores, que se acumulaban al cambiar de hilo. */}
            {byGroups
              ? closingGroup && (
                  <GroupClosing
                    key={closingGroup.id}
                    {...closingProps}
                    group={closingGroup}
                    memberId={closingMember}
                    onMemberChange={setMemberChoice}
                    nameOf={(id) => nameOf(id)}
                  />
                )
              : closingStudent && (
                  <StudentClosing
                    key={closingStudent}
                    {...closingProps}
                    studentId={closingStudent}
                    studentName={studentName(closingStudent)}
                  />
                )}
          </div>
        </div>
      )}

      {isTeacher && (
        <ConfirmFinalGradeDialog flow={finalGrade} projectTitle={project.title} numbers={numbers} />
      )}
    </>
  );
}

/** Mockup 06_historial_feedback.png (incluye ExportButton, mockup 07) — RF-04, RF-05, RF-06, RF-07, RF-09. */
export function VersionHistoryPage() {
  const { courseId = "", projectId = "" } = useParams();
  return (
    <ProjectGate courseId={courseId} projectId={projectId}>
      {/* key: al cambiar de proyecto se reinicia todo el estado de la pantalla. */}
      {(course, project) => <VersionHistory key={project.id} course={course} project={project} />}
    </ProjectGate>
  );
}
