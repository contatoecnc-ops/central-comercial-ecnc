import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { TaskForm } from "@/components/TaskForm";
import { listVendedores } from "@/lib/queries";

export default async function NovaTarefaPage() {
  const vendedores = await listVendedores();
  return (
    <>
      <PageHeader
        title="Nova tarefa"
        breadcrumb={[{ label: "Tarefas", href: "/admin/tarefas" }, { label: "Nova" }]}
      />
      <Card className="max-w-3xl p-6">
        <TaskForm vendedores={vendedores} />
      </Card>
    </>
  );
}
