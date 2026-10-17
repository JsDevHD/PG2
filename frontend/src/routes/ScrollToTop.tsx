import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * En una SPA el scroll se conserva entre páginas: al cambiar de ruta se vuelve arriba, salvo que
 * el enlace apunte a una sección (`#id`, como el índice de los documentos legales).
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `pathname` es el disparador.
  useEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}
