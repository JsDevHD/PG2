import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { feedback, project, versions } from "./mocks/data";
import { API } from "./mocks/handlers";
import { renderApp } from "./render";
import { server } from "./setup";

const HISTORY = "/courses/c1/projects/p1/versions";

describe("VersionHistoryPage", () => {
  it("muestra la tira de versiones y la retroalimentación de la versión elegida", async () => {
    renderApp(`${HISTORY}?version=v1`, { as: "estudiante" });
    expect(await screen.findByText("Retroalimentación de v1")).toBeInTheDocument();
    expect(await screen.findByText("Buena exploración inicial.")).toBeInTheDocument();
    // La nota se redondea a un decimal en el frontend (3.84 → 3.8).
    expect(screen.getAllByText("3.8 / 5.0").length).toBeGreaterThan(0);
    expect(screen.getByText("v2")).toBeInTheDocument();
    // El estudiante no ve el formulario del docente.
    expect(screen.queryByText(/Agregar retroalimentación/)).not.toBeInTheDocument();
  });

  it("el docente agrega retroalimentación y el backend recibe comentario y nota", async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/api/v1/versions/:versionId/feedback`, async ({ request, params }) => {
        body = {
          versionId: params.versionId,
          ...((await request.json()) as Record<string, unknown>),
        };
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderApp(`${HISTORY}?version=v2`, { as: "docente" });

    await userEvent.type(await screen.findByLabelText("Comentario"), "Ajusta el contraste.");
    await userEvent.type(screen.getByLabelText("Calificación (opcional)"), "4.5");
    await userEvent.click(screen.getByRole("button", { name: "Guardar retroalimentación" }));

    await waitFor(() =>
      expect(body).toEqual({ versionId: "v2", comment: "Ajusta el contraste.", score: 4.5 }),
    );
  });

  it("valida la nota entre 0 y 5 antes de enviar", async () => {
    renderApp(`${HISTORY}?version=v2`, { as: "docente" });
    await userEvent.type(await screen.findByLabelText("Comentario"), "Bien");
    await userEvent.type(screen.getByLabelText("Calificación (opcional)"), "7");
    await userEvent.click(screen.getByRole("button", { name: "Guardar retroalimentación" }));
    expect(await screen.findByText("La nota máxima es 5")).toBeInTheDocument();
  });

  it("con 403 explica la falta de acceso", async () => {
    server.use(
      http.get(`${API}/api/v1/projects/:projectId/versions`, () =>
        HttpResponse.json({ detail: "No tiene permisos" }, { status: 403 }),
      ),
    );
    renderApp(HISTORY, { as: "estudiante" });
    expect(await screen.findByText("No tienes acceso a este proyecto.")).toBeInTheDocument();
  });

  it("exporta el portafolio con el nombre de archivo que envía Export Service", async () => {
    const clicks: string[] = [];
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    };
    try {
      renderApp(`${HISTORY}?version=v1`, { as: "estudiante" });
      await userEvent.click(
        await screen.findByRole("button", { name: "Exportar portafolio en PDF" }),
      );
      await waitFor(() => expect(clicks).toEqual(["portafolio_Rediseno_de_marca_Ana_Diaz.pdf"]));
    } finally {
      HTMLAnchorElement.prototype.click = original;
    }
  });
});

describe("UploadVersionPage", () => {
  const UPLOAD = "/courses/c1/projects/p1/upload";

  it("rechaza en el cliente un formato no permitido", async () => {
    renderApp(UPLOAD, { as: "estudiante" });
    await userEvent.type(await screen.findByLabelText("Descripción de esta versión"), "Nueva");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "nota.txt", { type: "text/plain" }), {
      applyAccept: false,
    });
    await userEvent.click(screen.getByRole("checkbox", { name: /Declaro que soy autor/ }));
    await userEvent.click(screen.getByRole("button", { name: "Subir versión" }));
    expect(await screen.findByText(/Formato de archivo no permitido/)).toBeInTheDocument();
  });

  it("muestra el 422 del backend junto al campo del archivo", async () => {
    server.use(
      http.post(`${API}/api/v1/projects/:projectId/versions`, () =>
        HttpResponse.json(
          { detail: "El archivo supera el tamaño máximo permitido de 20 MB" },
          { status: 422 },
        ),
      ),
    );
    renderApp(UPLOAD, { as: "estudiante" });
    await userEvent.type(await screen.findByLabelText("Descripción de esta versión"), "Nueva");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["png"], "logo.png", { type: "image/png" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Declaro que soy autor/ }));
    await userEvent.click(screen.getByRole("button", { name: "Subir versión" }));
    expect(
      await screen.findByText("El archivo supera el tamaño máximo permitido de 20 MB"),
    ).toBeInTheDocument();
  });

  it("no ofrece el formulario si el proyecto ya tiene calificación final", async () => {
    server.use(
      http.get(`${API}/api/v1/projects/:projectId/final-grade`, () =>
        HttpResponse.json([
          {
            id: "f9",
            version_id: "v1",
            project_id: "p1",
            student_id: "s1",
            teacher_id: "t1",
            comment: "Final",
            score: 4.5,
            is_final: true,
            created_at: "2026-09-10T12:00:00Z",
          },
        ]),
      ),
    );
    renderApp(UPLOAD, { as: "estudiante" });
    expect(await screen.findByText(/Ya tienes calificación final/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subir versión" })).not.toBeInTheDocument();
  });
});

describe("Calificaciones", () => {
  it("permite comentar sin nota: no envía score (nunca 0)", async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/api/v1/versions/:versionId/feedback`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderApp(`${HISTORY}?version=v2`, { as: "docente" });
    await userEvent.type(await screen.findByLabelText("Comentario"), "Solo un comentario");
    await userEvent.click(screen.getByRole("button", { name: "Guardar retroalimentación" }));
    await waitFor(() => expect(body).toEqual({ comment: "Solo un comentario" }));
  });

  it("avisa que la calificación vigente se va a reemplazar", async () => {
    // v1 ya tiene una calificación parcial vigente (3.84).
    renderApp(`${HISTORY}?version=v1`, { as: "docente" });
    expect(await screen.findByText(/Calificación parcial vigente/)).toBeInTheDocument();
    expect(screen.queryByText(/la nueva calificación la reemplaza/)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Calificación (opcional)"), "4.5");

    expect(screen.getByText(/la nueva calificación la reemplaza/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar y reemplazar nota" })).toBeInTheDocument();
  });

  it("muestra tachada la calificación reemplazada y no etiqueta comentarios sin nota", async () => {
    server.use(
      http.get(`${API}/api/v1/versions/:versionId/feedback`, () =>
        HttpResponse.json([
          { ...feedback[0], id: "a", comment: "Primera", score: 3.0, score_replaced: true },
          { ...feedback[0], id: "b", comment: "Sin nota", score: null },
          { ...feedback[0], id: "c", comment: "Corregida", score: 4.2 },
        ]),
      ),
    );
    renderApp(`${HISTORY}?version=v1`, { as: "estudiante" });
    expect(await screen.findByText("Calificación reemplazada:")).toBeInTheDocument();
    expect(screen.getByText("3.0 / 5.0").tagName).toBe("S");
    // Un solo pill de calificación parcial vigente (el del comentario "Corregida").
    expect(screen.getAllByText("Calificación parcial:")).toHaveLength(1);
    const sinNota = screen.getByText("Sin nota").closest("li") as HTMLElement;
    expect(within(sinNota).queryByText(/Calificación/)).not.toBeInTheDocument();
  });

  it("recorta los comentarios largos y permite leerlos completos", async () => {
    server.use(
      http.get(`${API}/api/v1/versions/:versionId/feedback`, () =>
        HttpResponse.json([{ ...feedback[0], comment: "Detalle. ".repeat(120), score: null }]),
      ),
    );
    renderApp(`${HISTORY}?version=v1`, { as: "estudiante" });
    const toggle = await screen.findByRole("button", { name: /Ver comentario completo/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: /Ver menos/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("no acumula paneles de cierre al cambiar entre versiones de distintos estudiantes", async () => {
    server.use(
      http.get(`${API}/api/v1/projects/:projectId/versions`, () =>
        HttpResponse.json([
          ...versions,
          { ...versions[0], id: "v3", student_id: "s2", description: "Propuesta de Camila" },
        ]),
      ),
    );
    renderApp(HISTORY, { as: "docente" });
    const main = await screen.findByRole("main");
    await within(main).findByRole("button", { name: "Asignar calificación final" });

    for (const description of [/Boceto inicial/, /Propuesta de Camila/, /Segunda propuesta/]) {
      await userEvent.click(within(main).getByRole("button", { name: description }));
      await within(main).findByRole("button", { name: "Asignar calificación final" });
    }

    expect(
      within(main).getAllByRole("button", { name: "Asignar calificación final" }),
    ).toHaveLength(1);
    expect(within(main).getAllByText("Exportar portafolio")).toHaveLength(1);
    expect(within(main).getAllByRole("heading", { name: /Cierre del proyecto/ })).toHaveLength(1);
  });

  it("muestra el 409 de calificación final dentro del diálogo", async () => {
    server.use(
      http.post(`${API}/api/v1/projects/:projectId/final-grade`, () =>
        HttpResponse.json(
          { detail: "El estudiante ya tiene una calificación final en este proyecto" },
          { status: 409 },
        ),
      ),
    );
    renderApp(`${HISTORY}?version=v2`, { as: "docente" });
    await userEvent.type(await screen.findByLabelText("Comentario final"), "Cierre");
    await userEvent.type(screen.getByLabelText("Nota final"), "4.5");
    await userEvent.click(screen.getByRole("button", { name: "Revisar y confirmar" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar calificación final" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Este estudiante ya tiene una calificación final registrada.",
    );
  });
});

describe("Vista previa de archivos", () => {
  it("no muestra como PDF un archivo .pdf cuyo contenido real es SVG", async () => {
    server.use(
      http.get(`${API}/api/v1/projects/:projectId/versions/:versionId/file`, () =>
        HttpResponse.text('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>', {
          headers: { "Content-Type": "image/svg+xml" },
        }),
      ),
    );
    renderApp(`${HISTORY.replace("/versions", "")}/versions/v2`, { as: "docente" });
    // v2 se llama logo.pdf, pero el servidor dice que es SVG: va en <img>, nunca en un iframe.
    expect(await screen.findByRole("img", { name: /Versión 2/ })).toBeInTheDocument();
    expect(document.querySelector("iframe")).toBeNull();
  });
});

describe("Descripción del proyecto", () => {
  it("se muestra en el historial", async () => {
    renderApp(`${HISTORY}?version=v1`, { as: "estudiante" });
    const brief = await screen.findByRole("region", { name: "Descripción del proyecto" });
    expect(within(brief).getByText("Identidad visual para una marca local.")).toBeInTheDocument();
  });

  it("recorta una descripción larga y permite verla completa", async () => {
    const long = `Entregables: ${"logotipo, paleta y aplicaciones. ".repeat(15)}`;
    server.use(
      http.get(`${API}/api/v1/courses/:courseId/projects`, () =>
        HttpResponse.json([{ ...project, description: long }]),
      ),
    );
    renderApp(`${HISTORY}?version=v1`, { as: "docente" });
    const toggle = await screen.findByRole("button", { name: /Ver descripción completa/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: /Ver menos/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("indica cuando el docente no escribió descripción", async () => {
    server.use(
      http.get(`${API}/api/v1/courses/:courseId/projects`, () =>
        HttpResponse.json([{ ...project, description: "" }]),
      ),
    );
    renderApp("/courses/c1/projects/p1/upload", { as: "estudiante" });
    expect(await screen.findByText(/no agregó una descripción/)).toBeInTheDocument();
  });
});

describe("Declaración de autoría al subir", () => {
  it("no sube la versión sin la declaración y, con ella, la envía", async () => {
    // jsdom no serializa el FormData hacia MSW: se registran los campos que arma `api.ts`.
    const fields = new Map<string, unknown>();
    const append = vi.spyOn(FormData.prototype, "append").mockImplementation(function (
      this: FormData,
      name: string,
      value: unknown,
    ) {
      fields.set(name, value);
    });
    let posted = false;
    server.use(
      http.post(`${API}/api/v1/projects/:projectId/versions`, () => {
        posted = true;
        return HttpResponse.json({ id: "v9" }, { status: 201 });
      }),
    );
    renderApp("/courses/c1/projects/p1/upload", { as: "estudiante" });
    await userEvent.type(await screen.findByLabelText("Descripción de esta versión"), "Nueva");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["png"], "logo.png", { type: "image/png" }));

    await userEvent.click(screen.getByRole("button", { name: "Subir versión" }));
    expect(await screen.findByText(/debes confirmar esta declaración/)).toBeInTheDocument();
    expect(posted).toBe(false);

    await userEvent.click(screen.getByRole("checkbox", { name: /Declaro que soy autor/ }));
    await userEvent.click(screen.getByRole("button", { name: "Subir versión" }));
    await waitFor(() => expect(posted).toBe(true));
    expect(fields.get("rights_declaration")).toBe("true");
    append.mockRestore();
  });
});
