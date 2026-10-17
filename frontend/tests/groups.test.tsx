import { groupFormation, groupFormationWarning } from "@/lib/groups";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import * as data from "./mocks/data";
import { API } from "./mocks/handlers";
import { renderApp } from "./render";
import { server } from "./setup";

/** Hace que el curso tenga, además del proyecto individual, el proyecto por grupos. */
function withGroupProject(overrides: Partial<typeof data.groupProject> = {}) {
  const groupProject = { ...data.groupProject, ...overrides };
  server.use(
    http.get(`${API}/api/v1/courses/:courseId/projects`, () =>
      HttpResponse.json([data.project, groupProject]),
    ),
  );
  return groupProject;
}

describe("Formación de grupos (cálculo)", () => {
  it("sabe cuándo se puede repartir a todos en grupos de min a max", () => {
    expect(groupFormation(7, 2, 3)).toEqual({ possible: true, fewestGroups: 3, mostGroups: 3 });
    expect(groupFormation(5, 4, 4).possible).toBe(false); // 4 + 1 suelto
    expect(groupFormation(8, 4, 4).possible).toBe(true);
    expect(groupFormation(0, 2, 3).possible).toBe(false);
  });

  it("advierte si no alcanzan los estudiantes o alguien quedaría por fuera", () => {
    expect(groupFormationWarning(1, 2, 3)).toMatch(/no alcanza para un grupo de mínimo 2/);
    expect(groupFormationWarning(5, 4, 4)).toMatch(/sin que alguien quede por fuera/);
    expect(groupFormationWarning(0, 2, 3)).toMatch(/Aún no hay estudiantes inscritos/);
    expect(groupFormationWarning(6, 2, 3)).toBeUndefined();
  });
});

