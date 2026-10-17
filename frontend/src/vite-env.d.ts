/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Única URL del backend: el API Gateway (Nginx en local, Azure API Management en la nube). */
  readonly VITE_API_GATEWAY_URL: string;
  readonly VITE_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
