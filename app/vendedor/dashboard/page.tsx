import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { TaskCard } from "@/components/TaskCard";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { listTasks } from "@/lib/queries";
import { getSLA, isOpen, sortTasks } from "@/lib/sla";

export default async function VendedorDashboard() {
  const profile = await requireProfile("vendedor");
  const tasks = await listTasks({ assignedTo: profile.id });
  const open = sortTasks(tasks.filter((t) => isOpen(t.status)));
  const sla = (t: (typeof tasks)[number]) => getSLA(t.due_date, t.status).key;
  const overdue = open.filter((t) => sla(t) === "vencida");
  const soon = open.filter((t) => sla(t) === "atencao");
  const done = tasks.filter((t) => t.status === "concluida");

  const firstName = profile.full_name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={`Olá, ${firstName}`}
        breadcrumb={[{ label: "Vendedor" }, { label: "Dashboard" }]}
        actions={
          <ButtonLink href="/vendedor/tarefas" variant="outline">
            Ver todas as tarefas
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Abertas" value={open.length} />
        <StatTile label="Vencidas" value={overdue.length} tone="danger" />
        <StatTile label="Próximas do vencimento" value={soon.length} tone="warn" />
        <StatTile label="Concluídas" value={done.length} tone="ok" />
      </div>

      <h2 className="mb-3 mt-10 text-sm font-bold uppercase tracking-wide">Para fazer agora</h2>
      {open.length === 0 ? (
        <EmptyState>Você não tem tarefas abertas. 🎉</EmptyState>
      ) : (
        <div className="space-y-3">
          {open.slice(0, 8).map((t) => (
            <TaskCard key={t.id} task={t} href={`/vendedor/tarefas/${t.id}`} />
          ))}
        </div>
      )}
    </>
  );
}
