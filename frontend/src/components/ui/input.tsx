import { cn } from "@/lib/utils";
import {
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
} from "react";

const fieldBase =
  "w-full rounded-lg border border-border bg-surface px-3 text-base text-ink placeholder:text-muted/80 transition-colors hover:border-ink/30 focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger sm:text-sm";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, "h-11", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, "min-h-24 py-2.5", className)} {...props} />
));
Textarea.displayName = "Textarea";

/** Select nativo: accesible por defecto y con el selector del sistema en móvil. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn(fieldBase, "h-11 cursor-pointer pr-8", className)} {...props} />
  ),
);
Select.displayName = "Select";
