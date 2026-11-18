"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";

interface ContratoBusca { id: string; numero: string; cliente_razao_social: string }

export function BotaoDesvincular({ analiseId, contratoId, rotulo = "Desvincular" }: { analiseId: string; contratoId: string; rotulo?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function clicar() {
    if (!window.confirm("Desvincular esta análise do contrato?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/analises/${analiseId}/vincular/${contratoId}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return void toast.error(j.erro ?? "Não foi possível desvincular.");
      toast.success("Análise desvinculada");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="danger" disabled={busy} onClick={clicar}>
      {rotulo}
    </Button>
  );
}

/** "Vincular a contrato": busca por número ou cliente (só contratos abertos) e vincula na hora. */
export function BotaoVincular({ analiseId }: { analiseId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [itens, setItens] = useState<ContratoBusca[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/analises/contratos?q=${encodeURIComponent(q)}`);
        const j = await r.json().catch(() => ({}));
        setItens(r.ok ? j.itens ?? [] : []);
      } catch {
        setItens([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [aberto, q]);

  async function vincular(contratoId: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/analises/${analiseId}/vincular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contrato_id: contratoId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return void toast.error(j.erro ?? "Não foi possível vincular.");
      toast.success("Análise vinculada");
      setAberto(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!aberto)
    return (
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
        Vincular a contrato
      </Button>
    );
  return (
    <div className="w-full max-w-sm space-y-2 rounded-md border border-border bg-background p-3">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número ou cliente do contrato" aria-label="Buscar contrato" autoFocus className="h-9" />
      <ul className="max-h-48 overflow-y-auto text-xs">
        {itens.length === 0 && <li className="py-2 text-muted">Nenhum contrato aberto encontrado.</li>}
        {itens.map((c) => (
          <li key={c.id}>
            <button type="button" disabled={busy} onClick={() => vincular(c.id)} className="flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left hover:bg-white/5">
              <span className="font-semibold">{c.numero}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{c.cliente_razao_social}</span>
            </button>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>
        Fechar
      </Button>
    </div>
  );
}
