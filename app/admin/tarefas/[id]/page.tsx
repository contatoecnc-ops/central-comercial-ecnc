import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { TaskDetail } from "@/components/TaskDetail";
import { TaskForm } from "@/components/TaskForm";
import { getTaskWithComments, listVendedores } from "@/lib/queries";
import { toInputValue } from "@/lib/dates";

export default async function AdminTarefaDetalhe({ params }: { params: { id: string } }) {
  const [{ task, comments }, vendedores] = await Promise.all([
    getTaskWithComments(params.id),
    listVendedores(false),
  ]);

  return (
    <>
      <PageHeader
        title={task.title}
        breadcrumb={[{ label: "Tarefas", href: "/admin/tarefas" }, { label: "Detalhe" }]}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <TaskDetail task={task} comments={comments} showAssignee />
        <details className="h-fit rounded-lg border border-border bg-card" open>
          <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-bold uppercase tracking-wide">
            <Pencil size={14} className="text-brand" /> Editar tarefa
          </summary>
          <Card className="border-0 border-t p-4">
            <TaskForm
              taskId={task.id}
              vendedores={vendedores}
              defaults={{
                title: task.title,
                description: task.description ?? "",
                category: task.category ?? "",
                priority: task.priority,
                status: task.status,
                assigned_to: task.assigned_to,
                due_date: toInputValue(task.due_date),
              }}
            />
          </Card>
        </details>
      </div>
    </>
  );
}
