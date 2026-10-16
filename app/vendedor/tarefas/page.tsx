import { PageHeader } from "@/components/PageHeader";
import { TaskCard } from "@/components/TaskCard";
import { CategoryFilter } from "@/components/CategoryFilter";
import { EmptyState } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { listTasks } from "@/lib/queries";
import { sortTasks } from "@/lib/sla";

const FILTERS = [
  { label: "Pendente", value: "pendente" },
  { label: "Em andamento", value: "em_andamento" },
  { label: "Concluída", value: "concluida" },
];

export default async function VendedorTarefasPage({ searchParams }: { searchParams: { status?: string } }) {
  const profile = await requireProfile("vendedor");
  const status = FILTERS.find((f) => f.value === searchParams.status)?.value;
  const tasks = sortTasks(await listTasks({ assignedTo: profile.id, status }));

  return (
    <>
      <PageHeader title="Minhas tarefas" breadcrumb={[{ label: "Vendedor" }, { label: "Tarefas" }]} />
      <div className="mb-6">
        <StatusFilter active={status} />
      </div>
      {tasks.length === 0 ? (
        <EmptyState>Nenhuma tarefa encontrada.</EmptyState>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} href={`/vendedor/tarefas/${t.id}`} />
          ))}
        </div>
      )}
    </>
  );
}

function StatusFilter({ active }: { active?: string }) {
  const labelFor = (v?: string) => FILTERS.find((f) => f.value === v)?.label;
  return (
    <CategoryFilter
      basePath="/vendedor/tarefas"
      param="status"
      categories={FILTERS.map((f) => f.label)}
      active={labelFor(active)}
      valueMap={Object.fromEntries(FILTERS.map((f) => [f.label, f.value]))}
    />
  );
}
