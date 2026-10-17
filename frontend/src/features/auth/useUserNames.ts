import { useQuery } from "@tanstack/react-query";
import { getUsersBatch } from "./api";

/**
 * Nombres de usuarios por id vía `GET /users/batch` (Feedback y Projects solo devuelven ids).
 * Si Auth Service no responde, el mapa queda vacío y la UI muestra un texto de reemplazo, igual
 * que la degradación del backend.
 */
export function useUserNames(ids: Array<string | undefined>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))].sort();
  const query = useQuery({
    queryKey: ["users", "batch", unique],
    queryFn: () => getUsersBatch(unique),
    enabled: unique.length > 0,
    staleTime: 5 * 60_000,
  });
  const names = new Map((query.data ?? []).map((user) => [user.id, user.name]));
  return {
    nameOf: (id: string | undefined, fallback = "Nombre no disponible") =>
      (id && names.get(id)) || fallback,
    isLoading: query.isLoading,
  };
}
