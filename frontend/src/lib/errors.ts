import type { ApiErrorBody } from "@/types/api";
import axios from "axios";

export type ErrorKind =
  | "network"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "validation"
  | "conflict"
  | "server";

export interface ApiError {
  kind: ErrorKind;
  status?: number;
  /** Mensaje listo para mostrar: el `detail` del backend cuando existe (sección 10). */
  message: string;
}

const FALLBACK: Record<ErrorKind, string> = {
  network: "No se pudo conectar con el servidor. Intenta de nuevo.",
  unauthorized: "Tu sesión terminó. Inicia sesión de nuevo.",
  forbidden: "No tienes acceso a este recurso.",
  notFound: "No encontramos lo que buscas.",
  validation: "Revisa los datos del formulario.",
  conflict: "Ya existe un registro con esos datos.",
  server: "No se pudo conectar con el servidor. Intenta de nuevo.",
};

function kindFromStatus(status: number): ErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 409) return "conflict";
  if (status === 400 || status === 422) return "validation";
  return "server";
}

function detailMessage(data: unknown): string | undefined {
  const detail = (data as Partial<ApiErrorBody> | undefined)?.detail;
  if (typeof detail === "string") return detail;
  // 422 de validación de FastAPI: lista de errores por campo.
  if (Array.isArray(detail) && detail.length > 0) return detail.map((d) => d.msg).join(". ");
  return undefined;
}

export function toApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (!status) return { kind: "network", message: FALLBACK.network };
    const kind = kindFromStatus(status);
    // En 5xx el detail suele ser técnico o no existir: se muestra el mensaje genérico.
    const message =
      kind === "server" ? FALLBACK.server : (detailMessage(error.response?.data) ?? FALLBACK[kind]);
    return { kind, status, message };
  }
  return { kind: "server", message: FALLBACK.server };
}

export function errorMessage(error: unknown): string {
  return toApiError(error).message;
}
