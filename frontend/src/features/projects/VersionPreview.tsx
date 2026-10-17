import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { VersionResponse } from "@/types/api";
import { FileText, ImageOff } from "lucide-react";
import { fileKindOf, fileNameOf, useVersionFileUrl } from "./hooks";

interface VersionPreviewProps {
  version: VersionResponse;
  /** Número de la versión (v1, v2…) para el texto alternativo de la vista grande. */
  number?: number;
  size?: "thumb" | "large";
  className?: string;
}

function FileIcon({ label, className }: { label: string; className: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        className,
        "flex flex-col items-center justify-center gap-1 p-2 text-canvas-ink",
      )}
    >
      <FileText className="size-6" />
      <span className="text-[10px] font-semibold">{label}</span>
    </div>
  );
}

/**
 * Vista previa del archivo de una versión, descargado con el JWT (Blob Storage es privado).
 * La extensión solo decide si vale la pena descargarlo para una miniatura; qué se renderiza lo
 * decide el tipo real del archivo (ver `useVersionFileUrl`).
 */
export function VersionPreview({
  version,
  number,
  size = "thumb",
  className,
}: VersionPreviewProps) {
  const kind = fileKindOf(version);
  const thumb = size === "thumb";
  // Las miniaturas de PDF no se descargan: se representan con un ícono.
  const wantsFile = !thumb || kind === "image" || kind === "svg";
  const { url, previewType, isLoading, isError } = useVersionFileUrl(
    version.project_id,
    version.id,
    wantsFile,
  );
  // En la tira la descripción ya está junto a la miniatura: la imagen es decorativa.
  const alt = thumb ? "" : `${number ? `Versión ${number}: ` : ""}${version.description}`;
  const box = cn(
    "relative overflow-hidden rounded-md border border-border bg-canvas",
    thumb ? "aspect-[4/3] w-24 shrink-0 sm:w-28" : "aspect-[4/3] w-full",
    className,
  );

  if (!wantsFile) return <FileIcon label={kind === "pdf" ? "PDF" : "Archivo"} className={box} />;
  if (isLoading) return <Skeleton className={box} />;
  if (isError || !url || !previewType) {
    return (
      <div
        className={cn(
          box,
          "flex flex-col items-center justify-center gap-1 p-2 text-center text-canvas-ink",
        )}
      >
        <ImageOff className="size-6" aria-hidden />
        <span className="text-xs">Vista previa no disponible</span>
      </div>
    );
  }
  if (previewType === "pdf") {
    if (thumb) return <FileIcon label="PDF" className={box} />;
    return (
      <div className={cn(box, "aspect-auto h-[70vh] bg-surface")}>
        <iframe src={url} title={`${alt} (${fileNameOf(version)})`} className="size-full" />
      </div>
    );
  }
  return (
    <div className={box}>
      <img
        src={url}
        alt={alt}
        className={cn("size-full", thumb ? "object-cover" : "object-contain")}
      />
    </div>
  );
}
