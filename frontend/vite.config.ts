import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    rollupOptions: {
      output: {
        // Librerías en chunks propios: cambian menos que el código de la app y se cachean aparte.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          data: ["@tanstack/react-query", "axios", "zod", "react-hook-form", "@hookform/resolvers"],
          ui: [
            "@radix-ui/react-dialog",
            "@radix-ui/react-label",
            "@radix-ui/react-progress",
            "@radix-ui/react-slot",
            "lucide-react",
            "sonner",
            "date-fns",
          ],
        },
      },
    },
  },
  server: {
    // 5173 es el origen permitido por CORS en los microservicios (CORS_ALLOWED_ORIGINS).
    port: 5173,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    css: false,
    // Los handlers de MSW interceptan este gateway ficticio (tests/mocks/handlers.ts).
    env: { VITE_API_GATEWAY_URL: "http://gateway.test" },
  },
});
