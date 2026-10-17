import { EmptyState } from "@/components/layout/States";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { FileQuestion, Lock } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  useDocumentTitle("Página no encontrada");
  return (
    <EmptyState
      icon={FileQuestion}
      title="Esta página no existe"
      description="Revisa la dirección o vuelve a tus cursos."
      action={
        <Button asChild variant="secondary">
          <Link to="/">Ir a mis cursos</Link>
        </Button>
      }
      className="mt-10"
    />
  );
}

export function UnauthorizedPage() {
  useDocumentTitle("Sección no disponible");
  return (
    <EmptyState
      icon={Lock}
      title="Esta sección no está disponible para tu rol"
      description="Las acciones de docente y de estudiante están separadas."
      action={
        <Button asChild variant="secondary">
          <Link to="/">Ir a mis cursos</Link>
        </Button>
      }
      className="mt-10"
    />
  );
}
