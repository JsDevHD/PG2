import { Toaster as Sonner, toast } from "sonner";

/** Notificaciones de éxito/error (sección 5.4). */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border !border-border !bg-surface !text-ink !shadow-md !font-sans",
          description: "!text-muted",
          actionButton: "!bg-primary !text-surface",
        },
      }}
    />
  );
}

export { toast };
