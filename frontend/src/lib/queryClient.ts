import { QueryClient } from "@tanstack/react-query";
import { toApiError } from "./errors";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Reintentar un 401/403/404/422 no cambia el resultado; solo se reintentan fallas de red/5xx.
        retry: (failureCount, error) => {
          const { kind } = toApiError(error);
          return (kind === "network" || kind === "server") && failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}
