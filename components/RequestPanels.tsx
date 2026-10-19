"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { addRequestComment, approveRequest, cancelRequest, rejectRequest } from "@/app/actions/requests";
import { PRIORITIES, PRIORITY_LABEL, type ContentPriority } from "@/lib/marketing-config";

export function RequestCommentForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await addRequestComment(requestId, body);
    setBusy(false);
    if (res.error) return void toast.error(res.error);
    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} placeholder="Escreva um comentário..." className="min-h-[72px]" />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy || !body.trim()}>
          Comentar
        </Button>
      </div>
    </form>
  );
}

export function CancelRequestButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    if (!window.confirm("Cancelar esta solicitação? Os anexos serão apagados.")) return;
    setBusy(true);
    const res = await cancelRequest(requestId);
    setBusy(false);
    if (res.error) return void toast.error(res.error);
    toast.success("Solicitação cancelada");
    router.refresh();
  }

  return (
    <Button type="button" variant="danger" size="sm" disabled={busy} onClick={cancel}>
      Cancelar solicitação
    </Button>
  );
}

/** Decisão do admin: aprovar e encaminhar ao marketing (com ajustes) ou recusar com motivo. */
export function DecisionPanel({
  requestId,
  defaults,
  staff,
}: {
  requestId: string;
  defaults: { title: string; description: string; priority: ContentPriority };
  staff: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"aprovar" | "recusar">("aprovar");
  const [title, setTitle] = useState(defaults.title);
  const [description, setDescription] = useState(defaults.description);
  const [priority, setPriority] = useState<string>(defaults.priority);
  const [assignedTo, setAssignedTo] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [note, setNote] = useState("");

  async function approve() {
    setBusy(true);
    const res = await approveRequest(requestId, {
      title,
      description,
      priority,
      assigned_to: assignedTo,
      scheduled_for: scheduledFor,
      note,
    });
    setBusy(false);
    if (res.error) return void toast.error(res.error);
    toast.success("Aprovada e encaminhada ao marketing");
    router.refresh();
  }

  async function reject() {
    if (!note.trim()) return void toast.error("Informe o motivo da recusa.");
    setBusy(true);
    const res = await rejectRequest(requestId, note);
    setBusy(false);
    if (res.error) return void toast.error(res.error);
    toast.success("Solicitação recusada");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={mode === "aprovar" ? "primary" : "outline"} onClick={() => setMode("aprovar")}>
          Aprovar e encaminhar ao marketing
        </Button>
        <Button type="button" size="sm" variant={mode === "recusar" ? "danger" : "outline"} onClick={() => setMode("recusar")}>
          Recusar
        </Button>
      </div>

      {mode === "aprovar" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Título do conteúdo" className="sm:col-span-2">
            <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Descrição (vai para o marketing)" className="sm:col-span-2">
            <Textarea value={description} maxLength={4000} onChange={(e) => setDescription(e.target.value)} className="min-h-[120px]" />
          </Field>
          <Field label="Prioridade">
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável no marketing">
            <Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">—</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data de publicação (opcional)" hint="Horário de Brasília">
            <Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
          </Field>
          <Field label="Observação (opcional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="button" disabled={busy || !title.trim() || !description.trim()} onClick={approve}>
              {busy ? "Aprovando..." : "Aprovar e encaminhar"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Motivo da recusa (o vendedor vai ler)">
            <Textarea value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} className="min-h-[96px]" />
          </Field>
          <div className="flex justify-end">
            <Button type="button" variant="danger" disabled={busy || !note.trim()} onClick={reject}>
              Recusar solicitação
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
