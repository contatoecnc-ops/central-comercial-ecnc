import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/types/database";

export const statusLabels: Record<TaskStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const cls: Record<TaskStatus, string> = {
  pendente: "text-white border-white/20",
  em_andamento: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  concluida: "text-zinc-400 border-zinc-500/30 bg-zinc-500/10",
  cancelada: "text-zinc-500 border-zinc-600/30 line-through",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium", cls[status])}>
      {statusLabels[status]}
    </span>
  );
}
