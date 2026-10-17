import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";
import { handlers, setRole } from "./mocks/handlers";

export const server = setupServer(...handlers);

// jsdom no implementa scrollTo (ScrollToTop) ni las URLs de objetos (miniaturas y PDF).
window.scrollTo = () => undefined;
URL.createObjectURL ??= () => "blob:test";
URL.revokeObjectURL ??= () => undefined;

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  setRole("estudiante");
});
afterAll(() => server.close());
