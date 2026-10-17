import { axiosInstance } from "@/lib/axios";
import type {
  CourseCreateRequest,
  CourseJoinRequest,
  CourseResponse,
  ProgressResponse,
  ProjectCreateRequest,
  ProjectResponse,
  ProjectUpdateRequest,
} from "@/types/api";

export async function listCourses(): Promise<CourseResponse[]> {
  const { data } = await axiosInstance.get<CourseResponse[]>("/api/v1/courses");
  return data;
}

export async function createCourse(body: CourseCreateRequest): Promise<CourseResponse> {
  const { data } = await axiosInstance.post<CourseResponse>("/api/v1/courses", body);
  return data;
}

/** Idempotente: unirse dos veces al mismo curso devuelve el mismo curso. */
export async function joinCourse(body: CourseJoinRequest): Promise<CourseResponse> {
  const { data } = await axiosInstance.post<CourseResponse>("/api/v1/courses/join", body);
  return data;
}

export async function listProjects(courseId: string): Promise<ProjectResponse[]> {
  const { data } = await axiosInstance.get<ProjectResponse[]>(
    `/api/v1/courses/${courseId}/projects`,
  );
  return data;
}

export async function createProject(
  courseId: string,
  body: ProjectCreateRequest,
): Promise<ProjectResponse> {
  const { data } = await axiosInstance.post<ProjectResponse>(
    `/api/v1/courses/${courseId}/projects`,
    body,
  );
  return data;
}

export async function updateProject(
  projectId: string,
  body: ProjectUpdateRequest,
): Promise<ProjectResponse> {
  const { data } = await axiosInstance.patch<ProjectResponse>(
    `/api/v1/projects/${projectId}`,
    body,
  );
  return data;
}

/** Solo si el proyecto no tiene versiones (si las tiene, 409: se oculta en su lugar). */
export async function deleteProject(projectId: string): Promise<void> {
  await axiosInstance.delete(`/api/v1/projects/${projectId}`);
}

/** La forma depende del rol: docente → CourseProgressResponse; estudiante → StudentProgressResponse. */
export async function getCourseProgress(courseId: string): Promise<ProgressResponse> {
  const { data } = await axiosInstance.get<ProgressResponse>(
    `/api/v1/courses/${courseId}/progress`,
  );
  return data;
}
