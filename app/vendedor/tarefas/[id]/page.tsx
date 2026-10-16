import { PageHeader } from "@/components/PageHeader";
import { TaskDetail } from "@/components/TaskDetail";
import { getTaskWithComments } from "@/lib/queries";

export default async function VendedorTarefaDetalhe({ params }: { params: { id: string } }) {
  const { task, comments } = await getTaskWithComments(params.id);
  return (
    <>
      <PageHeader
        title={task.title}
        breadcrumb={[{ label: "Minhas tarefas", href: "/vendedor/tarefas" }, { label: "Detalhe" }]}
      />
      <div className="max-w-3xl">
        <TaskDetail task={task} comments={comments} />
      </div>
    </>
  );
}
