import { screen, within } from "@testing-library/react";
import { renderApp } from "./render";

describe("Documentos legales", () => {
  it.each([
    [
      "/legal/privacidad",
      "Política de tratamiento de datos personales",
      /Ley Estatutaria\s+1581 de 2012/,
    ],
    ["/legal/terminos", "Términos y condiciones de uso", /Uso permitido/],
    ["/legal/derechos-de-autor", "Derechos de autor y contenido", /Reportar una infracción/],
  ])("%s se puede leer sin iniciar sesión", async (path, title, text) => {
    renderApp(path);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  });

  it("la política informa los plazos de consultas y reclamos", async () => {
    renderApp("/legal/privacidad");
    const section = await screen.findByRole("region", { name: /Cómo ejercer tus derechos/ });
    expect(within(section).getByText(/10 días hábiles/)).toBeInTheDocument();
    expect(within(section).getByText(/15 días hábiles/)).toBeInTheDocument();
  });

  it("los enlaces legales están en la barra lateral de la app", async () => {
    renderApp("/", { as: "estudiante" });
    const footer = await screen.findByRole("navigation", { name: "Información legal" });
    expect(within(footer).getByRole("link", { name: "Tratamiento de datos" })).toHaveAttribute(
      "href",
      "/legal/privacidad",
    );
  });
});

describe("Colofón de las pantallas públicas", () => {
  it("el login muestra los enlaces legales al pie", async () => {
    renderApp("/login");
    const legal = await screen.findByRole("navigation", { name: "Información legal" });
    expect(within(legal).getByRole("link", { name: "Términos de uso" })).toHaveAttribute(
      "href",
      "/legal/terminos",
    );
    expect(screen.getByText(/Proyecto de grado de la UDI/)).toBeInTheDocument();
  });

  it("la política identifica a la UDI como responsable y su canal oficial", async () => {
    renderApp("/legal/privacidad");
    const section = await screen.findByRole("region", { name: /Responsable del tratamiento/ });
    expect(within(section).getByText(/890212433-5/)).toBeInTheDocument();
    expect(within(section).getByText("datos@udi.edu.co")).toBeInTheDocument();
    expect(screen.getByText(/Tus datos no salen de la universidad/)).toBeInTheDocument();
  });
});
