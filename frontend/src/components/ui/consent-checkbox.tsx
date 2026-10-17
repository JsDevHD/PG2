import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { type InputHTMLAttributes, type ReactNode, forwardRef, useId } from "react";

interface ConsentCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  /** Texto adicional bajo la casilla (p. ej. el aviso de privacidad). */
  details?: ReactNode;
  error?: string;
}

/**
 * Casilla de consentimiento: nunca viene marcada (la autorización debe ser expresa) y el texto
 * completo queda asociado al control para los lectores de pantalla.
 */
export const ConsentCheckbox = forwardRef<HTMLInputElement, ConsentCheckboxProps>(
  ({ label, details, error, className, ...props }, ref) => {
    const id = useId();
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label
          htmlFor={id}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink",
            error ? "border-danger" : "border-border hover:border-ink/30",
          )}
        >
          <span className="relative mt-0.5 flex size-5 shrink-0">
            <input
              ref={ref}
              id={id}
              type="checkbox"
              className="peer size-5 cursor-pointer appearance-none rounded border border-ink/40 bg-surface checked:border-ink checked:bg-ink"
              aria-invalid={error ? true : undefined}
              aria-describedby={
                [details ? `${id}-details` : "", error ? `${id}-error` : ""].join(" ").trim() ||
                undefined
              }
              {...props}
            />
            <Check
              className="pointer-events-none absolute inset-0 m-auto size-3.5 text-surface opacity-0 peer-checked:opacity-100"
              aria-hidden
            />
          </span>
          <span className="leading-relaxed">{label}</span>
        </label>
        {details && (
          <div id={`${id}-details`} className="px-1 text-xs leading-relaxed text-muted">
            {details}
          </div>
        )}
        {error && (
          <p id={`${id}-error`} role="alert" className="text-sm text-danger-ink">
            {error}
          </p>
        )}
      </div>
    );
  },
);
ConsentCheckbox.displayName = "ConsentCheckbox";
