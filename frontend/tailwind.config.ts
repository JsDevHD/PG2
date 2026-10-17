import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// Los colores apuntan a las variables CSS de src/styles/globals.css (sección 5.1 de la
// especificación): nunca se usan hex sueltos dentro de los componentes.
const rgb = (variable: string) => `rgb(var(--color-${variable}) / <alpha-value>)`;
const tone = (name: string) => ({
  DEFAULT: rgb(name),
  soft: rgb(`${name}-soft`),
  ink: rgb(`${name}-ink`),
});

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: rgb("ink"),
        student: tone("student"),
        teacher: tone("teacher"),
        shared: tone("shared"),
        warning: tone("warning"),
        danger: tone("danger"),
        bg: rgb("bg"),
        surface: rgb("surface"),
        border: rgb("border"),
        muted: rgb("text-muted"),
        primary: rgb("primary"),
        chrome: rgb("chrome"),
        canvas: { DEFAULT: rgb("canvas"), ink: rgb("canvas-ink") },
      },
      fontFamily: {
        sans: ["'Inter Variable'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [animate],
} satisfies Config;
