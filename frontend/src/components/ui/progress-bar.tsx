import { cn } from "@/lib/utils";
import * as ProgressPrimitive from "@radix-ui/react-progress";

interface ProgressBarProps {
  value: number;
  label: string;
  tone?: "ink" | "student" | "teacher" | "shared";
  className?: string;
}

const fill = {
  ink: "bg-ink",
  student: "bg-student",
  teacher: "bg-teacher",
  shared: "bg-shared",
} as const;

export function ProgressBar({ value, label, tone = "ink", className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <ProgressPrimitive.Root
      value={clamped}
      aria-label={label}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-ink/10", className)}
    >
      <ProgressPrimitive.Indicator
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", fill[tone])}
        style={{ width: `${clamped}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
