import { CalendarClock, CheckCircle2, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SLABadge } from "@/components/SLABadge";
import { PriorityBadge } from "@/components/PriorityBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { CommentThread } from "@/components/CommentThread";
import { TaskActions } from "@/components/TaskActions";
import { fmtDateTime } from "@/lib/dates";
import type { TaskComment, TaskWithAssignee } from "@/types/database";

/** Visão compartilhada de detalhe da tarefa (admin e vendedor). */
export function TaskDetail({
  task,
  comments,
  showAssignee,
}: {
  task: TaskWithAssignee;
  comments: TaskComment[];
  showAssignee?: boolean;
}) {
  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <SLABadge dueDate={task.due_date} status={task.status} />
          <PriorityBadge priority={task.priority} />
          <StatusBadge status={task.status} />
          {task.category && (
            <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-muted">{task.category}</span>
          )}
        </div>

        {task.description ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/90">{task.description}</p>
        ) : (
          <p className="text-sm text-muted">Sem descrição.</p>
        )}

        <dl className="grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <CalendarClock size={16} className="text-brand" />
            <div>
              <dt className="text-xs text-muted">Prazo</dt>
              <dd>{fmtDateTime(task.due_date)}</dd>
            </div>
          </div>
          {showAssignee && (
            <div className="flex items-center gap-2">
              <User size={16} className="text-brand" />
              <div>
                <dt className="text-xs text-muted">Vendedor</dt>
                <dd>{task.assignee?.full_name ?? "—"}</dd>
              </div>
            </div>
          )}
          {task.completed_at && (
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <div>
                <dt className="text-xs text-muted">Concluída em</dt>
                <dd>{fmtDateTime(task.completed_at)}</dd>
              </div>
            </div>
          )}
          <div className="text-xs text-muted sm:col-span-2">Criada em {fmtDateTime(task.created_at)}</div>
        </dl>
      </Card>

      <TaskActions taskId={task.id} status={task.status} />

      <Card className="p-5">
        <CommentThread taskId={task.id} comments={comments} />
      </Card>
    </div>
  );
}