describe("Crear proyecto por grupos", () => {
  it("advierte que no alcanzan los inscritos y envía la configuración de grupos", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${API}/api/v1/courses/:courseId/projects`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(data.groupProject, { status: 201 });
      }),
    );
    renderApp("/courses/c1/projects/new", { as: "docente" });

    await userEvent.type(await screen.findByLabelText("Título"), "Campaña en equipo");
    await userEvent.click(screen.getByText("Por grupos"));
    // El curso de prueba tiene 1 estudiante inscrito.
    expect(
      await screen.findByText(/Con 1 estudiante inscrito no alcanza para un grupo de mínimo 2/),
    ).toBeInTheDocument();

    const max = screen.getByLabelText("Máximo por grupo");
    await userEvent.clear(max);
    await userEvent.type(max, "3");
    await userEvent.click(screen.getByText("Por grupo"));
    await userEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));

    await waitFor(() => expect(body.work_mode).toBe("group"));
    expect(body).toMatchObject({ group_min_size: 2, group_max_size: 3, grading_mode: "group" });
    expect(Date.parse(body.group_deadline as string)).toBeGreaterThan(Date.now());
  });

  it("valida que el máximo no sea menor que el mínimo", async () => {
    renderApp("/courses/c1/projects/new", { as: "docente" });
    await userEvent.type(await screen.findByLabelText("Título"), "Campaña");
    await userEvent.click(screen.getByText("Por grupos"));
    const min = screen.getByLabelText("Mínimo por grupo");
    await userEvent.clear(min);
    await userEvent.type(min, "5");
    await userEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));

    expect(
      await screen.findByText("El máximo no puede ser menor que el mínimo"),
    ).toBeInTheDocument();
  });
});

describe("Grupos del estudiante", () => {
  it("sin grupo, el historial lo lleva a elegir uno y puede unirse", async () => {
    withGroupProject();
    let joined = "";
    server.use(
      http.get(`${API}/api/v1/projects/:projectId/groups`, () =>
        HttpResponse.json([{ ...data.groups[0], member_ids: ["s2"] }, data.groups[1]]),
      ),
      http.post(`${API}/api/v1/projects/:projectId/groups/:groupId/join`, ({ params }) => {
        joined = params.groupId as string;
        return HttpResponse.json({ ...data.groups[0], member_ids: ["s2", "s1"] });
      }),
    );
    renderApp("/courses/c1/projects/p2/versions", { as: "estudiante" });

    expect(await screen.findByText("Este proyecto es por grupos")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Subir versión/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Elegir grupo" }));

    const card = (await screen.findByText("Los Bauhaus")).closest("li") as HTMLElement;
    expect(within(card).getByText("Bruno Gómez")).toBeInTheDocument();
    await userEvent.click(within(card).getByRole("button", { name: /Unirme/ }));
    await waitFor(() => expect(joined).toBe("g1"));
  });

  it("con grupo, ve las versiones del grupo y quién subió cada una", async () => {
    withGroupProject();
    server.use(
      http.get(`${API}/api/v1/projects/:projectId/versions`, () =>
        HttpResponse.json([data.groupVersion]),
      ),
      http.get(`${API}/api/v1/projects/:projectId/feedback`, () => HttpResponse.json([])),
    );
    renderApp("/courses/c1/projects/p2/versions", { as: "estudiante" });

    const strip = await screen.findByRole("list", { name: "Historial de versiones" });
    expect(await within(strip).findByText("Subida por Bruno Gómez")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Los Bauhaus/ })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Cierre del proyecto de Los Bauhaus" }),
    ).toBeInTheDocument();
  });

  it("al docente le advierte quién no tiene grupo", async () => {
    withGroupProject();
    server.use(
      http.get(`${API}/api/v1/projects/:projectId/groups`, () =>
        HttpResponse.json([{ ...data.groups[0], member_ids: ["s2"] }]),
      ),
    );
    renderApp("/courses/c1/projects/p2/groups", { as: "docente" });

    const warnings = await screen.findByRole("list", { name: "Advertencias" });
    expect(
      await within(warnings).findByText(/1 estudiante no tiene grupo: Ana Díaz/),
    ).toBeInTheDocument();
    expect(
      within(warnings).getByText(/Por debajo del mínimo de 2: Los Bauhaus \(1\)/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Cambiar fecha límite")).toBeInTheDocument();
  });
});

describe("Calificación final en proyectos por grupos", () => {
  async function assignFrom(path: string, before?: () => Promise<void>) {
    let body: Record<string, unknown> = {};
    server.use(
      http.get(`${API}/api/v1/projects/:projectId/versions`, () =>
        HttpResponse.json([data.groupVersion]),
      ),
      http.post(`${API}/api/v1/projects/:projectId/final-grade`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json([], { status: 201 });
      }),
    );
    renderApp(path, { as: "docente" });
    await before?.();
    await userEvent.click(
      await screen.findByRole("button", { name: "Asignar calificación final" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Comentario final"), "Buen trabajo");
    await userEvent.type(within(dialog).getByLabelText("Nota final"), "4.5");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Asignar calificación final" }),
    );
    await waitFor(() => expect(body.version_id).toBe("gv1"));
    return { body, dialog };
  }

  it("con calificación grupal se califica al grupo entero, sin elegir integrante", async () => {
    withGroupProject({ grading_mode: "group" });
    const { body } = await assignFrom("/courses/c1/projects/p2/versions");
    expect(body.student_id).toBeUndefined();
    expect(screen.queryByLabelText("Integrante")).not.toBeInTheDocument();
  });

  it("con calificación individual se envía el integrante elegido", async () => {
    withGroupProject({ grading_mode: "individual" });
    const { body } = await assignFrom("/courses/c1/projects/p2/versions", async () => {
      await userEvent.selectOptions(await screen.findByLabelText("Integrante"), "s2");
    });
    expect(body.student_id).toBe("s2");
  });
});

describe("Mi portafolio", () => {
  it("es exclusivo del estudiante", async () => {
    renderApp("/portafolio", { as: "docente" });
    expect(
      await screen.findByText("Esta sección no está disponible para tu rol"),
    ).toBeInTheDocument();
  });

  it("genera el PDF con los proyectos y opciones elegidas", async () => {
    withGroupProject();
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${API}/api/v1/portfolio/export`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.arrayBuffer(new TextEncoder().encode("%PDF-1.4").buffer, {
          headers: { "Content-Type": "application/pdf" },
        });
      }),
    );
    renderApp("/portafolio", { as: "estudiante" });

    // Por defecto van todos los proyectos de todos los cursos.
    expect(await screen.findByText("2 proyectos de 1 curso.")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Rediseño de marca"));
    await userEvent.click(screen.getByLabelText(/Comentarios del docente/));
    expect(screen.getByText("1 proyecto de 1 curso.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Generar portafolio en PDF/ }));

    await waitFor(() => expect(body.project_ids).toEqual(["p2"]));
    expect(body).toMatchObject({
      include_feedback: false,
      include_grades: true,
      include_images: true,
    });
  });

  it("no deja generar sin proyectos elegidos", async () => {
    renderApp("/portafolio", { as: "estudiante" });
    await userEvent.click(await screen.findByLabelText("Todos mis cursos y proyectos"));
    expect(screen.getByText("Elige al menos un proyecto.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generar portafolio en PDF/ })).toBeDisabled();
  });
});
