import { axiosInstance } from "@/lib/axios";
import type {
  GroupCreateRequest,
  GroupDeadlineRequest,
  GroupResponse,
  ProjectResponse,
  VersionResponse,
} from "@/types/api";

export async function uploadVersion(
  projectId: string,
  file: File,
  description: string,
): Promise<VersionResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("description", description);
  // Declaración de autoría y permisos (obligatoria; Projects Service la registra con la fecha).
  form.append("rights_declaration", "true");
  const { data } = await axiosInstance.post<VersionResponse>(
    `/api/v1/projects/${projectId}/versions`,
    form,
    {
      // Sin Content-Type explícito: Axios lo genera a partir del FormData con su `boundary`.
      // Hasta 20 MB: con una conexión lenta tarda más que el timeout general de 60 s.
      timeout: 300_000,
    },
  );
  return data;
}

/**
 * Para el estudiante el backend ignora los filtros y fuerza sus propias versiones (o las de su
 * grupo). El docente puede filtrar por estudiante o, en proyectos por grupos, por grupo.
 */
export async function listVersions(
  projectId: string,
  filter: { studentId?: string; groupId?: string } = {},
): Promise<VersionResponse[]> {
  const { data } = await axiosInstance.get<VersionResponse[]>(
    `/api/v1/projects/${projectId}/versions`,
    {
      params: { student_id: filter.studentId, group_id: filter.groupId },
    },
  );
  return data;
}

/** Grupos del proyecto con sus integrantes (lista vacía si es individual). */
export async function listGroups(projectId: string): Promise<GroupResponse[]> {
  const { data } = await axiosInstance.get<GroupResponse[]>(`/api/v1/projects/${projectId}/groups`);
  return data;
}

export async function createGroup(
  projectId: string,
  body: GroupCreateRequest,
): Promise<GroupResponse> {
  const { data } = await axiosInstance.post<GroupResponse>(
    `/api/v1/projects/${projectId}/groups`,
    body,
  );
  return data;
}

/** Idempotente: unirse al grupo propio devuelve el mismo grupo. */
export async function joinGroup(projectId: string, groupId: string): Promise<GroupResponse> {
  const { data } = await axiosInstance.post<GroupResponse>(
    `/api/v1/projects/${projectId}/groups/${groupId}/join`,
  );
  return data;
}

export async function leaveGroup(projectId: string, groupId: string): Promise<void> {
  await axiosInstance.post(`/api/v1/projects/${projectId}/groups/${groupId}/leave`);
}

export async function updateGroupDeadline(
  projectId: string,
  body: GroupDeadlineRequest,
): Promise<ProjectResponse> {
  const { data } = await axiosInstance.post<ProjectResponse>(
    `/api/v1/projects/${projectId}/group-deadline`,
    body,
  );
  return data;
}

export async function getVersion(projectId: string, versionId: string): Promise<VersionResponse> {
  const { data } = await axiosInstance.get<VersionResponse>(
    `/api/v1/projects/${projectId}/versions/${versionId}`,
  );
  return data;
}

/** Archivo de la versión. Blob Storage es privado: se descarga por la API con el JWT. */
export async function getVersionFile(projectId: string, versionId: string): Promise<Blob> {
  const { data } = await axiosInstance.get<Blob>(
    `/api/v1/projects/${projectId}/versions/${versionId}/file`,
    {
      responseType: "blob",
    },
  );
  return data;
}
