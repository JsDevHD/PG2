import { useCurrentUser } from "@/features/auth/AuthContext";
import type { Role } from "@/types/api";
import { Navigate, Outlet } from "react-router-dom";

/**
 * Restringe por rol. Es UX, no seguridad: el backend vuelve a validar rol y pertenencia (H-6).
 * Nunca oculta la ruta solo visualmente: si el rol no coincide, redirige a "no autorizado".
 */
export function RoleRoute({ allow }: { allow: Role[] }) {
  const user = useCurrentUser();
  if (!allow.includes(user.role)) return <Navigate to="/no-autorizado" replace />;
  return <Outlet />;
}
