import { Button } from "@/components/ui/button";
import { toApiError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { FileQuestion, Lock, RefreshCw, WifiOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Estado vacío con llamado a la acción, nunca una lista en blanco (sección 10). */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface/60 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-ink/[0.05] text-muted">
        <Icon className="size-6" aria-hidden />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="font-semibold">{title}</p>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  /** Mensaje para 403 según la pantalla ("No tienes acceso a este curso."). */
  forbiddenMessage?: string;
  className?: string;
}

/**
 * Error de una consulta (sección 10): 403 se explica como falta de acceso (nunca como 404),
 * 404 ofrece volver al panel y las fallas de red/servidor permiten reintentar.
 */
export function ErrorState({ error, onRetry, forbiddenMessage, className }: ErrorStateProps) {
  const apiError = toApiError(error);

  if (apiError.kind === "forbidden") {
    return (
      <EmptyState
        icon={Lock}
        title={forbiddenMessage ?? "No tienes acceso a este recurso."}
        description="Si crees que deberías verlo, pide al docente el código del curso."
        action={
          <Button asChild variant="secondary">
            <Link to="/">Ir a mis cursos</Link>
          </Button>
        }
        className={className}
      />
    );
  }

  if (apiError.kind === "notFound") {
    return (
      <EmptyState
        icon={FileQuestion}
        title="No encontramos lo que buscas"
        description={apiError.message}
        action={
          <Button asChild variant="secondary">
            <Link to="/">Volver al panel</Link>
          </Button>
        }
        className={className}
      />
    );
  }

  return (
    <EmptyState
      icon={WifiOff}
      title={apiError.message}
      action={
        onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            <RefreshCw aria-hidden />
            Reintentar
          </Button>
        )
      }
      className={className}
    />
  );
}
