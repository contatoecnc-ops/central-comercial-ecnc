import Link from "next/link";
import { CalendarClock, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SLABadge } from "@/components/SLABadge";
import { PriorityBadge } from "@/components/PriorityBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDateTime } from "@/lib/dates";
import type { TaskWithAssignee } from "@/types/database";

export function TaskCard({
  task,
  href,
  showAssignee,
}: {
  task: TaskWithAssignee;
  href: string;
  showAssignee?: boolean;
}) {
  return (
    <Link href={href} className="block">
      <Card className="p-4 transition-colors hover:border-brand/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className="truncate font-semibold">{task.title}</h3>
            {task.category && <p className="text-xs text-muted">{task.category}</p>}
          </div>
          <SLABadge dueDate={task.due_date} status={task.status} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock size={14} /> {fmtDateTime(task.due_date)}
          </span>
          {showAssignee && task.assignee && (
            <span className="inline-flex items-center gap-1.5">
              <User size={14} /> {task.assignee.full_name}
            </span>
          )}
          <PriorityBadge priority={task.priority} />
          <StatusBadge status={task.status} />
        </div>
      </Card>
    </Link>
  );
}
