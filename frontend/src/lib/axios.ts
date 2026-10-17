import axios from "axios";
import { config } from "./config";
import { clearToken, getToken, notifySessionExpired } from "./session";

/**
 * Instancia única de Axios (sección 7.3). Solo conoce el API Gateway: nunca la URL de un
 * microservicio. Ningún componente la importa directamente; se usa desde los `api.ts` de cada
 * feature.
 */
export const axiosInstance = axios.create({
  baseURL: config.apiGatewayUrl,
  timeout: 60_000,
});

axiosInstance.interceptors.request.use((request) => {
  const token = getToken();
  if (token) request.headers.Authorization = `Bearer ${token}`;
  return request;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 de una petición que llevaba token: inválido o expirado (RNF-01) → se cierra la sesión.
    // Se decide por la petición y no por el almacenamiento: si otra pestaña ya borró el token,
    // esta igual debe enterarse. El 401 del login (sin token) no cierra nada.
    // 403 (H-6) NO cierra sesión: lo muestra el componente que hizo la llamada.
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      error.config?.headers?.Authorization
    ) {
      clearToken();
      notifySessionExpired();
    }
    return Promise.reject(error);
  },
);
