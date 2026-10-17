"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Textarea } from "@/components/ui/form";
import { DeleteButton } from "@/components/DeleteButton";
import { createReminder, deleteReminder, setReminderActive, updateReminder } from "@/app/actions/reminders";
import { fmtDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { SellerReminder } from "@/types/database";

export function RemindersManager({ sellerId, reminders }: { sellerId: string; reminders: SellerReminder[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function run(fn: () => Promise<{ error?: string }>, ok: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    toast.success(ok);
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide">Novo lembrete</h2>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex: Priorizar retorno aos orçamentos de fibra enviados na semana passada"
          maxLength={1000}
        />
        <div className="flex justify-end">
          <Button
            disabled={busy || !text.trim()}
            onClick={async () => {
              if (await run(() => createReminder(sellerId, text), "Lembrete criado")) setText("");
            }}
          >
            Adicionar lembrete
          </Button>
        </div>
      </Card>

      {reminders.length === 0 ? (
        <EmptyState>Nenhum lembrete para este vendedor.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {reminders.map((r) => (
            <li key={r.id}>
              <Card className={cn("space-y-3 p-4", !r.active && "opacity-60")}>
                {editing === r.id ? (
                  <>
                    <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy || !draft.trim()}
                        onClick={async () => {
                          if (await run(() => updateReminder(r.id, sellerId, draft), "Lembrete atualizado")) setEditing(null);
                        }}
                      >
                        Salvar
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap break-words text-sm">{r.message}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted">
                        {r.active ? "Ativo" : "Desativado"} · {fmtDateTime(r.created_at)}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditing(r.id);
                            setDraft(r.message);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => setReminderActive(r.id, sellerId, !r.active),
                              r.active ? "Lembrete desativado" : "Lembrete reativado"
                            )
                          }
                        >
                          {r.active ? "Desativar" : "Reativar"}
                        </Button>
                        <DeleteButton
                          confirmText="Excluir este lembrete?"
                          action={() => deleteReminder(r.id, sellerId)}
                        />
                      </div>
                    </div>
                  </>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
