import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { CopyTextButton } from "@/components/CopyTextButton";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { currentMonth, fmtBR, previousMonth, previousWeek, resolvePeriod } from "@/lib/analysis/period";
import { fmtHoras } from "@/lib/analysis/format";
import { buildResumo } from "@/lib/analysis/summary";
import { resumoToMarkdown } from "@/lib/analysis/markdown";

const PRESETS = [
  { key: "semana", label: "Semana anterior", range: () => previousWeek() },
  { key: "mes", label: "Mês atual", range: () => currentMonth() },
  { key: "mes_anterior", label: "Mês anterior", range: () => previousMonth() },
] as const;

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const horas = fmtHoras;
const brl = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <Card className="overflow-x-auto">{children}</Card>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <p className="p-5 text-sm text-muted">Sem dados no período.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted">
          {head.map((h, i) => (
            <th key={h} className={`px-4 py-2.5 font-semibold ${i ? "text-right" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border/60 last:border-0">
            {r.map((c, j) => (
              <td key={j} className={`px-4 py-2.5 tabular-nums ${j ? "text-right" : "font-medium"}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function AnalisePage({ searchParams }: { searchParams: { periodo?: string; from?: string; to?: string } }) {
  await requireProfile("admin");

  const preset = PRESETS.find((p) => p.key === searchParams.periodo);
  const period = preset
    ? { ok: true as const, ...preset.range() }
    : searchParams.from || searchParams.to
      ? resolvePeriod(searchParams.from, searchParams.to)
      : { ok: true as const, ...previousWeek() };

  let resumo = null;
  let erro: string | null = period.ok ? null : period.message;
  if (period.ok) {
    try {
      resumo = await buildResumo(period.from, period.to);
    } catch {
      erro = "Não foi possível gerar o resumo. Confira se a migração 009 foi aplicada e se o schema analytics está exposto na API.";
    }
  }
  const active = preset?.key ?? (searchParams.from ? "livre" : "semana");

  return (
    <>
      <PageHeader
        title="Análise"
        breadcrumb={[{ label: "Admin" }, { label: "Análise" }]}
        actions={
          resumo && period.ok ? (
            <>
              <CopyTextButton text={resumoToMarkdown(resumo)} label="Copiar Markdown" />
              <a
                href={`/api/analise/resumo?from=${period.from}&to=${period.to}`}
                download={`analise-${period.from}_${period.to}.json`}
                className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold text-white transition-colors hover:bg-white/5"
              >
                <Download size={14} /> Baixar JSON
              </a>
            </>
          ) : null
        }
      />

      <div className="mb-8 flex flex-wrap items-end gap-3">
        {PRESETS.map((p) => (
          <Link
            key={p.key}
            href={`/admin/analise?periodo=${p.key}`}
            className={`rounded-md border px-3 py-2 text-xs font-semibold ${active === p.key ? "border-brand bg-brand/10 text-white" : "border-border text-muted hover:text-white"}`}
          >
            {p.label}
          </Link>
        ))}
        <form className="flex flex-wrap items-end gap-2" method="get">
          <label className="text-xs text-muted">
            De
            <input type="date" name="from" defaultValue={period.ok ? period.from : searchParams.from} className="mt-1 block h-9 rounded-md border border-border bg-card px-2 text-sm text-white" />
          </label>
          <label className="text-xs text-muted">
            Até
            <input type="date" name="to" defaultValue={period.ok ? period.to : searchParams.to} className="mt-1 block h-9 rounded-md border border-border bg-card px-2 text-sm text-white" />
          </label>
          <Button type="submit" variant="outline" size="md">
            Aplicar
          </Button>
        </form>
      </div>

      {erro && <EmptyState>{erro}</EmptyState>}

      {resumo && (
        <>
          <p className="mb-6 text-sm text-muted">
            {fmtBR(resumo.periodo.from)} a {fmtBR(resumo.periodo.to)} ({resumo.periodo.dias} dias) · vendas até{" "}
            {resumo.dados_de_vendas_ate ? fmtBR(resumo.dados_de_vendas_ate) : "—"} ·{" "}
            {resumo.sincronizacao_vendas_ok ? "sincronização em dia" : "sincronização de vendas desatualizada"}
          </p>

          <Section title="Alertas">
            {resumo.alertas.length === 0 ? (
              <p className="flex items-center gap-2 p-5 text-sm text-emerald-400">
                <CheckCircle2 size={16} /> Nenhum alerta.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {resumo.alertas.map((a) => (
                  <li key={a} className="flex items-center gap-2 px-5 py-3 text-sm">
                    <AlertTriangle size={14} className="shrink-0 text-yellow-400" /> {a}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Tarefas">
            <Table
              head={["Vendedor", "Criadas", "Concluídas", "No prazo", "% no prazo", "Vencidas", "Tempo médio"]}
              rows={[...resumo.tarefas.por_vendedor, resumo.tarefas.total].map((x) => [
                x.vendedor, x.criadas, x.concluidas, x.no_prazo, pct(x.pct_no_prazo), x.vencidas_em_aberto, horas(x.tempo_medio_conclusao_h),
              ])}
            />
          </Section>

          <Section title={`Vendas — ${resumo.vendas.mes}`}>
            <Table
              head={["Vendedor", "Vendido", "Meta", "% da meta", "Ritmo esperado", `vs ${resumo.vendas.mes_anterior}`]}
              rows={[...(resumo.vendas.empresa ? [resumo.vendas.empresa] : []), ...resumo.vendas.por_vendedor].map((x) => [
                x.vendedor, brl(x.vendido), brl(x.meta), pct(x.pct_meta), pct(x.ritmo_esperado_pct),
                x.mes_em_andamento
                  ? "mês em andamento"
                  : x.variacao_comparavel === null ? "—" : `${x.variacao_comparavel > 0 ? "+" : ""}${Math.round(x.variacao_comparavel * 100)}%`,
              ])}
            />
          </Section>

          <Section title="Solicitações de material">
            <Table
              head={["Vendedor", "Criadas", "Aprovadas", "Recusadas", "Canceladas", "Recusa", "Triagem", ">24 h", ">72 h"]}
              rows={[
                ...resumo.solicitacoes.por_vendedor,
                { vendedor: "Total", ...resumo.solicitacoes.total },
              ].map((x) => [
                x.vendedor, x.criadas, x.aprovadas, x.recusadas, x.canceladas, pct(x.taxa_recusa), horas(x.triagem_media_h), x.paradas_mais_24h, x.paradas_mais_72h,
              ])}
            />
          </Section>

          <Section title="Conteúdo">
            <Table
              head={["Criados", "Publicados", "Aprovados", "Ajustes", "Em aprovação", "Rodadas/item", "Urgentes", "Atrasados"]}
              rows={[[
                resumo.conteudo.criados, resumo.conteudo.publicados, resumo.conteudo.aprovados, resumo.conteudo.devolvidos_para_ajustes,
                horas(resumo.conteudo.tempo_em_aprovacao_h), resumo.conteudo.rodadas_ajustes_por_item_publicado ?? "—",
                resumo.conteudo.urgentes_em_aberto, resumo.conteudo.atrasados,
              ]]}
            />
            <Table
              head={["Canal", "Criados", "Publicados", "Aprovados", "Ajustes"]}
              rows={resumo.conteudo.por_canal.map((x) => [x.canal, x.criados, x.publicados, x.aprovados, x.devolvidos_para_ajustes])}
            />
          </Section>
        </>
      )}
    </>
  );
}
