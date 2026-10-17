import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import * as data from "./mocks/data";
import { API } from "./mocks/handlers";
import { renderApp } from "./render";
import { server } from "./setup";

/** Captura el cuerpo del PATCH /projects/{id}. */
function capturePatch() {
  const calls: Array<Record<string, unknown>> = [];
  server.use(
    http.patch(`${API}/api/v1/projects/:projectId`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      calls.push(body);
      return HttpResponse.json({ ...data.project, ...body });
    }),
  );
  return calls;
}

function withoutVersions() {
  server.use(http.get(`${API}/api/v1/projects/:projectId/versions`, () => HttpResponse.json([])));
}

describe("Editar proyecto", () => {
  it("con versiones, bloquea la modalidad pero deja cambiar el título", async () => {
    const calls = capturePatch();
    renderApp("/courses/c1/projects/p1/edit", { as: "docente" });

    expect(await screen.findByText(/ya no se pueden cambiar/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Por grupos/ })).toBeDisabled();
    const title = screen.getByLabelText("Título");
    expect(title).toHaveValue("Rediseño de marca");
    await userEvent.clear(title);
    await userEvent.type(title, "Rediseño de marca local");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ title: "Rediseño de marca local", hidden: false });
    expect(calls[0]).not.toHaveProperty("work_mode");
  });

  it("sin entregas, permite pasar el proyecto a grupos", async () => {
    withoutVersions();
    const calls = capturePatch();
    renderApp("/courses/c1/projects/p1/edit", { as: "docente" });

    await userEvent.click(await screen.findByText("Por grupos"));
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ work_mode: "group", group_min_size: 2, group_max_size: 4 });
    expect(Date.parse(calls[0].group_deadline as string)).toBeGreaterThan(Date.now());
  });

  it("el estudiante no puede editar", async () => {
    renderApp("/courses/c1/projects/p1/edit", { as: "estudiante" });
    expect(
      await screen.findByText("Esta sección no está disponible para tu rol"),
    ).toBeInTheDocument();
  });
});

describe("Ocultar y eliminar", () => {
  it("el docente oculta un proyecto desde el panel del curso", async () => {
    const calls = capturePatch();
    renderApp("/courses/c1", { as: "docente" });

    const main = await screen.findByRole("main");
    await userEvent.click(await within(main).findByRole("button", { name: "Ocultar" }));

    await waitFor(() => expect(calls).toEqual([{ hidden: true }]));
  });

  it("un proyecto oculto se marca en el panel del docente", async () => {
    server.use(
      http.get(`${API}/api/v1/courses/:courseId/projects`, () =>
        HttpResponse.json([{ ...data.project, hidden: true }]),
      ),
    );
    renderApp("/courses/c1", { as: "docente" });
    const main = await screen.findByRole("main");
    expect(await within(main).findByText("Oculto para los estudiantes")).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "Mostrar" })).toBeInTheDocument();
  });

  it("con versiones no se elimina: ofrece ocultarlo en su lugar", async () => {
    let deleted = false;
    server.use(
      http.delete(`${API}/api/v1/projects/:projectId`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const calls = capturePatch();
    renderApp("/courses/c1/projects/p1/versions", { as: "docente" });

    await userEvent.click(await screen.findByRole("button", { name: "Eliminar" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/Tiene 2 versiones/)).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: /Eliminar proyecto/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: /Ocultar en su lugar/ }));

    await waitFor(() => expect(calls).toEqual([{ hidden: true }]));
    expect(deleted).toBe(false);
  });

  it("sin versiones se elimina y vuelve al curso", async () => {
    withoutVersions();
    let deleted = "";
    server.use(
      http.delete(`${API}/api/v1/projects/:projectId`, ({ params }) => {
        deleted = params.projectId as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp("/courses/c1/projects/p1/versions", { as: "docente" });

    await userEvent.click(await screen.findByRole("button", { name: "Eliminar" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(await within(dialog).findByRole("button", { name: /Eliminar proyecto/ }));

    await waitFor(() => expect(deleted).toBe("p1"));
    expect(await screen.findByRole("heading", { name: "Diseño Gráfico III" })).toBeInTheDocument();
  });

  it("el estudiante no ve las acciones del docente", async () => {
    renderApp("/courses/c1/projects/p1/versions", { as: "estudiante" });
    expect(await screen.findByRole("link", { name: /Subir versión/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ocultar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
  });
});
