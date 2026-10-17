"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Play, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { cancelOwnTask, completeTask, startTask } from "@/app/actions/tasks";
import type { TaskStatus } from "@/types/database";

export function TaskActions({
  taskId,
  status,
  canCancel,
}: {
  taskId: string;
  status: TaskStatus;
  /** só tarefas criadas pelo próprio vendedor */
  canCancel?: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (status === "concluida" || status === "cancelada") return null;

  async function run(fn: () => Promise<{ error?: string }>, ok: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.error) return void toast.error(res.error);
    toast.success(ok);
    setNote("");
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide">Ações</h2>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Comentário final (opcional) — registrado ao concluir"
        className="min-h-[72px]"
      />
      <div className="flex flex-wrap gap-2">
        {status === "pendente" && (
          <Button variant="outline" disabled={busy} onClick={() => run(() => startTask(taskId), "Tarefa iniciada")}>
            <Play size={16} /> Iniciar
          </Button>
        )}
        <Button disabled={busy} onClick={() => run(() => completeTask(taskId, note), "Tarefa concluída")}>
          <CheckCircle2 size={16} /> Marcar como Concluída
        </Button>
        {canCancel && (
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Cancelar esta tarefa?")) void run(() => cancelOwnTask(taskId), "Tarefa cancelada");
            }}
          >
            <XCircle size={16} /> Cancelar tarefa
          </Button>
        )}
      </div>
    </div>
  );
}
