import type { TaskStatus } from "@/types/database";

export type SLAKey = "no_prazo" | "atencao" | "vencida" | "concluida" | "cancelada";

export interface SLAInfo {
  key: SLAKey;
  label: string;
}

const DAY = 24 * 60 * 60 * 1000;

export function getSLA(dueDate: string, status: TaskStatus, now = Date.now()): SLAInfo {
  if (status === "concluida") return { key: "concluida", label: "Concluída" };
  if (status === "cancelada") return { key: "cancelada", label: "Cancelada" };
  const diff = new Date(dueDate).getTime() - now;
  if (diff < 0) return { key: "vencida", label: "Vencida" };
  if (diff <= DAY) return { key: "atencao", label: "Vence em breve" };
  return { key: "no_prazo", label: "No prazo" };
}

export const isOpen = (s: TaskStatus) => s === "pendente" || s === "em_andamento";

/** Vencidas primeiro, depois abertas por due_date crescente; encerradas por último */
export function sortTasks<T extends { due_date: string; status: TaskStatus }>(tasks: T[]): T[] {
  const now = Date.now();
  const group = (t: T) => {
    if (!isOpen(t.status)) return 2;
    return getSLA(t.due_date, t.status, now).key === "vencida" ? 0 : 1;
  };
  return [...tasks].sort((a, b) => {
    const ga = group(a);
    const gb = group(b);
    if (ga !== gb) return ga - gb;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });
}

/** Tarefa criada pelo próprio vendedor (created_by = assigned_to). */
export const isOwnTask = (t: { created_by: string; assigned_to: string }) => t.created_by === t.assigned_to;
