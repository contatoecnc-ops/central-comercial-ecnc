import Link from "next/link";
import { AlertTriangle, FileWarning } from "lucide-react";
import { AcoesContrato } from "@/components/contratos/AcoesContrato";
import { NivelBadge } from "@/components/contratos/Bits";
import { Card } from "@/components/ui/card";
import { CONDICOES } from "@/lib/agente-contratos";
import { formatarMoeda } from "@/lib/agente-contratos/lib/formatacao";
import { COLUNAS_KANBAN } from "@/lib/contratos-config";
import type { ContratoCard } from "@/lib/contratos/queries";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

const MAQUINA: Record<string, string> = { co2: "CO₂", fiber: "Fiber", fiber_corte: "Fiber corte", uv: "UV", solda: "Solda laser" };
export const nomeCondicao = (id: string) => CONDICOES.find((c) => c.id === id)?.nome ?? id;

function Card1({ c, papel, zapsignAtivo }: { c: ContratoCard; papel: "admin" | "vendedor"; zapsignAtivo: boolean }) {
  const base = `/${papel}/contratos`;
  const pendentes = c.documentos.filter((d) => !d.recebido).map((d) => d.nome);
  const maquina = [MAQUINA[c.equipamento?.tipo ?? ""], c.equipamento?.modelo].filter(Boolean).join(" · ");
  return (
    <Card className={cn("space-y-3 p-4", c.recusado && "border-brand ring-1 ring-brand")}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`${base}/${c.id}`} className="text-sm font-extrabold hover:text-brand">
          {c.numero}
        </Link>
        <NivelBadge nivel={c.nivel_aprovacao} motivos={c.motivos_nivel} />
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold" title={c.cliente_razao_social}>
          {c.cliente_razao_social}
        </p>
        <p className="text-xs text-muted">
          <span className="mr-1 rounded border border-border px-1 py-px text-[10px] font-bold">{c.cliente_tipo_pessoa}</span>
          {maquina || "—"}
        </p>
      </div>

      <dl className="space-y-0.5 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Valor</dt>
          <dd className="font-semibold tabular-nums">{formatarMoeda(c.valor_total_centavos)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Pagamento</dt>
          <dd className="truncate text-right" title={nomeCondicao(c.condicao_pagamento)}>
            {nomeCondicao(c.condicao_pagamento)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Vendedor</dt>
          <dd className="truncate text-right">{c.vendedor_nome}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Criado em</dt>
          <dd>{fmtDate(c.created_at)}</dd>
        </div>
      </dl>

      {c.recusado && (
        <p className="flex items-center gap-1.5 rounded-md bg-brand/15 px-2 py-1 text-xs font-semibold text-red-300">
          <AlertTriangle size={14} /> Assinatura recusada no ZapSign
        </p>
      )}
      {c.status === "reprovado" && c.motivo_reprovacao && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-300">
          <span className="font-semibold">Motivo:</span> {c.motivo_reprovacao}
        </p>
      )}
      {pendentes.length > 0 && ["aguardando_aprovacao", "reprovado"].includes(c.status) && (
        <p className="flex items-start gap-1.5 text-xs text-yellow-300">
          <FileWarning size={14} className="mt-px shrink-0" />
          <span>Documentos pendentes: {pendentes.join("; ")}</span>
        </p>
      )}

      <AcoesContrato
        compacto
        id={c.id}
        status={c.status}
        papel={papel}
        zapsignAtivo={zapsignAtivo}
        temArquivo
        docsPendentes={pendentes}
      />
    </Card>
  );
}

export function KanbanContratos({ contratos, papel, zapsignAtivo }: { contratos: ContratoCard[]; papel: "admin" | "vendedor"; zapsignAtivo: boolean }) {
  return (
    <div className="grid auto-cols-[300px] grid-flow-col gap-4 overflow-x-auto pb-4">
      {COLUNAS_KANBAN.map((col) => {
        const itens = contratos.filter((c) => c.status === col.status);
        return (
          <section key={col.status} aria-label={col.titulo} className="min-w-0">
            <h2 className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wide">
              <span>{col.titulo}</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] tabular-nums">{itens.length}</span>
            </h2>
            <div className="space-y-3">
              {itens.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">Nenhum contrato</p>
              ) : (
                itens.map((c) => <Card1 key={c.id} c={c} papel={papel} zapsignAtivo={zapsignAtivo} />)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Lista simples dos cancelados (fora do quadro). */
export function ListaCancelados({ contratos, papel }: { contratos: ContratoCard[]; papel: "admin" | "vendedor" }) {
  if (!contratos.length) return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">Nenhum contrato cancelado.</p>;
  return (
    <Card className="divide-y divide-border">
      {contratos.map((c) => (
        <Link key={c.id} href={`/${papel}/contratos/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-white/5">
          <span className="font-semibold">{c.numero}</span>
          <span className="min-w-0 flex-1 truncate text-muted">{c.cliente_razao_social}</span>
          <span className="tabular-nums">{formatarMoeda(c.valor_total_centavos)}</span>
          <span className="text-xs text-muted">{c.vendedor_nome}</span>
        </Link>
      ))}
    </Card>
  );
}
