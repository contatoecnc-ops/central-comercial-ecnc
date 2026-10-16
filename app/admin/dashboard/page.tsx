import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { TaskCard } from "@/components/TaskCard";
import { Card, EmptyState } from "@/components/ui/card";
import { listTasks, listVendedores } from "@/lib/queries";
import { getSLA, isOpen, sortTasks } from "@/lib/sla";

export default async function AdminDashboard() {
  const [tasks, vendedores] = await Promise.all([listTasks(), listVendedores(false)]);
  const now = Date.now();
  const open = tasks.filter((t) => isOpen(t.status));
  const sla = (t: (typeof tasks)[number]) => getSLA(t.due_date, t.status, now).key;
  const overdue = open.filter((t) => sla(t) === "vencida");
  const soon = open.filter((t) => sla(t) === "atencao");

  const rows = vendedores.map((v) => {
    const mine = open.filter((t) => t.assigned_to === v.id);
    return {
      id: v.id,
      name: v.full_name,
      open: mine.length,
      overdue: mine.filter((t) => sla(t) === "vencida").length,
      soon: mine.filter((t) => sla(t) === "atencao").length,
      done: tasks.filter((t) => t.assigned_to === v.id && t.status === "concluida").length,
    };
  });

  const urgent = sortTasks(open).slice(0, 5);

  return (
    <>
      <PageHeader title="Dashboard" breadcrumb={[{ label: "Admin" }, { label: "Dashboard" }]} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Tarefas abertas" value={open.length} />
        <StatTile label="Vencidas" value={overdue.length} tone="danger" />
        <StatTile label="Vencem em 24h" value={soon.length} tone="warn" />
        <StatTile label="Concluídas" value={tasks.filter((t) => t.status === "concluida").length} tone="ok" />
      </div>

      <h2 className="mb-3 mt-10 text-sm font-bold uppercase tracking-wide">Por vendedor</h2>
      {rows.length === 0 ? (
        <EmptyState>Nenhum vendedor cadastrado.</EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Vendedor</th>
                <th className="px-4 py-3 text-right font-semibold">Abertas</th>
                <th className="px-4 py-3 text-right font-semibold">Vencidas</th>
                <th className="px-4 py-3 text-right font-semibold">Vencem em 24h</th>
                <th className="px-4 py-3 text-right font-semibold">Concluídas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-semibold">
                    <Link href={`/admin/tarefas?vendedor=${r.id}`} className="hover:text-brand">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.open}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${r.overdue ? "font-bold text-red-400" : ""}`}>
                    {r.overdue}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${r.soon ? "text-yellow-400" : ""}`}>{r.soon}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.done}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <h2 className="mb-3 mt-10 text-sm font-bold uppercase tracking-wide">Mais urgentes</h2>
      {urgent.length === 0 ? (
        <EmptyState>Nenhuma tarefa aberta.</EmptyState>
      ) : (
        <div className="space-y-3">
          {urgent.map((t) => (
            <TaskCard key={t.id} task={t} href={`/admin/tarefas/${t.id}`} showAssignee />
          ))}
        </div>
      )}
    </>
  );
}
