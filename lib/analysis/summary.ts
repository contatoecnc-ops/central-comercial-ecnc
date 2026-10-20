import { createAdminClient } from "@/lib/supabase/admin";
import { COMPANY_LABEL, STALE_DAYS } from "@/lib/sales-config";
import { STATUS_ORDER } from "@/lib/marketing-config";
import { daysBetween, prevMonthKey, todayBR } from "@/lib/analysis/period";

/**
 * Resumo agregado para análise. ÚNICO caminho de código que lê o schema `analytics` (views só com números).
 * Nada de texto livre: só contagens, somas, médias, percentuais, durações e nomes de vendedor/equipe.
 */

type Row = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const r2 = (n: number) => Math.round(n * 100) / 100;
const ratio = (a: number, b: number) => (b > 0 ? r2(a / b) : null);

export const VIEWS = [
  "v_tarefas_dia",
  "v_vendas_mes",
  "v_vendas_sync",
  "v_solicitacoes_dia",
  "v_conteudo_dia",
  "v_conteudo_canal_dia",
  "v_conteudo_status",
  "v_solicitacao_para_entrega",
] as const;
type View = (typeof VIEWS)[number];

/** Lê uma view inteira (paginando) com filtros fixos de data/mês. Nenhum valor de fora vira SQL. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readView(view: View, filter?: (q: any) => any): Promise<Row[]> {
  const db = createAdminClient();
  const out: Row[] = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = db.schema("analytics").from(view).select("*");
    if (filter) q = filter(q);
    const { data, error } = await q.range(offset, offset + page - 1);
    if (error) throw new Error(`analytics.${view}: ${error.code ?? "erro"}`);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < page) break;
  }
  return out;
}

function groupBy<T>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

const sum = (rows: Row[], col: string) => rows.reduce((s, r) => s + num(r[col]), 0);
/** média ponderada de `col` (ignora linhas sem valor) por `weightCol` */
function wavg(rows: Row[], col: string, weightCol: string) {
  let s = 0;
  let w = 0;
  for (const r of rows) {
    const v = numOrNull(r[col]);
    const wt = num(r[weightCol]);
    if (v === null || wt <= 0) continue;
    s += v * wt;
    w += wt;
  }
  return w > 0 ? r2(s / w) : null;
}

export interface Resumo {
  periodo: { from: string; to: string; dias: number };
  gerado_em: string;
  dados_de_vendas_ate: string | null;
  sincronizacao_vendas_ok: boolean;
  tarefas: ReturnType<typeof blocoTarefas>;
  vendas: ReturnType<typeof blocoVendas>;
  solicitacoes: ReturnType<typeof blocoSolicitacoes>;
  conteudo: ReturnType<typeof blocoConteudo>;
  alertas: string[];
}

// ── Tarefas ──
function tarefaLinha(nome: string, rows: Row[], fim: Row[]) {
  const concluidas = sum(rows, "concluidas");
  const noPrazo = sum(rows, "concluidas_no_prazo");
  return {
    vendedor: nome,
    criadas: sum(rows, "criadas"),
    concluidas,
    no_prazo: noPrazo,
    pct_no_prazo: ratio(noPrazo, concluidas),
    vencidas_em_aberto: sum(fim, "vencidas_em_aberto"),
    tempo_medio_conclusao_h: wavg(rows, "tempo_conclusao_h_medio", "concluidas"),
  };
}

function blocoTarefas(rows: Row[], fimDia: string) {
  const fim = rows.filter((r) => r.dia === fimDia);
  const por = Array.from(groupBy(rows, (r) => String(r.vendedor)).entries())
    .map(([nome, rs]) => tarefaLinha(nome, rs, fim.filter((r) => r.vendedor === nome)))
    .sort((a, b) => a.vendedor.localeCompare(b.vendedor, "pt-BR"));
  return { total: tarefaLinha("Total", rows, fim), por_vendedor: por };
}

