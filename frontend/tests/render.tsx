import { Toaster } from "@/components/ui/toast";
import { AuthProvider } from "@/features/auth/AuthContext";
import { createQueryClient } from "@/lib/queryClient";
import { setToken } from "@/lib/session";
import { AppRoutes } from "@/routes";
import type { Role } from "@/types/api";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setRole } from "./mocks/handlers";

/** Renderiza la app completa (rutas, guards y providers) en `path`, opcionalmente con sesión. */
export function renderApp(path: string, options: { as?: Role } = {}) {
  if (options.as) {
    setRole(options.as);
    setToken("test-token");
  }
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <MemoryRouter
          initialEntries={[path]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <AppRoutes />
        </MemoryRouter>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>,
  );
}
