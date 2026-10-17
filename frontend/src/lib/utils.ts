import { type ClassValue, clsx } from "clsx";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** "12 sep 2026" */
export function formatDate(iso: string): string {
  return format(parseISO(iso), "d MMM yyyy", { locale: es });
}

/** "12 sep 2026, 14:05" */
export function formatDateTime(iso: string): string {
  return format(parseISO(iso), "d MMM yyyy, HH:mm", { locale: es });
}

/** "hace 3 días" */
export function formatRelative(iso: string): string {
  return formatDistanceToNowStrict(parseISO(iso), { locale: es, addSuffix: true });
}

/** El backend guarda la nota con toda su precisión; el redondeo a un decimal es del frontend. */
export function formatScore(score: number): string {
  return score.toFixed(1);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)} %`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() ||
    "?"
  );
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