// ── Vendas ──
function blocoVendas(rows: Row[], mes: string, dadosAte: string | null, hoje: string) {
  const ant = prevMonthKey(mes);
  // Dia de referência dos dados: dados_ate (se for do mês), ou hoje (mês corrente), ou o fim do mês (mês passado).
  const [ano, mm] = mes.split("-").map(Number);
  const diasNoMes = new Date(Date.UTC(ano, mm, 0)).getUTCDate();
  const ref = dadosAte && dadosAte.slice(0, 7) === mes ? dadosAte : hoje.slice(0, 7) === mes ? hoje : hoje < `${mes}-01` ? null : `${mes}-${diasNoMes}`;
  const diasDecorridos = ref ? Math.min(diasNoMes, Number(ref.slice(8, 10))) : 0;
  const emAndamento = diasDecorridos < diasNoMes;
  const ritmo = diasNoMes > 0 ? r2(diasDecorridos / diasNoMes) : null;
  const linha = (nome: string) => {
    const atual = rows.find((r) => r.mes === mes && r.seller_label === nome);
    const prev = rows.find((r) => r.mes === ant && r.seller_label === nome);
    const vendido = num(atual?.vendas);
    const meta = numOrNull(atual?.meta);
    const vendidoAnt = prev ? num(prev.vendas) : null;
    return {
      vendedor: nome === COMPANY_LABEL ? "Empresa" : nome,
      vendido: r2(vendido),
      meta,
      pct_meta: atual?.percentual === null || atual?.percentual === undefined ? null : Number(atual.percentual),
      mes_anterior_vendido: vendidoAnt === null ? null : r2(vendidoAnt),
      // mantido por compatibilidade; com o mês em andamento NÃO é comparável (mês parcial vs mês cheio)
      variacao_vs_mes_anterior: vendidoAnt && vendidoAnt > 0 ? r2(vendido / vendidoAnt - 1) : null,
      mes_em_andamento: emAndamento,
      variacao_comparavel: !emAndamento && vendidoAnt && vendidoAnt > 0 ? r2(vendido / vendidoAnt - 1) : null,
      ritmo_esperado_pct: meta ? ritmo : null,
      meta_esperada_ate_agora: meta && ritmo !== null ? r2(meta * ritmo) : null,
    };
  };
  const nomes = Array.from(new Set(rows.filter((r) => r.mes === mes).map((r) => String(r.seller_label))));
  const sellers = nomes.filter((n) => n !== COMPANY_LABEL).sort((a, b) => a.localeCompare(b, "pt-BR"));
  return {
    mes,
    mes_anterior: ant,
    mes_em_andamento: emAndamento,
    dias_decorridos: diasDecorridos,
    dias_no_mes: diasNoMes,
    empresa: nomes.includes(COMPANY_LABEL) ? linha(COMPANY_LABEL) : null,
    por_vendedor: sellers.map(linha),
  };
}

// ── Solicitações ──
function solicLinha(rows: Row[], fim: Row[]) {
  const aprovadas = sum(rows, "aprovadas");
  const recusadas = sum(rows, "recusadas");
  return {
    criadas: sum(rows, "criadas"),
    aprovadas,
    recusadas,
    canceladas: sum(rows, "canceladas"),
    taxa_recusa: ratio(recusadas, aprovadas + recusadas),
    triagem_media_h: wavg(rows, "triagem_h_medio", "triagens"),
    paradas_mais_24h: sum(fim, "paradas_mais_24h"),
    paradas_mais_72h: sum(fim, "paradas_mais_72h"),
  };
}

function blocoSolicitacoes(rows: Row[], fimDia: string, entrega: Row[]) {
  const fim = rows.filter((r) => r.dia === fimDia);
  const por = (col: string) =>
    Array.from(groupBy(rows, (r) => String(r[col])).entries())
      .map(([chave, rs]) => ({ chave, ...solicLinha(rs, fim.filter((r) => String(r[col]) === chave)) }))
      .sort((x, y) => x.chave.localeCompare(y.chave, "pt-BR"));
  return {
    total: solicLinha(rows, fim),
    por_vendedor: por("vendedor").map(({ chave, ...l }) => ({ vendedor: chave, ...l })),
    por_tipo: por("tipo").map(({ chave, ...l }) => ({ tipo: chave, ...l })),
    por_prioridade: por("prioridade").map(({ chave, ...l }) => ({ prioridade: chave, ...l })),
    da_solicitacao_a_entrega: Array.from(groupBy(entrega, (r) => String(r.prioridade)).entries()).map(([prioridade, rs]) => ({
      prioridade,
      entregas: sum(rs, "entregas"),
      horas_medio: wavg(rs, "horas_medio", "entregas"),
    })),
  };
}

// ── Conteúdo ──
function blocoConteudo(dia: Row[], canal: Row[], status: Row[]) {
  const porStatus: Record<string, number> = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));
  for (const r of status) porStatus[String(r.status)] = (porStatus[String(r.status)] ?? 0) + num(r.itens);
  return {
    criados: sum(dia, "criados"),
    publicados: sum(dia, "publicados"),
    aprovados: sum(dia, "aprovados"),
    devolvidos_para_ajustes: sum(dia, "devolvidos_ajustes"),
    tempo_em_aprovacao_h: wavg(dia, "tempo_aprovacao_h_medio", "intervalos_aprovacao"),
    rodadas_ajustes_por_item_publicado: wavg(dia, "rodadas_ajustes_medio", "publicados"),
    urgentes_em_aberto: sum(status, "urgentes_em_aberto"),
    atrasados: sum(status, "atrasados"),
    itens_por_status: porStatus,
    por_prioridade: Array.from(groupBy(dia, (r) => String(r.prioridade)).entries()).map(([prioridade, rs]) => ({
      prioridade,
      criados: sum(rs, "criados"),
      publicados: sum(rs, "publicados"),
    })),
    // item com vários canais conta em cada um: não somar entre canais
    por_canal: Array.from(groupBy(canal, (r) => String(r.canal)).entries())
      .map(([c, rs]) => ({
        canal: c,
        criados: sum(rs, "criados"),
        publicados: sum(rs, "publicados"),
        aprovados: sum(rs, "aprovados"),
        devolvidos_para_ajustes: sum(rs, "devolvidos_ajustes"),
      }))
      .sort((a, b) => b.criados - a.criados),
  };
}

