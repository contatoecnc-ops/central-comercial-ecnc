import { createAdminClient } from "@/lib/supabase/admin";
import { COMPANY_LABEL } from "@/lib/sales-config";
import { canon } from "@/lib/sales/parse";
import { mockRows, readWorkbook } from "@/lib/sales/source";
import { parseSalesWorkbook, type ParseResult, type SalesRowOut, type SellerInfo } from "@/lib/sales/workbook";

export interface SyncSummary {
  source: string;
  rows: number;
  linked: number;
  unlinkedNames: string[];
  dadosAte: string | null;
  totalPlanilha: number;
  totalResumoL2: number | null;
  totalVinculado: number;
  totalOutros: number;
  /** conferências (CONFERÊNCIA…) vêm primeiro */
  warnings: string[];
}

/**
 * Lê a fonte, agrega e grava SÓ totais por vendedor e mês (service role).
 * Nunca registra em log nem grava dados de cliente ou de pedido.
 */
export async function syncSales(source: "mock" | "sheets"): Promise<SyncSummary> {
  const db = createAdminClient();
  const { data: profiles, error: pErr } = await db
    .from("profiles")
    .select("id, full_name, sheet_name, active")
    .eq("role", "vendedor");
  if (pErr) throw new Error(`Erro ao ler vendedores: ${pErr.message}`);

  const warnings: string[] = [];
  const withName = (profiles ?? []).filter((p) => p.sheet_name?.trim());
  (profiles ?? [])
    .filter((p) => p.active && !p.sheet_name?.trim())
    .forEach((p) => warnings.push(`Vendedor ${p.full_name} sem "nome na planilha" cadastrado`));

  let rows: SalesRowOut[];
  let year: number;
  let status: ParseResult["status"];
  let unlinkedNames: string[] = [];

  if (source === "mock") {
    // no mock, vendedores sem sheet_name usam o nome completo para o visual funcionar
    const sellers: SellerInfo[] = (profiles ?? []).map((p) => ({ id: p.id, sheet_name: p.sheet_name?.trim() || p.full_name }));
    rows = mockRows(sellers);
    year = new Date().getUTCFullYear();
    const total = rows.filter((r) => r.seller_label === COMPANY_LABEL).reduce((s, r) => s + r.metrics.vendas, 0);
    const linked = rows.filter((r) => r.seller_id).reduce((s, r) => s + r.metrics.vendas, 0);
    status = {
      dados_ate: new Date().toISOString().slice(0, 10),
      total_planilha: total,
      total_resumo_l2: total,
      total_vinculado: linked,
      total_outros: total - linked,
    };
    unlinkedNames = ["FULANO SEM VINCULO"];
    warnings.push("Modo de demonstração (SALES_SOURCE=mock): números fictícios");
  } else {
    const sellers: SellerInfo[] = withName.map((p) => ({ id: p.id, sheet_name: p.sheet_name!.trim() }));
    const parsed = parseSalesWorkbook(await readWorkbook(sellers), sellers);
    rows = parsed.rows;
    year = parsed.year;
    status = parsed.status;
    unlinkedNames = parsed.unlinkedNames;
    warnings.unshift(...parsed.warnings);
  }

  const syncedAt = new Date().toISOString();
  // dois vendedores com o mesmo nome normalizado: a chave (seller_label, period) é única
  const unique = new Map<string, SalesRowOut>();
  rows.forEach((r) => unique.set(`${r.seller_label}|${r.period}`, r));
  const records = Array.from(unique.values()).map((r) => ({ ...r, synced_at: syncedAt }));

  if (records.length) {
    const { error } = await db.from("sales_numbers").upsert(records, { onConflict: "seller_label,period" });
    if (error) throw new Error(`Erro ao gravar vendas: ${error.message}`);
  }

  // substitui o ano inteiro: remove o que sumiu da planilha (nomes/meses velhos)
  const { data: existing, error: eErr } = await db.from("sales_numbers").select("id, seller_label, period").like("period", `${year}-%`);
  if (eErr) throw new Error(`Erro ao conferir linhas antigas: ${eErr.message}`);
  const keep = new Set(records.map((r) => `${r.seller_label}|${r.period}`));
  const stale = (existing ?? []).filter((r) => !keep.has(`${r.seller_label}|${r.period}`)).map((r) => r.id);
  for (let i = 0; i < stale.length; i += 100) {
    const { error } = await db.from("sales_numbers").delete().in("id", stale.slice(i, i + 100));
    if (error) throw new Error(`Erro ao limpar linhas antigas: ${error.message}`);
  }

  const { error: sErr } = await db.from("sales_sync_status").upsert({
    id: 1,
    synced_at: syncedAt,
    dados_ate: status.dados_ate,
    total_planilha: status.total_planilha,
    total_resumo_l2: status.total_resumo_l2,
    total_vinculado: status.total_vinculado,
    total_outros: status.total_outros,
    avisos: warnings,
  });
  if (sErr) throw new Error(`Erro ao gravar status: ${sErr.message}`);

  return {
    source,
    rows: records.length,
    linked: records.filter((r) => r.seller_id).length,
    unlinkedNames,
    dadosAte: status.dados_ate,
    totalPlanilha: status.total_planilha,
    totalResumoL2: status.total_resumo_l2,
    totalVinculado: status.total_vinculado,
    totalOutros: status.total_outros,
    warnings,
  };
}

/** Reaplica o vínculo vendedor ↔ linha sem reler a planilha (após mudar sheet_name). */
export async function relinkSales() {
  const db = createAdminClient();
  const [{ data: profiles }, { data: rows }] = await Promise.all([
    db.from("profiles").select("id, sheet_name").eq("role", "vendedor"),
    db.from("sales_numbers").select("id, seller_id, seller_label"),
  ]);
  const byName = new Map<string, string>();
  for (const p of profiles ?? []) if (p.sheet_name) byName.set(canon(p.sheet_name), p.id);
  for (const r of rows ?? []) {
    if (r.seller_label === COMPANY_LABEL) continue;
    const target = byName.get(canon(r.seller_label)) ?? null;
    if (target !== r.seller_id) await db.from("sales_numbers").update({ seller_id: target }).eq("id", r.id);
  }
}
