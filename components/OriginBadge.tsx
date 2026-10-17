import { UserRound } from "lucide-react";

/** Marca tarefas criadas pelo próprio vendedor. */
export function OriginBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-brand/40 bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
      <UserRound size={12} /> {label}
    </span>
  );
}
