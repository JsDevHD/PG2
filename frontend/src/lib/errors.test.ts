import { AxiosError, AxiosHeaders } from "axios";
import { toApiError } from "./errors";

function axiosError(status: number | undefined, data?: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response =
    status === undefined ? undefined : { status, data, statusText: "", headers: {}, config };
  return new AxiosError("error", undefined, config, undefined, response);
}

describe("toApiError", () => {
  it("usa el detail del backend", () => {
    expect(toApiError(axiosError(403, { detail: "No tiene permisos sobre este recurso" }))).toEqual(
      {
        kind: "forbidden",
        status: 403,
        message: "No tiene permisos sobre este recurso",
      },
    );
  });

  it("une los errores de validación de FastAPI", () => {
    const error = axiosError(422, { detail: [{ msg: "campo requerido" }, { msg: "muy corto" }] });
    expect(toApiError(error).message).toBe("campo requerido. muy corto");
  });

  it("no muestra detalles técnicos de un 5xx", () => {
    expect(toApiError(axiosError(503, { detail: "Traceback..." })).message).toBe(
      "No se pudo conectar con el servidor. Intenta de nuevo.",
    );
  });

  it("trata la falta de respuesta como error de red", () => {
    expect(toApiError(axiosError(undefined)).kind).toBe("network");
  });
});
