import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { API } from "./mocks/handlers";
import { renderApp } from "./render";
import { server } from "./setup";

describe("CourseOnboardingPage", () => {
  it("al docente le muestra sus cursos y el formulario para crear uno", async () => {
    renderApp("/", { as: "docente" });
    expect(
      await within(await screen.findByRole("main")).findByText("Diseño Gráfico III"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear curso" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unirme al curso" })).not.toBeInTheDocument();
  });

  it("al estudiante le muestra el error del backend si el código no existe", async () => {
    server.use(
      http.post(`${API}/api/v1/courses/join`, () =>
        HttpResponse.json({ detail: "Código de curso inválido" }, { status: 404 }),
      ),
    );
    renderApp("/", { as: "estudiante" });

    await userEvent.type(await screen.findByLabelText("Código de curso"), "xxxxxx");
    await userEvent.click(screen.getByRole("button", { name: "Unirme al curso" }));

    expect(await screen.findByText("Código de curso inválido")).toBeInTheDocument();
  });
});

describe("Paneles del curso", () => {
  it("el docente ve los proyectos y el progreso por estudiante con nombres", async () => {
    renderApp("/courses/c1", { as: "docente" });
    expect(await screen.findByRole("heading", { name: "Diseño Gráfico III" })).toBeInTheDocument();
    expect(
      await within(await screen.findByRole("main")).findByText("Rediseño de marca"),
    ).toBeInTheDocument();
    const progress = await screen.findByRole("progressbar", { name: "Progreso de Ana Díaz" });
    expect(progress).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Copiar código del curso DG3X7Q/ }),
    ).toBeInTheDocument();
  });

  it("el estudiante ve su progreso general y sus proyectos", async () => {
    renderApp("/courses/c1", { as: "estudiante" });
    expect(await screen.findByText("Tu progreso general")).toBeInTheDocument();
    const row = (
      await within(await screen.findByRole("main")).findByText("Rediseño de marca")
    ).closest("li") as HTMLElement;
    expect(await within(row).findByText(/2 versiones subidas/)).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: /Subir versión/ })).toBeInTheDocument();
  });

  it("muestra 'sin acceso' si el curso no es del usuario (nunca un 404)", async () => {
    renderApp("/courses/otro", { as: "estudiante" });
    expect(await screen.findByText("No tienes acceso a este curso.")).toBeInTheDocument();
  });
});
