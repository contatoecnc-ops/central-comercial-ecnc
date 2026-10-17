import {
  CHECK_TOLERANCE,
  COMPANY_LABEL,
  META_HEADERS,
  MONTH_HEADERS,
  ORIGIN_ALIASES,
  RESUMO_HEADERS,
  SHEETS,
  STALE_DAYS,
  VENDAS_HEADERS,
  formerSellerNames,
  nonSellerNames,
} from "@/lib/sales-config";
import { canon, findColumn, headerKey, parseBRL, parseDateUTC, type Cell, type Matrix } from "@/lib/sales/parse";

export interface SellerInfo {
  id: string;
  /** texto da coluna Vendedor da planilha */
  sheet_name: string;
}

export interface SalesMetrics {
  vendas: number;
  /** null = meta não configurada (vendedor sem aba de meta) */
  meta: number | null;
  maquinas: number;
  pecas: number;
  /** soma (positiva) das linhas com valor negativo */
  estornos: number;
  por_origem: Record<string, number>;
  por_semana: Record<string, number>;
  dados_ate: string | null;
}

export interface SalesRowOut {
  seller_id: string | null;
  seller_label: string;
  period: string;
  metrics: SalesMetrics;
}

export interface ParseResult {
  rows: SalesRowOut[];
  year: number;
  status: {
    dados_ate: string | null;
    total_planilha: number;
    total_resumo_l2: number | null;
    total_vinculado: number;
    total_outros: number;
  };
  warnings: string[];
  /** nomes de vendedor sem vínculo, fora das listas de ex-vendedores e contas da casa */
  unlinkedNames: string[];
  skippedRows: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const emptyMetrics = (dados_ate: string | null, meta: number | null): SalesMetrics => ({
  vendas: 0,
  meta,
  maquinas: 0,
  pecas: 0,
  estornos: 0,
  por_origem: {},
  por_semana: {},
  dados_ate,
});

function sheetByName(sheets: Record<string, Matrix>, name: string): Matrix | undefined {
  const k = headerKey(name);
  const title = Object.keys(sheets).find((t) => headerKey(t) === k);
  return title === undefined ? undefined : sheets[title];
}

interface MetaTable {
  monthly: (number | null)[];
  totalRow: (number | null)[] | null;
}

/** Meta mensal = soma das linhas de origem (inclui a linha de feira); TOTAL GERAL só para conferência. */
function parseMetaSheet(m: Matrix): MetaTable {
  const head = m[0] ?? [];
  let originCol = findColumn(head, META_HEADERS.origem);
  if (originCol < 0) originCol = 0;
  const monthCols = MONTH_HEADERS.map((h) => findColumn(head, h));
  const monthly: (number | null)[] = monthCols.map(() => null);
  let totalRow: (number | null)[] | null = null;
  for (const row of m.slice(1)) {
    const label = row[originCol];
    if (label === null || label === undefined || String(label).trim() === "") continue;
    const values = monthCols.map((c) => (c < 0 ? null : parseBRL(row[c])));
    if (headerKey(label) === headerKey(META_HEADERS.totalLinha)) {
      totalRow = values;
      continue;
    }
    values.forEach((v, i) => {
      if (v !== null) monthly[i] = (monthly[i] ?? 0) + v;
    });
  }
  return { monthly: monthly.map((v) => (v === null ? null : r2(v))), totalRow };
}

function metaWarnings(who: string, t: MetaTable, out: string[]) {
  if (!t.totalRow) return;
  const bad = t.monthly
    .map((v, i) => ((v ?? 0) !== 0 || (t.totalRow![i] ?? 0) !== 0) && Math.abs((v ?? 0) - (t.totalRow![i] ?? 0)) > CHECK_TOLERANCE ? MONTH_HEADERS[i] : null)
    .filter(Boolean);
  if (bad.length) out.push(`Meta de ${who}: soma das origens difere de TOTAL GERAL em ${bad.join(", ")} (usada a soma das origens)`);
}

interface Acc {
  label: string;
  period: string;
  m: SalesMetrics;
}

/**
 * Função pura: matrizes por aba → agregados por vendedor e mês + avisos.
 * Descarta Razão, Produto, Código e Pedido: só totais saem daqui.
 */
export function parseSalesWorkbook(
  sheets: Record<string, Matrix>,
  sellers: SellerInfo[],
  now: Date = new Date()
): ParseResult {
  const warnings: string[] = [];

  const vendas = sheetByName(sheets, SHEETS.vendas);
  if (!vendas || vendas.length === 0) throw new Error(`Aba "${SHEETS.vendas}" não encontrada ou vazia`);

  // ── Resumo ──
  let dadosAte: string | null = null;
  let totalL2: number | null = null;
  let mesAtualS2: number | null = null;
  const resumo = sheetByName(sheets, SHEETS.resumo);
  if (resumo && resumo[0]) {
    const col = (name: string) => findColumn(resumo[0], name);
    const val = (name: string) => (col(name) >= 0 ? (resumo[1]?.[col(name)] ?? null) : null);
    dadosAte = parseDateUTC(val(RESUMO_HEADERS.dadosAte));
    totalL2 = parseBRL(val(RESUMO_HEADERS.totalAteAgora));
    mesAtualS2 = parseBRL(val(RESUMO_HEADERS.vendasMesAtual));
    if (!dadosAte) warnings.push(`Resumo: "${RESUMO_HEADERS.dadosAte}" ausente ou inválida`);
    if (totalL2 === null) warnings.push(`Resumo: "${RESUMO_HEADERS.totalAteAgora}" não encontrada`);
  } else {
    warnings.push(`Aba "${SHEETS.resumo}" não encontrada: conferência com o Resumo não realizada`);
  }
  if (dadosAte) {
    const days = (now.getTime() - Date.parse(`${dadosAte}T00:00:00Z`)) / 86400000;
    if (days > STALE_DAYS) {
      warnings.push(`Planilha desatualizada: "vendas atualizadas até" é ${dadosAte.split("-").reverse().join("/")}`);
    }
  }
  const year = dadosAte ? Number(dadosAte.slice(0, 4)) : now.getUTCFullYear();

  // ── Vendas: lê só as colunas necessárias e agrega ──
  const head = vendas[0];
  const c = {
    pedido: findColumn(head, VENDAS_HEADERS.pedido),
    emissao: findColumn(head, VENDAS_HEADERS.emissao),
    vendedor: findColumn(head, VENDAS_HEADERS.vendedor),
    valor: findColumn(head, VENDAS_HEADERS.valor),
    origem: findColumn(head, VENDAS_HEADERS.origem),
    tipo: findColumn(head, VENDAS_HEADERS.tipo),
    semana: findColumn(head, VENDAS_HEADERS.semana),
    mes: findColumn(head, "Mês"),
  };
  const missing = (["emissao", "vendedor", "valor"] as const).filter((k) => c[k] < 0);
  if (missing.length) {
    throw new Error(`Aba "${SHEETS.vendas}": cabeçalho(s) não encontrado(s): ${missing.map((k) => VENDAS_HEADERS[k]).join(", ")}`);
  }

  const acc = new Map<string, Acc>();
  const firstLabel = new Map<string, string>();
  const totalByName = new Map<string, number>();
  let totalPlanilha = 0;
  let skipped = 0;
  let outsideYear = 0;
  const monthMismatch: string[] = [];

  for (const row of vendas.slice(1)) {
    const emissao = row[c.emissao];
    const pedido = c.pedido >= 0 ? row[c.pedido] : null;
    const isBlank = (v: Cell | undefined) => v === null || v === undefined || v === "";
    if (isBlank(emissao) && isBlank(pedido)) continue; // faixa vazia do fim da planilha

    const date = parseDateUTC(emissao);
    const value = parseBRL(row[c.valor]);
    if (!date || value === null) {
      skipped++;
      continue;
    }
    const rawName = String(row[c.vendedor] ?? "").replace(/\s+/g, " ").trim();
    const name = canon(rawName) || "(SEM VENDEDOR)";
    if (!firstLabel.has(name)) firstLabel.set(name, rawName || "(SEM VENDEDOR)");

    const period = date.slice(0, 7);
    if (Number(period.slice(0, 4)) !== year) outsideYear++;
    // coluna Mês é só conferência: o mês oficial vem da Emissão
    if (c.mes >= 0 && !isBlank(row[c.mes]) && Number(row[c.mes]) !== Number(period.slice(5))) {
      monthMismatch.push(isBlank(pedido) ? "(sem número)" : String(pedido));
    }

    const key = `${name}|${period}`;
    let a = acc.get(key);
    if (!a) {
      a = { label: firstLabel.get(name)!, period, m: emptyMetrics(dadosAte, null) };
      acc.set(key, a);
    }
    a.m.vendas += value;
    totalPlanilha += value;
    totalByName.set(name, (totalByName.get(name) ?? 0) + value);
    if (value < 0) a.m.estornos += -value;

    const tipo = c.tipo >= 0 ? canon(row[c.tipo]) : "";
    if (tipo === "M") a.m.maquinas += value;
    else if (tipo === "P") a.m.pecas += value;

    const rawOrigin = c.origem >= 0 ? canon(row[c.origem]) : "";
    const origin = ORIGIN_ALIASES[rawOrigin] ?? (rawOrigin || "SEM ORIGEM");
    a.m.por_origem[origin] = (a.m.por_origem[origin] ?? 0) + value;

    const week = c.semana >= 0 ? parseBRL(row[c.semana]) : null;
    if (week !== null) a.m.por_semana[String(week)] = (a.m.por_semana[String(week)] ?? 0) + value;
  }

  if (skipped) warnings.push(`${skipped} linha(s) de vendas ignorada(s) por data ou valor inválido`);
  if (outsideYear) warnings.push(`${outsideYear} linha(s) com emissão fora de ${year}`);
  if (monthMismatch.length) {
    const shown = monthMismatch.slice(0, 5).join(", ");
    warnings.push(
      `Coluna "Mês" diverge da data de emissão em ${monthMismatch.length} linha(s) (pedido(s): ${shown}${monthMismatch.length > 5 ? "…" : ""}); usado o mês da Emissão`
    );
  }

  // ── Metas ──
  const sellerByName = new Map(sellers.map((s) => [canon(s.sheet_name), s]));
  const sellerMeta = new Map<string, MetaTable>(); // chave: canon(sheet_name)
  for (const s of sellers) {
    const firstWord = headerKey(s.sheet_name).split(" ")[0];
    const title = Object.keys(sheets).find((t) => headerKey(t) === firstWord);
    if (title === undefined) {
      warnings.push(`Meta não configurada para ${s.sheet_name}: sem aba "${firstWord}" na planilha`);
      continue;
    }
    const t = parseMetaSheet(sheets[title]);
    metaWarnings(s.sheet_name, t, warnings);
    sellerMeta.set(canon(s.sheet_name), t);
  }
  const metaSheet = sheetByName(sheets, SHEETS.metaEmpresa);
  // Na aba da empresa as origens não incluem a feira: vale a linha TOTAL GERAL (com sazonalidade)
  const companyParsed = metaSheet ? parseMetaSheet(metaSheet) : null;
  const companyMeta: MetaTable | null = companyParsed
    ? { monthly: companyParsed.totalRow ?? companyParsed.monthly, totalRow: null }
    : null;
  if (!companyMeta) warnings.push(`Aba "${SHEETS.metaEmpresa}" não encontrada: meta da empresa não configurada`);
  else {
    if (sellerMeta.size > 0) {
      const diff = MONTH_HEADERS.filter((_, i) => {
        const sum = Array.from(sellerMeta.values()).reduce((s, t) => s + (t.monthly[i] ?? 0), 0);
        return Math.abs(sum - (companyMeta.monthly[i] ?? 0)) > CHECK_TOLERANCE;
      });
      if (diff.length) warnings.push(`Soma das metas dos vendedores difere da meta da empresa em: ${diff.join(", ")}`);
    }
  }

  // ── Linhas de saída ──
  const rows: SalesRowOut[] = [];
  const periodsOfYear = MONTH_HEADERS.map((_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const namesInSheet = new Set(Array.from(acc.keys()).map((k) => k.split("|")[0]));

  const finalize = (m: SalesMetrics): SalesMetrics => ({
    ...m,
    vendas: r2(m.vendas),
    maquinas: r2(m.maquinas),
    pecas: r2(m.pecas),
    estornos: r2(m.estornos),
    por_origem: Object.fromEntries(Object.entries(m.por_origem).map(([k, v]) => [k, r2(v)])),
    por_semana: Object.fromEntries(Object.entries(m.por_semana).map(([k, v]) => [k, r2(v)])),
  });

  // por vendedor/nome
  const names = new Set<string>(Array.from(namesInSheet));
  Array.from(sellerMeta.keys()).forEach((n) => names.add(n));
  Array.from(names).forEach((name) => {
    const seller = sellerByName.get(name);
    const meta = sellerMeta.get(name);
    const label = seller?.sheet_name.replace(/\s+/g, " ").trim() ?? firstLabel.get(name) ?? name;
    const periods = new Set<string>();
    acc.forEach((a, k) => {
      if (k.startsWith(`${name}|`)) periods.add(a.period);
    });
    if (meta) periodsOfYear.forEach((p) => periods.add(p));
    periods.forEach((period) => {
      const a = acc.get(`${name}|${period}`);
      const monthIdx = Number(period.slice(5)) - 1;
      const inYear = Number(period.slice(0, 4)) === year;
      const m = a?.m ?? emptyMetrics(dadosAte, null);
      m.meta = meta && inYear ? (meta.monthly[monthIdx] ?? 0) : null;
      rows.push({ seller_id: seller?.id ?? null, seller_label: label, period, metrics: finalize(m) });
    });
  });

  // total da empresa
  const companyPeriods = new Set<string>();
  acc.forEach((a) => companyPeriods.add(a.period));
  if (companyMeta) periodsOfYear.forEach((p) => companyPeriods.add(p));
  companyPeriods.forEach((period) => {
    const m = emptyMetrics(dadosAte, companyMeta && Number(period.slice(0, 4)) === year ? (companyMeta.monthly[Number(period.slice(5)) - 1] ?? 0) : null);
    acc.forEach((a) => {
      if (a.period !== period) return;
      m.vendas += a.m.vendas;
      m.maquinas += a.m.maquinas;
      m.pecas += a.m.pecas;
      m.estornos += a.m.estornos;
      Object.entries(a.m.por_origem).forEach(([k, v]) => (m.por_origem[k] = (m.por_origem[k] ?? 0) + v));
      Object.entries(a.m.por_semana).forEach(([k, v]) => (m.por_semana[k] = (m.por_semana[k] ?? 0) + v));
    });
    rows.push({ seller_id: null, seller_label: COMPANY_LABEL, period, metrics: finalize(m) });
  });

  // ── Conferência com o Resumo ──
  if (totalL2 !== null && Math.abs(totalPlanilha - totalL2) > CHECK_TOLERANCE) {
    warnings.unshift(
      `CONFERÊNCIA: soma das linhas (${r2(totalPlanilha)}) difere de Resumo "${RESUMO_HEADERS.totalAteAgora}" (${r2(totalL2)})`
    );
  }
  if (mesAtualS2 !== null) {
    const period = (dadosAte ?? now.toISOString().slice(0, 10)).slice(0, 7);
    const company = rows.find((r) => r.seller_label === COMPANY_LABEL && r.period === period);
    const v = company?.metrics.vendas ?? 0;
    if (Math.abs(v - mesAtualS2) > CHECK_TOLERANCE) {
      warnings.unshift(`CONFERÊNCIA: vendas de ${period} (${r2(v)}) diferem de Resumo "${RESUMO_HEADERS.vendasMesAtual}" (${r2(mesAtualS2)})`);
    }
  }

  // ── Vínculos ──
  const former = new Set(formerSellerNames.map(canon));
  const house = new Set(nonSellerNames.map(canon));
  let vinculado = 0;
  const unlinkedNames: string[] = [];
  totalByName.forEach((total, name) => {
    if (sellerByName.has(name)) vinculado += total;
    else if (!former.has(name) && !house.has(name)) unlinkedNames.push(firstLabel.get(name) ?? name);
  });
  if (unlinkedNames.length) warnings.push(`Nomes na planilha sem vínculo: ${unlinkedNames.join(", ")}`);
  sellers.forEach((s) => {
    const n = canon(s.sheet_name);
    if (!namesInSheet.has(n)) warnings.push(`Vendedor "${s.sheet_name}" sem nenhuma venda na planilha (confira o nome exato da coluna Vendedor)`);
  });

  return {
    rows,
    year,
    status: {
      dados_ate: dadosAte,
      total_planilha: r2(totalPlanilha),
      total_resumo_l2: totalL2 === null ? null : r2(totalL2),
      total_vinculado: r2(vinculado),
      total_outros: r2(totalPlanilha - vinculado),
    },
    warnings,
    unlinkedNames,
    skippedRows: skipped,
  };
}
