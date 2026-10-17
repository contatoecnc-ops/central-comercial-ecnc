import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { TaskForm } from "@/components/TaskForm";
import { requireProfile } from "@/lib/auth";

export default async function VendedorNovaTarefaPage() {
  await requireProfile("vendedor");
  return (
    <>
      <PageHeader
        title="Nova tarefa"
        breadcrumb={[{ label: "Minhas tarefas", href: "/vendedor/tarefas" }, { label: "Nova" }]}
      />
      <Card className="max-w-3xl p-6">
        <TaskForm mode="own" />
      </Card>
    </>
  );
}
