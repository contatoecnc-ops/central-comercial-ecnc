import { cn } from "@/lib/utils";
import type { Priority } from "@/types/database";

const map: Record<Priority, { label: string; cls: string }> = {
  baixa: { label: "Baixa", cls: "bg-sky-500/10 text-sky-400 border-sky-500/30" },
  media: { label: "Média", cls: "bg-orange-500/10 text-orange-400 border-orange-500/30" },
  alta: { label: "Alta", cls: "bg-brand/15 text-red-400 border-brand/40" },
};

export const priorityLabel = (p: Priority) => map[p].label;

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { label, cls } = map[priority];
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold", cls)}>
      {label}
    </span>
  );
}
