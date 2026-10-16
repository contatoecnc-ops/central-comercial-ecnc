"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { addComment } from "@/app/actions/tasks";
import { fmtDateTime } from "@/lib/dates";
import { cn, initials } from "@/lib/utils";
import type { TaskComment } from "@/types/database";

export function CommentThread({
  taskId,
  comments,
  canComment = true,
}: {
  taskId: string;
  comments: TaskComment[];
  canComment?: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    setSending(true);
    const res = await addComment(taskId, body);
    setSending(false);
    if (res.error) return void toast.error(res.error);
    setBody("");
    toast.success("Comentário adicionado");
    router.refresh();
  }

  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
        <MessageSquare size={16} className="text-brand" /> Comentários ({comments.length})
      </h2>

      {comments.length === 0 ? (
        <p className="text-sm text-muted">Nenhum comentário ainda.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3 rounded-lg border border-border bg-background p-3">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  c.author?.role === "admin" ? "bg-brand" : "bg-white/10"
                )}
              >
                {initials(c.author?.full_name ?? "?")}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-semibold">{c.author?.full_name ?? "Usuário removido"}</span>
                  <span className="ml-2 text-xs text-muted">{fmtDateTime(c.created_at)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-white/90">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canComment && (
        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Justificativa, ressalva, motivo de atraso, detalhes do que foi feito..."
          />
          <div className="flex justify-end">
            <Button onClick={submit} disabled={sending || !body.trim()} variant="outline">
              {sending ? "Enviando..." : "Comentar"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
