import { z } from "zod";

/** Validación de UX: refleja las reglas de Auth Service, que sigue siendo la autoridad final. */
const BCRYPT_MAX_BYTES = 72;

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Escribe tu correo").email("Escribe un correo válido"),
  password: z.string().min(1, "Escribe tu contraseña"),
});
export type LoginForm = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(100, "Máximo 100 caracteres"),
  email: z.string().trim().min(1, "Escribe tu correo").email("Escribe un correo válido"),
  password: z
    .string()
    .min(8, "Mínimo 8 caracteres")
    .max(72, "Máximo 72 caracteres")
    .refine((value) => new TextEncoder().encode(value).length <= BCRYPT_MAX_BYTES, {
      message: "La contraseña es demasiado larga (las tildes y la ñ ocupan más espacio)",
    }),
  // errorMap y no required_error: con ningún radio marcado react-hook-form entrega null (no
  // undefined), y Zod mostraría su mensaje en inglés ("Expected 'estudiante' | 'docente'…").
  role: z.enum(["estudiante", "docente"], {
    errorMap: () => ({ message: "Elige si te registras como estudiante o como docente" }),
  }),
  // Autorización previa, expresa e informada (Ley 1581 de 2012): la casilla no viene marcada.
  acceptLegal: z.literal(true, {
    errorMap: () => ({
      message:
        "Para crear la cuenta debes aceptar los términos y autorizar el tratamiento de tus datos",
    }),
  }),
});
export type RegisterForm = z.infer<typeof registerSchema>;
