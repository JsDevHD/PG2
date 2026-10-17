import { NEXT_THEME, type ThemePreference, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Monitor, Moon, Sun } from "lucide-react";

const LABELS: Record<ThemePreference, string> = {
  system: "Sistema",
  light: "Claro",
  dark: "Oscuro",
};

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/**
 * Botón del encabezado para el tema: recorre sistema → claro → oscuro. El nombre accesible dice el
 * tema actual y a cuál cambia, y el ícono muestra el actual.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const next = NEXT_THEME[preference];
  const Icon = ICONS[preference];
  const label = `Tema: ${LABELS[preference]}. Cambiar a ${LABELS[next].toLowerCase()}`;

  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      className={cn(
        "flex size-9 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white",
        className,
      )}
      aria-label={label}
      title={label}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}
