"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Circle, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Doc { nome: string; recebido: boolean; por?: string; em?: string; arquivo_path?: string }

/** Checklist de documentos (atenção máxima). Só o admin marca e anexa, e só enquanto aguarda aprovação. */
export function DocumentosChecklist({ id, documentos, editavel }: { id: string; documentos: Doc[]; editavel: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const arquivos = useRef<Record<string, File | null>>({});

  async function salvar(nome: string, recebido: boolean) {
    setBusy(nome);
    try {
      const arquivo = arquivos.current[nome];
      let init: RequestInit;
      if (arquivo) {
        const fd = new FormData();
        fd.set("nome", nome);
        fd.set("recebido", String(recebido));
        fd.set("arquivo", arquivo);
        init = { method: "POST", body: fd };
      } else {
        init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, recebido }) };
      }
      const r = await fetch(`/api/contratos/${id}/documentos`, init);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return void toast.error(j.erro ?? "Não foi possível salvar.");
      arquivos.current[nome] = null;
      toast.success(recebido ? "Documento conferido" : "Documento desmarcado");
      router.refresh();
    } catch {
      toast.error("Sem conexão. Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="divide-y divide-border">
      {documentos.map((d, i) => (
        <li key={d.nome} className="flex flex-wrap items-center gap-3 py-3 text-sm">
          {d.recebido ? <Check size={18} className="text-emerald-400" /> : <Circle size={18} className="text-yellow-400" />}
          <span className="min-w-0 flex-1">
            <span className={d.recebido ? "" : "font-semibold"}>{d.nome}</span>
            {d.arquivo_path && (
              <a href={`/api/contratos/${id}/arquivo?doc=${i}`} className="ml-3 inline-flex items-center gap-1 text-xs text-muted hover:text-brand">
                <Paperclip size={12} /> ver arquivo
              </a>
            )}
          </span>
          {editavel && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                aria-label={`Arquivo de ${d.nome}`}
                onChange={(e) => (arquivos.current[d.nome] = e.target.files?.[0] ?? null)}
                className="max-w-[14rem] text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs file:text-white"
              />
              <Button size="sm" variant={d.recebido ? "outline" : "primary"} disabled={busy === d.nome} onClick={() => salvar(d.nome, !d.recebido)}>
                {d.recebido ? "Desmarcar" : "Marcar como recebido"}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
