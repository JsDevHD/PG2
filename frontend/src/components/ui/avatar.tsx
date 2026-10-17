import { cn, initials } from "@/lib/utils";
import type { Role } from "@/types/api";

interface AvatarProps {
  name: string;
  userRole?: Role;
  className?: string;
}

export function Avatar({ name, userRole: role, className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        role === "docente" && "bg-teacher-soft text-teacher-ink",
        role === "estudiante" && "bg-student-soft text-student-ink",
        !role && "bg-ink/[0.07] text-ink",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
