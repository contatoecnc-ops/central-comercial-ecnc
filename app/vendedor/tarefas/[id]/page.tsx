import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { TaskDetail } from "@/components/TaskDetail";
import { TaskForm } from "@/components/TaskForm";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { toInputValue } from "@/lib/dates";
import { getTaskWithComments } from "@/lib/queries";

export default async function VendedorTarefaDetalhe({ params }: { params: { id: string } }) {
  const profile = await requireProfile("vendedor");
  const { task, comments } = await getTaskWithComments(params.id);
  const mine = task.created_by === profile.id;

  return (
    <>
      <PageHeader
        title={task.title}
        breadcrumb={[{ label: "Minhas tarefas", href: "/vendedor/tarefas" }, { label: "Detalhe" }]}
      />
      <div className={mine ? "grid gap-6 lg:grid-cols-[1fr_380px]" : "max-w-3xl"}>
        <TaskDetail task={task} comments={comments} ownLabel="Minha" canCancel={mine} />
        {mine && (
          <details className="h-fit rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-bold uppercase tracking-wide">
              <Pencil size={14} className="text-brand" /> Editar tarefa
            </summary>
            <Card className="border-0 border-t p-4">
              <TaskForm
                mode="own"
                taskId={task.id}
                defaults={{
                  title: task.title,
                  description: task.description ?? "",
                  category: task.category ?? "",
                  priority: task.priority,
                  status: task.status,
                  due_date: toInputValue(task.due_date),
                }}
              />
            </Card>
          </details>
        )}
      </div>
    </>
  );
}
