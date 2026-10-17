// Aplica el tema antes de pintar la página, para que el modo oscuro no parpadee en claro al cargar.
// Es un archivo externo y no un <script> en línea porque la CSP solo permite scripts propios
// (script-src 'self'). La lógica completa vive en src/lib/theme.ts; esto solo replica el arranque.
(() => {
  let preference = "system";
  try {
    preference = localStorage.getItem("theme") || "system";
  } catch {
    // Almacenamiento bloqueado: se sigue al sistema.
  }
  const dark =
    preference === "dark" ||
    (preference !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
})();
