import { courseKeys } from "@/features/courses/hooks";
import type { VersionResponse } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  createGroup,
  getVersion,
  getVersionFile,
  joinGroup,
  leaveGroup,
  listGroups,
  listVersions,
  updateGroupDeadline,
  uploadVersion,
} from "./api";

/** Filtro del historial (solo lo usa el docente): un estudiante o, por grupos, un grupo. */
export interface VersionFilter {
  studentId?: string;
  groupId?: string;
}

function filterKey({ studentId, groupId }: VersionFilter): string {
  if (groupId) return `group:${groupId}`;
  return studentId ?? "all";
}

export const versionKeys = {
  list: (projectId: string, filter: VersionFilter = {}) =>
    ["versions", projectId, filterKey(filter)] as const,
  project: (projectId: string) => ["versions", projectId] as const,
  detail: (projectId: string, versionId: string) => ["version", projectId, versionId] as const,
  file: (projectId: string, versionId: string) => ["version-file", projectId, versionId] as const,
};

export function useVersions(
  projectId: string,
  filter: VersionFilter = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: versionKeys.list(projectId, filter),
    queryFn: () => listVersions(projectId, filter),
    enabled: options?.enabled ?? true,
  });
}

export const groupKeys = {
  list: (projectId: string) => ["groups", projectId] as const,
};

/** Grupos del proyecto. Solo se piden en proyectos por grupos. */
export function useGroups(projectId: string, enabled = true) {
  return useQuery({
    queryKey: groupKeys.list(projectId),
    queryFn: () => listGroups(projectId),
    enabled,
  });
}

/**
 * Al cambiar de grupo cambia lo que el estudiante ve: el historial de su grupo, su
 * retroalimentación y su progreso.
 */
function useInvalidateGroups(projectId: string, courseId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: groupKeys.list(projectId) });
    queryClient.invalidateQueries({ queryKey: versionKeys.project(projectId) });
    queryClient.invalidateQueries({ queryKey: ["feedback", "project", projectId] });
    queryClient.invalidateQueries({ queryKey: courseKeys.progress(courseId) });
  };
}

export function useCreateGroup(projectId: string, courseId: string) {
  const invalidate = useInvalidateGroups(projectId, courseId);
  return useMutation({
    mutationFn: (name: string | undefined) => createGroup(projectId, name ? { name } : {}),
    onSettled: invalidate,
  });
}

export function useJoinGroup(projectId: string, courseId: string) {
  const invalidate = useInvalidateGroups(projectId, courseId);
  return useMutation({
    mutationFn: (groupId: string) => joinGroup(projectId, groupId),
    // También tras un error: un 409 "grupo completo" significa que la lista ya cambió.
    onSettled: invalidate,
  });
}

export function useLeaveGroup(projectId: string, courseId: string) {
  const invalidate = useInvalidateGroups(projectId, courseId);
  return useMutation({
    mutationFn: (groupId: string) => leaveGroup(projectId, groupId),
    onSettled: invalidate,
  });
}

export function useUpdateGroupDeadline(projectId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deadline: string) => updateGroupDeadline(projectId, { group_deadline: deadline }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: courseKeys.projects(courseId) }),
  });
}

export function useVersion(projectId: string, versionId: string) {
  return useQuery({
    queryKey: versionKeys.detail(projectId, versionId),
    queryFn: () => getVersion(projectId, versionId),
  });
}

export function useUploadVersion(projectId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { file: File; description: string }) =>
      uploadVersion(projectId, vars.file, vars.description),
    // onSettled y no onSuccess: si la conexión se corta, el backend pudo guardar la versión igual;
    // refrescar el historial antes de reintentar evita duplicados (las versiones son inmutables).
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: versionKeys.project(projectId) });
      queryClient.invalidateQueries({ queryKey: courseKeys.progress(courseId) });
    },
  });
}

/** Tipos que la interfaz sabe mostrar; cualquier otro contenido no se renderiza. */
export type PreviewType = "image" | "pdf";

function previewTypeOf(mime: string): PreviewType | undefined {
  if (mime === "image/png" || mime === "image/jpeg" || mime === "image/svg+xml") return "image";
  if (mime === "application/pdf") return "pdf";
  return undefined;
}

/**
 * URL local (`blob:`) del archivo de una versión para mostrarlo.
 *
 * Seguridad: el tipo se decide por el Content-Type real del archivo, nunca por la extensión del
 * nombre. Una URL `blob:` hereda el origen de la app, así que un SVG con scripts abierto como
 * documento (iframe o pestaña) podría leer la sesión. Las imágenes (SVG incluido) solo van en
 * `<img>`, donde no se ejecutan scripts, y el iframe solo recibe PDF de verdad.
 */
export function useVersionFileUrl(projectId: string, versionId: string, enabled = true) {
  const query = useQuery({
    queryKey: versionKeys.file(projectId, versionId),
    queryFn: () => getVersionFile(projectId, versionId),
    enabled,
    // Una versión nunca cambia (RNF-08).
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 10 * 60_000,
  });
  const blob = query.data;
  const previewType = blob ? previewTypeOf(blob.type) : undefined;
  const [url, setUrl] = useState<string>();

  // Crear y liberar la URL en el mismo efecto: con StrictMode el efecto corre dos veces y una URL
  // creada fuera de él quedaría revocada.
  useEffect(() => {
    if (!blob || !previewType) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob, previewType]);

  return { url, previewType, blob, isLoading: query.isLoading, isError: query.isError };
}

/** Nombre original del archivo (el blob se guarda como `{uuid}_{nombre}`). */
export function fileNameOf(version: VersionResponse): string {
  const last = decodeURIComponent(version.file_url.split("/").pop() ?? "");
  return last.replace(/^[0-9a-f]{32}_/, "") || "archivo";
}

export type FileKind = "image" | "pdf" | "svg" | "other";

export function fileKindOf(version: VersionResponse): FileKind {
  const name = fileNameOf(version).toLowerCase();
  if (name.endsWith(".svg")) return "svg";
  if (name.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g)$/.test(name)) return "image";
  return "other";
}

/** Dueño del hilo de una versión: su grupo en proyectos por grupos, si no su autor. */
export function threadOf(version: VersionResponse): string {
  return version.group_id ?? version.student_id;
}

/**
 * Numera las versiones por hilo en orden cronológico (v1, v2…): por estudiante en proyectos
 * individuales y por grupo en proyectos por grupos. El backend las entrega ordenadas por
 * `uploaded_at` ascendente.
 */
export function numberVersions(versions: VersionResponse[]): Map<string, number> {
  const counters = new Map<string, number>();
  const numbers = new Map<string, number>();
  for (const version of versions) {
    const owner = threadOf(version);
    const next = (counters.get(owner) ?? 0) + 1;
    counters.set(owner, next);
    numbers.set(version.id, next);
  }
  return numbers;
}
