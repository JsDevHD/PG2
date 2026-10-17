import { cn } from "@/lib/utils";
import * as LabelPrimitive from "@radix-ui/react-label";
import { type ReactElement, type ReactNode, cloneElement, useId } from "react";

interface FieldProps {
  label: string;
  /** Mensaje de error (del formulario o el `detail` del backend junto al campo). */
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactElement;
}

/** Etiqueta + control + ayuda/error, con los atributos ARIA conectados (sección 12). */
export function Field({ label, error, hint, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <LabelPrimitive.Root htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </LabelPrimitive.Root>
      {cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
