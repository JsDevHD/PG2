import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * `navigator.clipboard` solo existe en contextos seguros (https o localhost). Si se abre la app
 * por http desde otro equipo (IP de la red), se usa la copia clásica con una selección temporal.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Código del curso para compartir con los estudiantes, con botón de copiar. */
export function CourseCode({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } else {
      toast.error(`No se pudo copiar. El código es ${code}.`);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-teacher-soft px-3 py-1 font-mono text-xs font-semibold tracking-wider text-teacher-ink transition-colors hover:bg-teacher-soft/70",
        className,
      )}
      aria-label={copied ? `Código ${code} copiado` : `Copiar código del curso ${code}`}
    >
      {code}
      {copied ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
    </button>
  );
}
