import { cn } from "@/lib/utils";
import { FileImage, FileText, UploadCloud, X } from "lucide-react";
import { type DragEvent, useId, useRef, useState } from "react";

/** Mismos formatos y límite que valida Projects Service (RNF-05); el backend es la autoridad. */
export const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
  "image/svg+xml",
] as const;
export const MAX_FILE_MB = 20;

export function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
    return "Formato de archivo no permitido. Formatos aceptados: JPG, PNG, PDF y SVG";
  }
  if (file.size === 0) return "El archivo está vacío";
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return `El archivo supera el tamaño máximo permitido de ${MAX_FILE_MB} MB`;
  }
  return null;
}

interface FileDropzoneProps {
  value: File | null;
  onChange: (file: File | null) => void;
  invalid?: boolean;
  describedBy?: string;
  id?: string;
  disabled?: boolean;
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileDropzone({
  value,
  onChange,
  invalid,
  describedBy,
  id,
  disabled,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onChange(file);
  };

  if (value) {
    const Icon = value.type.startsWith("image/") ? FileImage : FileText;
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-bg/60 p-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface text-ink shadow-sm">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{value.name}</p>
          <p className="text-xs text-muted">{formatSize(value.size)}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          disabled={disabled}
          className="rounded-md p-2 text-muted hover:bg-ink/5 hover:text-ink"
          aria-label={`Quitar ${value.name}`}
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <label
      htmlFor={inputId}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors",
        dragging
          ? "border-student bg-student-soft/40"
          : "border-border bg-bg/50 hover:border-ink/40",
        invalid && "border-danger",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <UploadCloud className="size-7 text-muted" aria-hidden />
      <span className="text-sm font-medium text-ink">
        Arrastra tu archivo o haz clic para elegirlo
      </span>
      <span className="text-xs text-muted">JPG, PNG, PDF o SVG, hasta {MAX_FILE_MB} MB</span>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="sr-only"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}
