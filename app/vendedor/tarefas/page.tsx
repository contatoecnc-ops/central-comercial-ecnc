import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { TaskCard } from "@/components/TaskCard";
import { CategoryFilter } from "@/components/CategoryFilter";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { listTasks } from "@/lib/queries";
import { isOwnTask, sortTasks } from "@/lib/sla";

const STATUS_FILTERS = [
  { label: "Pendente", value: "pendente" },
  { label: "Em andamento", value: "em_andamento" },
  { label: "Concluída", value: "concluida" },
];
const ORIGIN_FILTERS = [
  { label: "Atribuídas pelo gestor", value: "gestor" },
  { label: "Minhas", value: "minhas" },
];

export default async function VendedorTarefasPage({
  searchParams,
}: {
  searchParams: { status?: string; origem?: string };
}) {
  const profile = await requireProfile("vendedor");
  const status = STATUS_FILTERS.find((f) => f.value === searchParams.status)?.value;
  const origem = ORIGIN_FILTERS.find((f) => f.value === searchParams.origem)?.value;
  const all = await listTasks({ assignedTo: profile.id, status });
  const tasks = sortTasks(
    all.filter((t) => (origem === "gestor" ? !isOwnTask(t) : origem === "minhas" ? isOwnTask(t) : true))
  );

  return (
    <>
      <PageHeader
        title="Minhas tarefas"
        breadcrumb={[{ label: "Vendedor" }, { label: "Tarefas" }]}
        actions={
          <ButtonLink href="/vendedor/tarefas/nova">
            <Plus size={16} /> Nova tarefa
          </ButtonLink>
        }
      />
      <div className="mb-6 space-y-3">
        <Filter param="origem" options={ORIGIN_FILTERS} active={origem} other={{ status }} />
        <Filter param="status" options={STATUS_FILTERS} active={status} other={{ origem }} />
      </div>
      {tasks.length === 0 ? (
        <EmptyState>Nenhuma tarefa encontrada.</EmptyState>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} href={`/vendedor/tarefas/${t.id}`} ownLabel="Minha" />
          ))}
        </div>
      )}
    </>
  );
}

function Filter({
  param,
  options,
  active,
  other,
}: {
  param: string;
  options: { label: string; value: string }[];
  active?: string;
  other: Record<string, string | undefined>;
}) {
  return (
    <CategoryFilter
      basePath="/vendedor/tarefas"
      param={param}
      extraParams={other}
      categories={options.map((f) => f.label)}
      active={options.find((f) => f.value === active)?.label}
      valueMap={Object.fromEntries(options.map((f) => [f.label, f.value]))}
    />
  );
}
