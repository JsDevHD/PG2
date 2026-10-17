import { THEME_KEY, applyTheme, getThemePreference, resolveTheme } from "@/lib/theme";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import { renderApp } from "./render";

const html = document.documentElement;

/** Simula la preferencia del sistema operativo (jsdom no implementa matchMedia). */
function systemPrefers(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  html.classList.remove("dark");
  // biome-ignore lint/performance/noDelete: se restaura el jsdom original (sin matchMedia).
  delete (window as Partial<Window>).matchMedia;
});

describe("Tema", () => {
  it("por defecto sigue al sistema", () => {
    systemPrefers(true);
    expect(getThemePreference()).toBe("system");
    expect(resolveTheme("system")).toBe("dark");
    applyTheme("system");
    expect(html).toHaveClass("dark");

    systemPrefers(false);
    applyTheme("system");
    expect(html).not.toHaveClass("dark");
  });

  it("el botón del encabezado recorre sistema → claro → oscuro y lo recuerda", async () => {
    systemPrefers(true);
    renderApp("/login");

    await userEvent.click(
      await screen.findByRole("button", { name: "Tema: Sistema. Cambiar a claro" }),
    );
    expect(html).not.toHaveClass("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");

    await userEvent.click(screen.getByRole("button", { name: "Tema: Claro. Cambiar a oscuro" }));
    expect(html).toHaveClass("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");

    await userEvent.click(screen.getByRole("button", { name: "Tema: Oscuro. Cambiar a sistema" }));
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(html).toHaveClass("dark"); // el sistema prefiere oscuro
  });

  it("el tema guardado se aplica también dentro de la app", async () => {
    localStorage.setItem(THEME_KEY, "dark");
    renderApp("/", { as: "estudiante" });
    expect(
      await screen.findByRole("button", { name: "Tema: Oscuro. Cambiar a sistema" }),
    ).toBeInTheDocument();
    expect(html).toHaveClass("dark");
  });
});
