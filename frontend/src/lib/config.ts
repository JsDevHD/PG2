/**
 * Configuración del frontend.
 *
 * Con `API_GATEWAY_URL` vacío el frontend usa el mismo origen y su Nginx reenvía `/api/` al
 * gateway: así basta exponer un solo puerto (útil para túneles como el de VS Code).
 *
 * En el contenedor, Nginx genera `/config.js` al arrancar a partir de variables de entorno
 * (`frontend/docker/40-runtime-config.sh`), así que la misma imagen sirve en local y en Azure con
 * otra URL de gateway, sin reconstruirla. En desarrollo (`pnpm dev`) `public/config.js` viene
 * vacío y se usan las variables `VITE_*` de `.env`.
 */
interface RuntimeEnv {
  API_GATEWAY_URL?: string;
  APP_NAME?: string;
}

declare global {
  interface Window {
    __ENV__?: RuntimeEnv;
  }
}

const runtime: RuntimeEnv = (typeof window !== "undefined" && window.__ENV__) || {};

export const config = {
  // "" (cadena vacía) = mismo origen: las llamadas van a /api/... del servidor que sirve la app,
  // que las reenvía al gateway. `undefined` (pnpm dev) = se usa VITE_API_GATEWAY_URL.
  apiGatewayUrl:
    runtime.API_GATEWAY_URL !== undefined
      ? runtime.API_GATEWAY_URL
      : import.meta.env.VITE_API_GATEWAY_URL,
  appName: runtime.APP_NAME || import.meta.env.VITE_APP_NAME || "Seguimiento de Proyectos Gráficos",
};
