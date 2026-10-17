import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

/** Placeholder con la forma del contenido final: evita saltos de layout al cargar (sección 10). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-lg bg-ink/[0.07]", className)}
      {...props}
    />
  );
}