// ── Alertas: modelos fixos, só números e nomes de vendedor ──
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function montarAlertas(r: Omit<Resumo, "alertas">, diasSemSync: number | null, urgentesParados24: number) {
  const a: string[] = [];
  if (urgentesParados24 > 0) a.push(`${plural(urgentesParados24, "urgente sem triagem", "urgentes sem triagem")} há mais de 24 h`);
  const p72 = r.solicitacoes.total.paradas_mais_72h;
  if (p72 > 0) a.push(`${plural(p72, "solicitação sem triagem", "solicitações sem triagem")} há mais de 72 h`);
  if (diasSemSync === null) a.push("Vendas nunca sincronizadas");
  else if (!r.sincronizacao_vendas_ok) a.push(`Vendas sem sincronizar há ${plural(diasSemSync, "dia", "dias")}`);
  for (const t of r.tarefas.por_vendedor) {
    if (t.vencidas_em_aberto > 0) a.push(`${t.vendedor}: ${plural(t.vencidas_em_aberto, "tarefa vencida", "tarefas vencidas")}`);
    if (t.concluidas >= 3 && t.pct_no_prazo !== null && t.pct_no_prazo < 0.7)
      a.push(`${t.vendedor}: ${Math.round(t.pct_no_prazo * 100)}% das tarefas concluídas no prazo`);
  }
  const rec = r.solicitacoes.total;
  if (rec.taxa_recusa !== null && rec.aprovadas + rec.recusadas >= 4 && rec.taxa_recusa >= 0.5)
    a.push(`Taxa de recusa de solicitações em ${Math.round(rec.taxa_recusa * 100)}%`);
  if (r.conteudo.urgentes_em_aberto > 0)
    a.push(`${plural(r.conteudo.urgentes_em_aberto, "conteúdo urgente em aberto", "conteúdos urgentes em aberto")}`);
  if (r.conteudo.atrasados > 0)
    a.push(`${plural(r.conteudo.atrasados, "conteúdo com publicação atrasada", "conteúdos com publicação atrasada")}`);
  const emp = r.vendas.empresa;
  if (emp?.pct_meta !== null && emp?.pct_meta !== undefined)
    a.push(
      `Empresa em ${Math.round(emp.pct_meta * 100)}% da meta de vendas de ${r.vendas.mes}` +
        (emp.ritmo_esperado_pct !== null
          ? ` (ritmo esperado ${Math.round(emp.ritmo_esperado_pct * 100)}%: ${r.vendas.dias_decorridos} de ${r.vendas.dias_no_mes} dias)`
          : "")
    );
  return a;
}

export async function buildResumo(from: string, to: string): Promise<Resumo> {
  const hoje = todayBR();
  const fimDia = to < hoje ? to : hoje; // "em aberto no fim do período": último dia já vivido
  const mes = to.slice(0, 7);
  const meses = [mes, prevMonthKey(mes)];
  const mesIni = from.slice(0, 7);

  const [tarefas, vendas, sync, solic, cDia, cCanal, cStatus, entrega] = await Promise.all([
    readView("v_tarefas_dia", (q) => q.gte("dia", from).lte("dia", to)),
    readView("v_vendas_mes", (q) => q.in("mes", meses)),
    readView("v_vendas_sync"),
    readView("v_solicitacoes_dia", (q) => q.gte("dia", from).lte("dia", to)),
    readView("v_conteudo_dia", (q) => q.gte("dia", from).lte("dia", to)),
    readView("v_conteudo_canal_dia", (q) => q.gte("dia", from).lte("dia", to)),
    readView("v_conteudo_status"),
    readView("v_solicitacao_para_entrega", (q) => q.gte("mes", mesIni).lte("mes", mes)),
  ]);

  const s = sync[0];
  const syncEm = s?.sincronizado_em ? new Date(String(s.sincronizado_em)) : null;
  const diasSemSync = syncEm ? Math.max(0, daysBetween(syncEm.toISOString().slice(0, 10), hoje)) : null;
  const dadosAte = s?.dados_ate ? String(s.dados_ate) : null;

  const base = {
    periodo: { from, to, dias: daysBetween(from, to) + 1 },
    gerado_em: new Date().toISOString(),
    dados_de_vendas_ate: dadosAte,
    sincronizacao_vendas_ok: diasSemSync !== null && diasSemSync <= STALE_DAYS,
    tarefas: blocoTarefas(tarefas, fimDia),
    vendas: blocoVendas(vendas, mes, dadosAte, hoje),
    solicitacoes: blocoSolicitacoes(solic, fimDia, entrega),
    conteudo: blocoConteudo(cDia, cCanal, cStatus),
  };
  const urgentes24 = sum(
    solic.filter((r) => r.dia === fimDia && r.prioridade === "urgente"),
    "paradas_mais_24h"
  );
  return { ...base, alertas: montarAlertas(base, diasSemSync, urgentes24) };
}
