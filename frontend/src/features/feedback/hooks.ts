import { courseKeys } from "@/features/courses/hooks";
import type { FeedbackCreateRequest, FeedbackResponse, FinalGradeCreateRequest } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignFinalGrade,
  createFeedback,
  listFinalGrades,
  listProjectFeedback,
  listVersionFeedback,
} from "./api";

export const feedbackKeys = {
  version: (versionId: string) => ["feedback", "version", versionId] as const,
  project: (projectId: string) => ["feedback", "project", projectId] as const,
  finalGrades: (projectId: string) => ["feedback", "final", projectId] as const,
};

export function useFeedback(versionId: string | undefined) {
  return useQuery({
    queryKey: feedbackKeys.version(versionId ?? ""),
    queryFn: () => listVersionFeedback(versionId as string),
    enabled: Boolean(versionId),
  });
}

export function useProjectFeedback(projectId: string) {
  return useQuery({
    queryKey: feedbackKeys.project(projectId),
    queryFn: () => listProjectFeedback(projectId),
  });
}

export function useFinalGrades(projectId: string) {
  return useQuery({
    queryKey: feedbackKeys.finalGrades(projectId),
    queryFn: () => listFinalGrades(projectId),
  });
}

function useInvalidateFeedback(projectId: string, courseId: string) {
  const queryClient = useQueryClient();
  return (versionId: string) => {
    queryClient.invalidateQueries({ queryKey: feedbackKeys.version(versionId) });
    queryClient.invalidateQueries({ queryKey: feedbackKeys.project(projectId) });
    queryClient.invalidateQueries({ queryKey: feedbackKeys.finalGrades(projectId) });
    // El progreso (RF-08) depende de qué versiones tienen retroalimentación.
    queryClient.invalidateQueries({ queryKey: courseKeys.progress(courseId) });
  };
}

export function useCreateFeedback(versionId: string, projectId: string, courseId: string) {
  const invalidate = useInvalidateFeedback(projectId, courseId);
  return useMutation({
    mutationFn: (body: FeedbackCreateRequest) => createFeedback(versionId, body),
    onSuccess: () => invalidate(versionId),
  });
}

export function useAssignFinalGrade(projectId: string, courseId: string) {
  const invalidate = useInvalidateFeedback(projectId, courseId);
  return useMutation({
    mutationFn: (body: FinalGradeCreateRequest) => assignFinalGrade(projectId, body),
    onSuccess: (_, body) => invalidate(body.version_id),
  });
}

/** Calificación parcial vigente de una versión: con nota, no final y no reemplazada. */
export function currentPartialGrade(feedback: FeedbackResponse[] | undefined) {
  return feedback?.find((item) => !item.is_final && !item.score_replaced && item.score !== null);
}
