import { useCallback, useEffect, useState } from "react";

/**
 * Tema de la interfaz. "system" sigue la preferencia del sistema operativo y cambia en vivo si el
 * usuario la cambia. La preferencia se guarda en este navegador (no en la cuenta).
 *
 * public/theme.js aplica el mismo cálculo antes de pintar, para que no haya un destello claro.
 */
export type ThemePreference = "system" | "light" | "dark";

export const THEME_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") return systemPrefersDark() ? "dark" : "light";
  return preference;
}

export function applyTheme(preference: ThemePreference): void {
  document.documentElement.classList.toggle("dark", resolveTheme(preference) === "dark");
}

function storePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, preference);
  } catch {
    // Sin almacenamiento: el tema dura lo que la pestaña.
  }
}

/** Orden del botón: sistema → claro → oscuro → sistema. */
export const NEXT_THEME: Record<ThemePreference, ThemePreference> = {
  system: "light",
  light: "dark",
  dark: "system",
};

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(getThemePreference);

  const setPreference = useCallback((next: ThemePreference) => {
    storePreference(next);
    applyTheme(next);
    setPreferenceState(next);
  }, []);

  // Con "system", seguir los cambios del sistema operativo (p. ej. el modo nocturno automático).
  useEffect(() => {
    applyTheme(preference);
    if (preference !== "system" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  // Otra pestaña cambió el tema: esta se actualiza igual.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) setPreferenceState(getThemePreference());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { preference, resolved: resolveTheme(preference), setPreference };
}
