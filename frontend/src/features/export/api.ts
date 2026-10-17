import { axiosInstance } from "@/lib/axios";
import type { PortfolioExportRequest } from "@/types/api";

export interface ExportedPdf {
  blob: Blob;
  filename: string;
}

function filenameFrom(disposition: string | undefined, fallback: string): string {
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return match?.[1] ? decodeURIComponent(match[1]) : fallback;
}

/**
 * RF-07 / CU-04. Export Service devuelve el binario del PDF (no una URL).
 * Para el estudiante el backend ignora `studentId`; para el docente es obligatorio.
 */
/**
 * Portafolio académico del estudiante: los proyectos elegidos (de uno o varios cursos), con o sin
 * comentarios, calificaciones e imágenes. Puede tardar si incluye muchas imágenes.
 */
export async function exportStudentPortfolio(body: PortfolioExportRequest): Promise<ExportedPdf> {
  const response = await axiosInstance.post<Blob>("/api/v1/portfolio/export", body, {
    responseType: "blob",
    timeout: 180_000,
  });
  return {
    blob: response.data,
    filename: filenameFrom(response.headers["content-disposition"], "portafolio_academico.pdf"),
  };
}

export async function exportPortfolio(projectId: string, studentId?: string): Promise<ExportedPdf> {
  const response = await axiosInstance.get<Blob>(`/api/v1/projects/${projectId}/export`, {
    params: { student_id: studentId },
    responseType: "blob",
    timeout: 120_000,
  });
  return {
    blob: response.data,
    filename: filenameFrom(response.headers["content-disposition"], "portafolio.pdf"),
  };
}
