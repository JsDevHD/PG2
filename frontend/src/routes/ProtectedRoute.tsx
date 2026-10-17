import { EmptyState } from "@/components/layout/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/AuthContext";
import { RefreshCw, WifiOff } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

/** Requiere sesión: sin token válido redirige a /login y recuerda a dónde iba el usuario. */
export function ProtectedRoute() {
  const { user, isLoading, sessionError, retrySession, signedOut } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-24 sm:px-6"
        aria-busy
        aria-label="Cargando sesión"
      >
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  // El servidor no respondió al revalidar: la sesión sigue guardada, solo falta reintentar.
  if (sessionError) {
    return (
      <div className="mx-auto max-w-md px-4 pt-24">
        <EmptyState
          icon={WifiOff}
          title="No se pudo conectar con el servidor"
          description="Tu sesión sigue guardada. Revisa tu conexión e intenta de nuevo."
          action={
            <Button variant="secondary" onClick={retrySession}>
              <RefreshCw aria-hidden />
              Reintentar
            </Button>
          }
        />
      </div>
    );
  }
  // Tras cerrar sesión no se recuerda la página: el siguiente login puede ser de otra cuenta.
  if (!user)
    return (
      <Navigate
        to="/login"
        replace
        state={signedOut ? undefined : { from: location.pathname + location.search }}
      />
    );
  return <Outlet />;
}
