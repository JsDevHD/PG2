import { downloadBlob } from "@/lib/download";
import type { PortfolioExportRequest } from "@/types/api";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { exportPortfolio, exportStudentPortfolio } from "./api";

/** Con `responseType: "blob"` el error JSON del backend también llega como Blob: se reconvierte. */
async function normalizeBlobError(error: unknown): Promise<never> {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      error.response.data = JSON.parse(await error.response.data.text());
    } catch {
      // Respuesta no JSON: se deja tal cual y se muestra el mensaje genérico.
    }
  }
  throw error;
}

export function useExportStudentPortfolio() {
  return useMutation({
    mutationFn: (body: PortfolioExportRequest) =>
      exportStudentPortfolio(body).catch(normalizeBlobError),
    onSuccess: ({ blob, filename }) => downloadBlob(blob, filename),
  });
}

export function useExportPortfolio(projectId: string, studentId?: string) {
  return useMutation({
    mutationFn: () => exportPortfolio(projectId, studentId).catch(normalizeBlobError),
    // Descarga con `<a download>` programático (sección 9, detalle de ExportButton).
    onSuccess: ({ blob, filename }) => downloadBlob(blob, filename),
  });
}
