import type {
  CourseProgressResponse,
  ProgressResponse,
  ProjectCreateRequest,
  ProjectUpdateRequest,
  StudentProgressResponse,
} from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCourse,
  createProject,
  deleteProject,
  getCourseProgress,
  joinCourse,
  listCourses,
  listProjects,
  updateProject,
} from "./api";

export const courseKeys = {
  all: ["courses"] as const,
  projects: (courseId: string) => ["courses", courseId, "projects"] as const,
  progress: (courseId: string) => ["courses", courseId, "progress"] as const,
};

export function useCourses() {
  return useQuery({ queryKey: courseKeys.all, queryFn: listCourses });
}

/**
 * Un curso por id. No existe `GET /courses/{id}`: se toma del listado del usuario, que ya
 * aplica la pertenencia (cursos propios o matriculados).
 */
export function useCourse(courseId: string) {
  const query = useCourses();
  return { ...query, course: query.data?.find((course) => course.id === courseId) };
}

export function useCreateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCourse,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: courseKeys.all }),
  });
}

export function useJoinCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: joinCourse,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: courseKeys.all }),
  });
}

export function useCourseProjects(courseId: string) {
  return useQuery({
    queryKey: courseKeys.projects(courseId),
    queryFn: () => listProjects(courseId),
  });
}

/** Un proyecto por id, desde el listado del curso (no existe `GET /projects/{id}`). */
export function useProject(courseId: string, projectId: string) {
  const query = useCourseProjects(courseId);
  return { ...query, project: query.data?.find((project) => project.id === projectId) };
}

export function useCreateProject(courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectCreateRequest) => createProject(courseId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: courseKeys.projects(courseId) }),
  });
}

/** Editar u ocultar/mostrar. La visibilidad cambia el progreso que ven los estudiantes. */
export function useUpdateProject(courseId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectUpdateRequest) => updateProject(projectId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.projects(courseId) });
      queryClient.invalidateQueries({ queryKey: courseKeys.progress(courseId) });
    },
  });
}

export function useDeleteProject(courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => deleteProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.projects(courseId) });
      queryClient.invalidateQueries({ queryKey: courseKeys.progress(courseId) });
    },
  });
}

export function useProgress(courseId: string) {
  return useQuery({
    queryKey: courseKeys.progress(courseId),
    queryFn: () => getCourseProgress(courseId),
  });
}

export function isTeacherProgress(progress: ProgressResponse): progress is CourseProgressResponse {
  return "students" in progress;
}

export function isStudentProgress(progress: ProgressResponse): progress is StudentProgressResponse {
  return !("students" in progress);
}
