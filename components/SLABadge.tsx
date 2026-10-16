import { cn } from "@/lib/utils";
import { getSLA, type SLAKey } from "@/lib/sla";
import type { TaskStatus } from "@/types/database";

const styles: Record<SLAKey, string> = {
  no_prazo: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  atencao: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  vencida: "bg-red-500/10 text-red-400 border-red-500/30",
  concluida: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
  cancelada: "bg-zinc-500/10 text-zinc-500 border-zinc-500/30",
};

const dots: Record<SLAKey, string> = {
  no_prazo: "bg-emerald-400",
  atencao: "bg-yellow-400",
  vencida: "bg-red-500",
  concluida: "bg-zinc-400",
  cancelada: "bg-zinc-500",
};

export function SLABadge({ dueDate, status }: { dueDate: string; status: TaskStatus }) {
  const sla = getSLA(dueDate, status);
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold", styles[sla.key])}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dots[sla.key])} />
      {sla.label}
    </span>
  );
}
