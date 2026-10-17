/**
 * Ilustración de las pantallas públicas: una misma pieza en tres iteraciones (v1 → v3) con un
 * comentario del docente. Comunica lo que hace la plataforma sin texto de marketing.
 * Es decorativa: el contenido real está en el formulario.
 */
function Artboard({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex aspect-[3/4] w-full flex-col gap-2 rounded-md bg-surface p-3 shadow-sm ring-1 ring-ink/10">
      {step === 1 && (
        <>
          <div className="h-1/2 rounded border-2 border-dashed border-ink/25" />
          <div className="h-2 w-3/4 rounded-full bg-ink/15" />
          <div className="h-2 w-1/2 rounded-full bg-ink/15" />
        </>
      )}
      {step === 2 && (
        <>
          <div className="flex h-1/2 items-center justify-center rounded bg-student-soft">
            <div className="size-8 rounded-full bg-student" />
          </div>
          <div className="h-2 w-3/4 rounded-full bg-ink/40" />
          <div className="h-2 w-1/2 rounded-full bg-ink/20" />
        </>
      )}
      {step === 3 && (
        <>
          <div className="relative flex h-1/2 items-center justify-center overflow-hidden rounded bg-ink">
            <div className="absolute -right-3 -top-3 size-12 rounded-full bg-teacher" />
            <div className="size-8 rotate-45 rounded-sm bg-shared" />
          </div>
          <div className="h-2.5 w-4/5 rounded-full bg-ink" />
          <div className="h-2 w-1/2 rounded-full bg-ink/30" />
          <div className="mt-auto flex gap-1">
            <span className="size-3 rounded-full bg-student" />
            <span className="size-3 rounded-full bg-teacher" />
            <span className="size-3 rounded-full bg-shared" />
          </div>
        </>
      )}
    </div>
  );
}

export function IterationShowcase() {
  return (
    <div aria-hidden className="flex w-full max-w-md flex-col gap-8">
      <div className="grid grid-cols-3 items-end gap-3">
        {([1, 2, 3] as const).map((step) => (
          <div key={step} className="flex flex-col gap-2" style={{ opacity: 0.55 + step * 0.15 }}>
            <Artboard step={step} />
            <span className="text-3xl font-bold tracking-tighter tabular-nums text-ink">
              v{step}
            </span>
          </div>
        ))}
      </div>
      <div className="ml-auto flex w-4/5 flex-col gap-2 rounded-lg border border-shared bg-surface p-4 shadow-sm">
        <p className="text-sm leading-relaxed text-ink">
          La paleta ya funciona. Dale más aire al isotipo y está lista para la entrega.
        </p>
        <span className="w-fit rounded-full bg-shared-soft px-3 py-1 text-xs font-semibold text-shared-ink">
          Calificación parcial: 4.6 / 5.0
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-2xl font-bold leading-tight tracking-tight text-ink">
          Cada versión de tu proyecto, con la retroalimentación que la hizo mejor.
        </p>
        <p className="text-sm text-muted">
          Sube iteraciones, recibe comentarios y exporta tu portafolio.
        </p>
      </div>
    </div>
  );
}
