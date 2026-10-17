import { axiosInstance } from "@/lib/axios";
import type { FeedbackCreateRequest, FeedbackResponse, FinalGradeCreateRequest } from "@/types/api";

export async function createFeedback(
  versionId: string,
  body: FeedbackCreateRequest,
): Promise<FeedbackResponse> {
  const { data } = await axiosInstance.post<FeedbackResponse>(
    `/api/v1/versions/${versionId}/feedback`,
    body,
  );
  return data;
}

export async function listVersionFeedback(versionId: string): Promise<FeedbackResponse[]> {
  const { data } = await axiosInstance.get<FeedbackResponse[]>(
    `/api/v1/versions/${versionId}/feedback`,
  );
  return data;
}

/** Para el estudiante el backend filtra siempre por su propio `student_id`. */
export async function listProjectFeedback(projectId: string): Promise<FeedbackResponse[]> {
  const { data } = await axiosInstance.get<FeedbackResponse[]>(
    `/api/v1/projects/${projectId}/feedback`,
  );
  return data;
}

/** Retorna los registros creados: uno, o uno por integrante si el proyecto se califica por grupo. */
export async function assignFinalGrade(
  projectId: string,
  body: FinalGradeCreateRequest,
): Promise<FeedbackResponse[]> {
  const { data } = await axiosInstance.post<FeedbackResponse[]>(
    `/api/v1/projects/${projectId}/final-grade`,
    body,
  );
  return data;
}

export async function listFinalGrades(projectId: string): Promise<FeedbackResponse[]> {
  const { data } = await axiosInstance.get<FeedbackResponse[]>(
    `/api/v1/projects/${projectId}/final-grade`,
  );
  return data;
}
