import { LEGAL_VERSION } from "@/features/legal/legalConfig";
import { getToken } from "@/lib/session";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { API, setRole } from "./mocks/handlers";
import { renderApp } from "./render";
import { server } from "./setup";

describe("LoginPage", () => {
  it("renderiza el formulario y envía las credenciales a login()", async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/api/v1/auth/login`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          access_token: "test-token",
          token_type: "bearer",
          expires_in: 3600,
        });
      }),
    );
    renderApp("/login");

    await userEvent.type(screen.getByLabelText("Correo institucional"), "ana@udi.edu.co");
    await userEvent.type(screen.getByLabelText("Contraseña"), "secreta123");
    await userEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByRole("heading", { name: "Hola, Ana" })).toBeInTheDocument();
    expect(body).toEqual({ email: "ana@udi.edu.co", password: "secreta123" });
    expect(getToken()).toBe("test-token");
  });

  it("muestra el mensaje del backend cuando las credenciales son inválidas", async () => {
    server.use(
      http.post(`${API}/api/v1/auth/login`, () =>
        HttpResponse.json({ detail: "Credenciales inválidas" }, { status: 401 }),
      ),
    );
    renderApp("/login");

    await userEvent.type(screen.getByLabelText("Correo institucional"), "ana@udi.edu.co");
    await userEvent.type(screen.getByLabelText("Contraseña"), "mala");
    await userEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Credenciales inválidas");
    expect(getToken()).toBeNull();
  });

  it("valida el formulario antes de llamar al backend", async () => {
    renderApp("/login");
    await userEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(await screen.findByText("Escribe tu correo")).toBeInTheDocument();
  });
});

describe("Sesión", () => {
  it("redirige a /login sin sesión", async () => {
    renderApp("/courses/c1");
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  });

  it("cierra la sesión si el token guardado expiró (401 en /auth/me)", async () => {
    server.use(
      http.get(`${API}/api/v1/auth/me`, () =>
        HttpResponse.json({ detail: "Token inválido o expirado" }, { status: 401 }),
      ),
    );
    renderApp("/", { as: "estudiante" });
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    await waitFor(() => expect(getToken()).toBeNull());
  });

  it("sin sesión, al entrar vuelve a la página que se pedía", async () => {
    renderApp("/courses/c1/progress");
    await userEvent.type(await screen.findByLabelText("Correo institucional"), "laura@udi.edu.co");
    await userEvent.type(screen.getByLabelText("Contraseña"), "secreta123");
    setRole("docente");
    await userEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(await screen.findByRole("heading", { name: "Progreso del curso" })).toBeInTheDocument();
  });

  it("tras cerrar sesión, el siguiente login empieza en el inicio y no en la página anterior", async () => {
    renderApp("/courses/c1/progress", { as: "docente" });
    await screen.findByRole("heading", { name: "Progreso del curso" });
    await userEvent.click(screen.getAllByRole("button", { name: "Cerrar sesión" })[0]);

    await userEvent.type(await screen.findByLabelText("Correo institucional"), "ana@udi.edu.co");
    await userEvent.type(screen.getByLabelText("Contraseña"), "secreta123");
    setRole("estudiante");
    await userEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByRole("heading", { name: "Hola, Ana" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Progreso del curso" })).not.toBeInTheDocument();
  });
});

describe("RegisterPage", () => {
  it("muestra el 409 de correo duplicado junto al campo", async () => {
    server.use(
      http.post(`${API}/api/v1/auth/register`, () =>
        HttpResponse.json({ detail: "El correo ya está registrado" }, { status: 409 }),
      ),
    );
    renderApp("/register");

    await userEvent.click(screen.getByText("Estudiante"));
    await userEvent.type(screen.getByLabelText("Nombre completo"), "Ana Díaz");
    await userEvent.type(screen.getByLabelText("Correo institucional"), "ana@udi.edu.co");
    await userEvent.type(screen.getByLabelText("Contraseña"), "secreta123");
    await userEvent.click(screen.getByRole("checkbox", { name: /Acepto los términos de uso/ }));
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText("El correo ya está registrado")).toBeInTheDocument();
  });

  it("sin elegir rol pide el rol en español y no llama al backend", async () => {
    let called = false;
    server.use(
      http.post(`${API}/api/v1/auth/register`, () => {
        called = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderApp("/register");

    // Todo lo demás completo: solo falta el rol (react-hook-form lo entrega como null).
    await userEvent.type(screen.getByLabelText("Nombre completo"), "Ana Díaz");
    await userEvent.type(screen.getByLabelText("Correo institucional"), "ana@udi.edu.co");
    await userEvent.type(screen.getByLabelText("Contraseña"), "secreta123");
    await userEvent.click(screen.getByRole("checkbox", { name: /Acepto los términos de uso/ }));
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(
      await screen.findByText("Elige si te registras como estudiante o como docente"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Expected/)).not.toBeInTheDocument();
    expect(called).toBe(false);
  });
});

describe("Revalidación de la sesión", () => {
  it("si el servidor falla (502) conserva el token y ofrece reintentar", async () => {
    server.use(
      http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json({}, { status: 502 }), {
        once: true,
      }),
    );
    renderApp("/", { as: "estudiante" });
    expect(await screen.findByText("No se pudo conectar con el servidor")).toBeInTheDocument();
    expect(getToken()).toBe("test-token");

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Hola, Ana" })).toBeInTheDocument();
  });
});

describe("Autorización de datos en el registro", () => {
  it("no crea la cuenta sin la autorización expresa", async () => {
    let called = false;
    server.use(
      http.post(`${API}/api/v1/auth/register`, () => {
        called = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderApp("/register");
    await userEvent.click(screen.getByText("Estudiante"));
    await userEvent.type(screen.getByLabelText("Nombre completo"), "Ana Díaz");
    await userEvent.type(screen.getByLabelText("Correo institucional"), "ana@udi.edu.co");
    await userEvent.type(screen.getByLabelText("Contraseña"), "secreta123");
    const consent = screen.getByRole("checkbox", { name: /Acepto los términos de uso/ });
    expect(consent).not.toBeChecked(); // la autorización nunca viene marcada

    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText(/debes aceptar los términos/)).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it("envía la aceptación y la versión de los documentos legales", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${API}/api/v1/auth/register`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderApp("/register");
    await userEvent.click(screen.getByText("Estudiante"));
    await userEvent.type(screen.getByLabelText("Nombre completo"), "Ana Díaz");
    await userEvent.type(screen.getByLabelText("Correo institucional"), "ana@udi.edu.co");
    await userEvent.type(screen.getByLabelText("Contraseña"), "secreta123");
    await userEvent.click(screen.getByRole("checkbox", { name: /Acepto los términos de uso/ }));
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() => expect(body.accept_legal).toBe(true));
    expect(body.legal_version).toBe(LEGAL_VERSION);
  });
});
