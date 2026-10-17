import { screen, within } from "@testing-library/react";
import { renderApp } from "./render";

describe("RoleRoute (H-6 también en la interfaz)", () => {
  it("redirige al estudiante que entra a una ruta de docente", async () => {
    renderApp("/courses/c1/projects/new", { as: "estudiante" });
    expect(
      await screen.findByText("Esta sección no está disponible para tu rol"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Crear proyecto" })).not.toBeInTheDocument();
  });

  it("redirige al docente que entra a la subida de versiones", async () => {
    renderApp("/courses/c1/projects/p1/upload", { as: "docente" });
    expect(
      await screen.findByText("Esta sección no está disponible para tu rol"),
    ).toBeInTheDocument();
  });

  it("deja pasar al docente a su ruta", async () => {
    renderApp("/courses/c1/projects/new", { as: "docente" });
    expect(await screen.findByRole("heading", { name: "Crear proyecto" })).toBeInTheDocument();
  });

  it("muestra la página de no encontrado en rutas desconocidas", async () => {
    renderApp("/no-existe", { as: "docente" });
    expect(await screen.findByText("Esta página no existe")).toBeInTheDocument();
  });
});

describe("Navegación lateral", () => {
  it("lista los cursos y, en el curso abierto, sus proyectos", async () => {
    renderApp("/courses/c1", { as: "estudiante" });
    const nav = await screen.findByRole("navigation", { name: "Navegación principal" });
    expect(await within(nav).findByRole("link", { name: /Diseño Gráfico III/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await within(nav).findByRole("link", { name: "Rediseño de marca" })).toBeInTheDocument();
    // Los accesos de docente no aparecen para el estudiante.
    expect(within(nav).queryByRole("link", { name: /Progreso del curso/ })).not.toBeInTheDocument();
  });

  it("al docente le ofrece crear proyecto y ver el progreso del curso", async () => {
    renderApp("/courses/c1", { as: "docente" });
    const nav = await screen.findByRole("navigation", { name: "Navegación principal" });
    expect(await within(nav).findByRole("link", { name: /Crear proyecto/ })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: /Progreso del curso/ })).toBeInTheDocument();
  });
});
