import { useEffect } from "react";

export const APP_NAME = "Seguimiento de Proyectos Gráficos";

/**
 * Título de la pestaña por pantalla (WCAG 2.4.2): sin él todas las pestañas se llaman igual y el
 * lector de pantalla no anuncia a qué página se llegó.
 */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} | ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = APP_NAME;
    };
  }, [title]);
}
