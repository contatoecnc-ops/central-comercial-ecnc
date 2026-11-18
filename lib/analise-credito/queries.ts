/**
 * Leituras das telas de análise de crédito (admin e financeiro). Service role: as páginas conferem o papel antes.
 * Documento sai SEMPRE mascarado; o PDF só sai por /api/analises/[id]/arquivo (admin).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { estadoAnalise, hojeBrasilia, mascararDocumento, somenteDigitos, type EstadoAnalise } from "@/lib/analise-credito/regras";

export interface VinculoLinha { contrato_id: string; numero: string; cliente: string; origem: "automatico" | "manual"; vinculada_em: string }
export interface AnaliseLinha {
  id: string;
  cliente_nome: string;
  documentos: string[]; // mascarados
  resultado: "aprovada" | "reprovada";
  estado: EstadoAnalise;
  analisada_em: string;
  validade_ate: string;
  created_at: string;
  enviado_por_nome: string;
  vinculos: VinculoLinha[];
}

export const POR_PAGINA = 20;
const COLUNAS = "id, cliente_nome, documentos, resultado, analisada_em, validade_ate, created_at, enviado_por";

async function montar(linhas: Record<string, unknown>[], comContratos: boolean): Promise<AnaliseLinha[]> {
  const db = createAdminClient();
  const hoje = hojeBrasilia();
  const ids = linhas.map((l) => l.id as string);
  const autores = Array.from(new Set(linhas.map((l) => l.enviado_por as string)));
  const [{ data: perfis }, { data: vinc }] = await Promise.all([
    autores.length ? db.from("profiles").select("id, full_name").in("id", autores) : Promise.resolve({ data: [] }),
    ids.length
      ? db.from("contratos_analises").select("analise_id, contrato_id, origem, vinculada_em, contrato:contratos(numero, cliente_razao_social)").in("analise_id", ids)
      : Promise.resolve({ data: [] }),
  ]);
  const nomes = new Map((perfis ?? []).map((p) => [p.id as string, p.full_name as string]));
  const porAnalise = new Map<string, VinculoLinha[]>();
  for (const v of (vinc ?? []) as unknown as { analise_id: string; contrato_id: string; origem: "automatico" | "manual"; vinculada_em: string; contrato: { numero: string; cliente_razao_social: string } | { numero: string; cliente_razao_social: string }[] | null }[]) {
    const c = Array.isArray(v.contrato) ? v.contrato[0] : v.contrato;
    porAnalise.set(v.analise_id, [
      ...(porAnalise.get(v.analise_id) ?? []),
      // o financeiro só precisa saber SE está vinculada: nada de dado de contrato para ele
      { contrato_id: comContratos ? v.contrato_id : "", numero: comContratos ? c?.numero ?? "" : "", cliente: comContratos ? c?.cliente_razao_social ?? "" : "", origem: v.origem, vinculada_em: v.vinculada_em },
    ]);
  }
  return linhas.map((l) => ({
    id: l.id as string,
    cliente_nome: l.cliente_nome as string,
    documentos: (l.documentos as string[]).map(mascararDocumento),
    resultado: l.resultado as "aprovada" | "reprovada",
    estado: estadoAnalise({ resultado: l.resultado as "aprovada" | "reprovada", validade_ate: l.validade_ate as string }, hoje),
    analisada_em: l.analisada_em as string,
    validade_ate: l.validade_ate as string,
    created_at: l.created_at as string,
    enviado_por_nome: nomes.get(l.enviado_por as string) ?? "—",
    vinculos: porAnalise.get(l.id as string) ?? [],
  }));
}

/** Lista do financeiro (só os envios dele; sem dado de contrato) ou, com userId nulo, de todos (admin na mesma tela). */
export async function listarEnvios(userId: string | null, pagina: number) {
  let q = createAdminClient().from("analises_credito").select(COLUNAS, { count: "exact" }).order("created_at", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  if (userId) q = q.eq("enviado_por", userId);
  const { data, count } = await q;
  return { total: count ?? 0, itens: await montar((data ?? []) as Record<string, unknown>[], false) };
}

/** Caixa de entrada do admin: aba "aguardando" (sem vínculo) ou "vinculadas", com busca por nome ou documento. */
export async function listarCaixa(aba: "aguardando" | "vinculadas", busca: string, pagina: number) {
  let q = createAdminClient().from("analises_credito").select(COLUNAS).order("created_at", { ascending: false }).limit(500);
  const termo = busca.trim();
  const digitos = somenteDigitos(termo);
  if (digitos.length === 11 || digitos.length === 14) q = q.contains("documentos", [digitos]);
  else if (termo) q = q.ilike("cliente_nome", `%${termo.replace(/[%_,()\\]/g, " ")}%`);
  const { data } = await q;
  const todas = await montar((data ?? []) as Record<string, unknown>[], true);
  const filtradas = todas.filter((a) => (aba === "vinculadas" ? a.vinculos.length > 0 : a.vinculos.length === 0));
  return {
    total: filtradas.length,
    contagem: { aguardando: todas.filter((a) => a.vinculos.length === 0).length, vinculadas: todas.filter((a) => a.vinculos.length > 0).length },
    itens: filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA),
  };
}

/** Contratos abertos para a lista do "Vincular a contrato". */
export async function contratosParaVincular() {
  const { data } = await createAdminClient().from("contratos").select("id, numero, cliente_razao_social")
    .in("status", ["aguardando_aprovacao", "reprovado", "aprovado", "enviado_cliente"]).order("created_at", { ascending: false }).limit(400);
  return (data ?? []) as { id: string; numero: string; cliente_razao_social: string }[];
}

/** Bloco "Análise de crédito" do detalhe do contrato (admin). */
export async function analisesDoContrato(contratoId: string) {
  const { data } = await createAdminClient()
    .from("contratos_analises")
    .select("analise_id, origem, vinculada_em, analise:analises_credito(" + COLUNAS + ")")
    .eq("contrato_id", contratoId);
  const analises = ((data ?? []) as unknown as { analise: Record<string, unknown> | Record<string, unknown>[] | null; origem: "automatico" | "manual"; vinculada_em: string }[])
    .map((v) => ({ a: Array.isArray(v.analise) ? v.analise[0] : v.analise, origem: v.origem, vinculada_em: v.vinculada_em }))
    .filter((x) => x.a);
  const linhas = await montar(analises.map((x) => x.a as Record<string, unknown>), false);
  return linhas
    .map((l, i) => ({ ...l, origem: analises[i].origem, vinculada_em: analises[i].vinculada_em }))
    .sort((x, y) => (x.analisada_em === y.analisada_em ? y.created_at.localeCompare(x.created_at) : y.analisada_em.localeCompare(x.analisada_em)));
}
export type AnaliseDoContrato = Awaited<ReturnType<typeof analisesDoContrato>>[number];
