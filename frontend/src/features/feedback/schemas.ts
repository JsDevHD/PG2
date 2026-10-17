import { z } from "zod";

/** Campo vacío → undefined: `Number("")` daría 0 y se guardaría una nota que nadie puso. */
const emptyToUndefined = (value: unknown) =>
  value === "" || value === null || value === undefined ? undefined : Number(value);

const scoreNumber = z
  .number({ invalid_type_error: "Escribe una nota entre 0 y 5" })
  .min(0, "La nota mínima es 0")
  .max(5, "La nota máxima es 5");

const comment = z
  .string()
  .trim()
  .min(1, "Escribe un comentario")
  .max(5000, "Máximo 5000 caracteres");

/**
 * Retroalimentación parcial (mismas reglas que Feedback Service): comentario obligatorio y nota
 * opcional. Una versión admite varios comentarios pero una sola calificación parcial vigente.
 */
export const feedbackSchema = z.object({
  comment,
  score: z.preprocess(emptyToUndefined, scoreNumber.optional()),
});
export type FeedbackFormValues = z.infer<typeof feedbackSchema>;

/** Calificación final (RF-09): la nota es obligatoria. */
export const finalGradeSchema = z.object({
  comment,
  score: z.preprocess(
    emptyToUndefined,
    z
      .number({
        required_error: "Escribe una nota entre 0 y 5",
        invalid_type_error: "Escribe una nota entre 0 y 5",
      })
      .min(0, "La nota mínima es 0")
      .max(5, "La nota máxima es 5"),
  ),
});
export type FinalGradeFormValues = z.infer<typeof finalGradeSchema>;
