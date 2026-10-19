"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { addContentComment, changeStatus, setPriority, setSchedule } from "@/app/actions/content";
import { PRIORITIES, PRIORITY_LABEL, type ContentPriority, type ContentStatus, type Transition } from "@/lib/marketing-config";

/**
 * Botões de mudança de status. `compact` (cartão do quadro) omite o que exige comentário.
 * O banco é quem decide: a lista vem de transitionsFor() só para mostrar o que cabe ao papel.
 */
export function StatusButtons({
  contentId,
  transitions,
  compact = false,
  commentPlaceholder = "Comentário (obrigatório para pedir ajustes)",
}: {
  contentId: string;
  transitions: Transition[];
  compact?: boolean;
  commentPlaceholder?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const list = compact ? transitions.filter((t) => !t.needsComment) : transitions;
  const askComment = !compact && transitions.some((t) => t.needsComment);

  async function go(to: ContentStatus, needsComment?: boolean) {
    if (needsComment && !comment.trim()) return void toast.error("Escreva o comentário dos ajustes.");
    setBusy(true);
    const res = await changeStatus(contentId, to, comment);
    setBusy(false);
    if (res.error) return void toast.error(res.error);
    setComment("");
    toast.success("Status atualizado");
    router.refresh();
  }

  if (list.length === 0) return null;
  return (
    <div className="space-y-2">
      {askComment && (
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={commentPlaceholder}
          className="min-h-[72px]"
        />
      )}
      <div className="flex flex-wrap gap-2">
        {list.map((t) => (
          <Button
            key={t.to}
            type="button"
            size="sm"
            variant={t.variant ?? "primary"}
            disabled={busy}
            onClick={() => go(t.to, t.needsComment)}
          >
            {t.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function CommentForm({ contentId }: { contentId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await addContentComment(contentId, body);
    setBusy(false);
    if (res.error) return void toast.error(res.error);
    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escreva um comentário..." className="min-h-[72px]" />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy || !body.trim()}>
          Comentar
        </Button>
      </div>
    </form>
  );
}

/** Data de publicação: única coisa editável em aprovado/publicado. */
export function ScheduleField({ contentId, initial }: { contentId: string; initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await setSchedule(contentId, value);
    setBusy(false);
    if (res.error) return void toast.error(res.error);
    toast.success(value ? "Data salva" : "Data removida");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="w-56" />
      <Button type="button" size="sm" variant="outline" disabled={busy || value === initial} onClick={save}>
        Salvar data
      </Button>
      <span className="text-xs text-muted">Horário de Brasília</span>
    </div>
  );
}

/** Prioridade: metadado que admin e marketing alteram em qualquer status. */
export function PriorityField({ contentId, value }: { contentId: string; value: ContentPriority }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(next: string) {
    setBusy(true);
    const res = await setPriority(contentId, next);
    setBusy(false);
    if (res.error) return void toast.error(res.error);
    toast.success("Prioridade atualizada");
    router.refresh();
  }

  return (
    <Select value={value} disabled={busy} onChange={(e) => change(e.target.value)} className="h-8 w-32 text-xs" aria-label="Prioridade">
      {PRIORITIES.map((p) => (
        <option key={p} value={p}>
          {PRIORITY_LABEL[p]}
        </option>
      ))}
    </Select>
  );
}
