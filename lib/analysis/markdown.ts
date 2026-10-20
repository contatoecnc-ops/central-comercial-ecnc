import type { Resumo } from "@/lib/analysis/summary";
import { fmtHoras } from "@/lib/analysis/format";
import { fmtBR } from "@/lib/analysis/period";
import { STATUS_LABEL, type ContentStatus } from "@/lib/marketing-config";

const brl = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const horas = fmtHoras;
const sinal = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${Math.round(n * 100)}%`);

function table(head: string[], rows: (string | number)[][]) {
  if (rows.length === 0) return "_Sem dados no período._\n";
  const line = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
  return [line(head), line(head.map(() => "---")), ...rows.map(line)].join("\n") + "\n";
}

export function resumoToMarkdown(r: Resumo): string {
  const t = r.tarefas;
  const s = r.solicitacoes;
  const c = r.conteudo;
  const v = r.vendas;
  const out: string[] = [];

  out.push(`# Análise Central Comercial ECNC — ${fmtBR(r.periodo.from)} a ${fmtBR(r.periodo.to)}`);
  out.push(
    `Gerado em ${r.gerado_em} · vendas até ${r.dados_de_vendas_ate ? fmtBR(r.dados_de_vendas_ate) : "—"} · sincronização de vendas ${r.sincronizacao_vendas_ok ? "em dia" : "**desatualizada**"}\n`
  );

  out.push("## Alertas");
  out.push(r.alertas.length ? r.alertas.map((a) => `- ${a}`).join("\n") + "\n" : "Nenhum alerta.\n");

  out.push("## Tarefas");
  const tl = (x: (typeof t)["total"]) => [x.vendedor, x.criadas, x.concluidas, x.no_prazo, pct(x.pct_no_prazo), x.vencidas_em_aberto, horas(x.tempo_medio_conclusao_h)];
  out.push(table(["Vendedor", "Criadas", "Concluídas", "No prazo", "% no prazo", "Vencidas em aberto", "Tempo médio"], [...t.por_vendedor.map(tl), tl(t.total)]));

  out.push(`## Vendas — ${v.mes}`);
  const vl = (x: NonNullable<typeof v.empresa>) => [
    x.vendedor, brl(x.vendido), brl(x.meta), pct(x.pct_meta), pct(x.ritmo_esperado_pct),
    x.mes_em_andamento ? "mês em andamento" : sinal(x.variacao_comparavel),
  ];
  out.push(table(["Vendedor", "Vendido", "Meta", "% da meta", "Ritmo esperado", `vs ${v.mes_anterior}`], [...(v.empresa ? [vl(v.empresa)] : []), ...v.por_vendedor.map(vl)]));

  out.push("## Solicitações de material");
  const sl = (nome: string, x: typeof s.total) => [nome, x.criadas, x.aprovadas, x.recusadas, x.canceladas, pct(x.taxa_recusa), horas(x.triagem_media_h), x.paradas_mais_24h, x.paradas_mais_72h];
  const sh = ["", "Criadas", "Aprovadas", "Recusadas", "Canceladas", "Recusa", "Triagem média", "Paradas >24 h", "Paradas >72 h"];
  out.push(table(["Vendedor", ...sh.slice(1)], [...s.por_vendedor.map((x) => sl(x.vendedor, x)), sl("Total", s.total)]));
  out.push(table(["Prioridade", ...sh.slice(1)], s.por_prioridade.map((x) => sl(x.prioridade, x))));
  if (s.da_solicitacao_a_entrega.length) {
    out.push("Da solicitação à entrega:\n");
    out.push(table(["Prioridade", "Entregas", "Tempo médio"], s.da_solicitacao_a_entrega.map((x) => [x.prioridade, x.entregas, horas(x.horas_medio)])));
  }

  out.push("## Conteúdo");
  out.push(
    table(
      ["Criados", "Publicados", "Aprovados", "Devolvidos p/ ajustes", "Tempo em aprovação", "Rodadas de ajustes/item", "Urgentes em aberto", "Atrasados"],
      [[c.criados, c.publicados, c.aprovados, c.devolvidos_para_ajustes, horas(c.tempo_em_aprovacao_h), c.rodadas_ajustes_por_item_publicado ?? "—", c.urgentes_em_aberto, c.atrasados]]
    )
  );
  out.push(table(["Status", "Itens"], Object.entries(c.itens_por_status).map(([k, n]) => [STATUS_LABEL[k as ContentStatus] ?? k, n])));
  out.push(table(["Canal", "Criados", "Publicados", "Aprovados", "Ajustes"], c.por_canal.map((x) => [x.canal, x.criados, x.publicados, x.aprovados, x.devolvidos_para_ajustes])));

  return out.join("\n");
}
