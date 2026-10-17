import type { GroupResponse, ProjectResponse } from "@/types/api";

/**
 * ¿Se pueden repartir `students` estudiantes en grupos de entre `min` y `max` integrantes sin que
 * nadie quede por fuera? Es posible si existe un número de grupos k con k·min ≤ n ≤ k·max, es
 * decir, si ⌈n/max⌉ ≤ ⌊n/min⌋.
 */
export function groupFormation(students: number, min: number, max: number) {
  const fewestGroups = Math.ceil(students / max);
  const mostGroups = Math.floor(students / min);
  return {
    possible: students > 0 && fewestGroups <= mostGroups,
    fewestGroups,
    mostGroups,
  };
}

/**
 * Advertencia para el docente si con los estudiantes inscritos no se pueden formar los grupos.
 * No bloquea: los estudiantes pueden seguir uniéndose al curso. `undefined` si todo cuadra.
 */
export function groupFormationWarning(
  students: number,
  min: number,
  max: number,
): string | undefined {
  if (min > max) return undefined; // lo informa la validación del formulario
  if (students === 0) {
    return "Aún no hay estudiantes inscritos en el curso: los grupos se formarán cuando se unan.";
  }
  if (students < min) {
    return `Con ${students} ${students === 1 ? "estudiante inscrito" : "estudiantes inscritos"} no alcanza para un grupo de mínimo ${min}.`;
  }
  if (!groupFormation(students, min, max).possible) {
    return `Con ${students} estudiantes no se pueden formar grupos de ${min} a ${max} sin que alguien quede por fuera.`;
  }
  return undefined;
}

/** ¿Sigue abierto el plazo para formar grupos? */
export function groupsOpen(project: ProjectResponse, now = Date.now()): boolean {
  return Boolean(project.group_deadline) && Date.parse(project.group_deadline ?? "") >= now;
}

export function isGroupProject(project: ProjectResponse): boolean {
  return project.work_mode === "group";
}

/** Grupo al que pertenece el estudiante en el proyecto, si ya tiene uno. */
export function groupOf(groups: GroupResponse[] | undefined, studentId: string) {
  return groups?.find((group) => group.member_ids.includes(studentId));
}

/**
 * Valor para `<input type="datetime-local">` (hora local, sin zona) a partir de un ISO, y al revés.
 * El backend recibe y guarda la fecha con zona (UTC).
 */
export function toLocalInput(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}
