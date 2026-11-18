/**
 * Análise de crédito — helpers SOMENTE de servidor (service role: quem chama confere a permissão antes).
 * Regra de log: nada de nome de cliente, CPF/CNPJ, conteúdo do PDF nem URL assinada. Só ids e mensagem curta.
 */
import { randomUUID } from "node:crypto";
import { ANALISE_ENVIOS_POR_HORA } from "@/lib/contratos-config";
import { avisarAdminsTexto, logErro } from "@/lib/contratos/servidor";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  contratoParcelado, documentosDoContrato, seloDe,
  type AnaliseResumo, type SeloAnalise,
} from "@/lib/analise-credito/regras";

export type PapelAnalise = "admin" | "financeiro";
export interface CtxAnalise { userId: string; nome: string; papel: PapelAnalise }

const STATUS_ABERTOS = ["aguardando_aprovacao", "reprovado", "aprovado"];

/** Rotas de análise: sessão ativa e papel admin ou financeiro. Vendedor, marketing e analista: 403. */
export async function contextoAnalises(): Promise<{ ok: true; ctx: CtxAnalise } | { ok: false; status: 401 | 403 }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };
  const { data: p } = await supabase.from("profiles").select("full_name, role, active").eq("id", user.id).single();
  if (!p || !p.active) return { ok: false, status: 401 };
  if (p.role === "admin" || p.role === "financeiro") return { ok: true, ctx: { userId: user.id, nome: p.full_name, papel: p.role } };
  return { ok: false, status: 403 };
}

/** 30 envios por hora por usuário (contados em canal_atualizacoes, vale entre instâncias serverless). */
export async function registrarEnvioAnalise(userId: string): Promise<boolean> {
  const db = createAdminClient();
  const desde = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("canal_atualizacoes").select("*", { count: "exact", head: true })
    .eq("canal", "uso_analise").like("atualizacao_id", `${userId}:%`).gte("em", desde);
  if ((count ?? 0) >= ANALISE_ENVIOS_POR_HORA) return false;
  await db.from("canal_atualizacoes").insert({ canal: "uso_analise", atualizacao_id: `${userId}:${randomUUID()}` });
  return true;
}

async function criarVinculos(contratos: { id: string; numero: string }[], analiseId: string, origem: "automatico" | "manual", por: string | null) {
  const db = createAdminClient();
  if (!contratos.length) return [] as { id: string; numero: string }[];
  const { data: existentes } = await db.from("contratos_analises").select("contrato_id").eq("analise_id", analiseId).in("contrato_id", contratos.map((c) => c.id));
  const ja = new Set((existentes ?? []).map((e) => e.contrato_id as string));
  const novos = contratos.filter((c) => !ja.has(c.id));
  if (!novos.length) return [];
  const { error } = await db.from("contratos_analises").upsert(
    novos.map((c) => ({ contrato_id: c.id, analise_id: analiseId, origem, vinculada_por: por })),
    { onConflict: "contrato_id,analise_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`Falha ao vincular análise: ${error.message}`);
  await db.from("contratos_eventos").insert(
    novos.map((c) => ({ contrato_id: c.id, evento: "analise_vinculada", por: por ?? "sistema", detalhe: { analise_id: analiseId, origem } })),
  );
  return novos;
}

/**
 * Contrato gerado ou corrigido → liga sozinho as análises que compartilham CPF/CNPJ (comprador, signatários, garantidor).
 * Idempotente. NUNCA lança: uma falha aqui não pode quebrar a geração do contrato.
 */
export async function vincularAnalisesAoContrato(contratoId: string): Promise<void> {
  try {
    const db = createAdminClient();
    const { data: c } = await db.from("contratos").select("id, numero, dados").eq("id", contratoId).maybeSingle();
    if (!c) return;
    const docs = documentosDoContrato(c.dados);
    if (!docs.length) return;
    const { data: analises } = await db.from("analises_credito").select("id").overlaps("documentos", docs);
    let ligou = false;
    for (const a of analises ?? []) {
      if ((await criarVinculos([{ id: c.id, numero: c.numero }], a.id, "automatico", null)).length) ligou = true;
    }
    if (ligou) await avisarAdminsTexto(`Análise de crédito ligada ao contrato ${c.numero}.`, { rotulo: "Abrir contrato", caminho: `/admin/contratos/${c.id}` });
  } catch (e) {
    logErro("vincular análises ao contrato", contratoId, e);
  }
}

/** Análise nova → liga aos contratos ABERTOS (aguardando aprovação, reprovado ou aprovado) com documento em comum. */
export async function vincularContratosAbertosA(analiseId: string): Promise<{ id: string; numero: string }[]> {
  try {
    const db = createAdminClient();
    const { data: a } = await db.from("analises_credito").select("documentos").eq("id", analiseId).maybeSingle();
    if (!a) return [];
    const alvo = new Set<string>(a.documentos as string[]);
    const { data: abertos } = await db.from("contratos").select("id, numero, dados").in("status", STATUS_ABERTOS).limit(2000);
    const casam = (abertos ?? []).filter((c) => documentosDoContrato(c.dados).some((d) => alvo.has(d)));
    return await criarVinculos(casam.map((c) => ({ id: c.id, numero: c.numero })), analiseId, "automatico", null);
  } catch (e) {
    logErro("vincular contratos à análise", analiseId, e);
    return [];
  }
}

export async function vincularManual(analiseId: string, contratoId: string, por: string): Promise<"ok" | "nao_encontrado"> {
  const db = createAdminClient();
  const [{ data: a }, { data: c }] = await Promise.all([
    db.from("analises_credito").select("id").eq("id", analiseId).maybeSingle(),
    db.from("contratos").select("id, numero").eq("id", contratoId).maybeSingle(),
  ]);
  if (!a || !c) return "nao_encontrado";
  await criarVinculos([{ id: c.id, numero: c.numero }], analiseId, "manual", por);
  return "ok";
}

export async function desvincular(analiseId: string, contratoId: string, por: string): Promise<"ok" | "nao_encontrado"> {
  const db = createAdminClient();
  const { data } = await db.from("contratos_analises").delete().eq("analise_id", analiseId).eq("contrato_id", contratoId).select("contrato_id");
  if (!data?.length) return "nao_encontrado";
  await db.from("contratos_eventos").insert({ contrato_id: contratoId, evento: "analise_desvinculada", por, detalhe: { analise_id: analiseId } });
  return "ok";
}

/** Selo de cada contrato PARCELADO da lista (à vista não entra no mapa). Vendedor: use `semValidade`. */
export async function selosDeContratos(
  contratos: { id: string; condicao_pagamento: string; parcelas?: number | null }[],
  opts: { semValidade?: boolean } = {},
): Promise<Map<string, SeloAnalise>> {
  const out = new Map<string, SeloAnalise>();
  const parcelados = contratos.filter((c) => contratoParcelado(c.condicao_pagamento, { parcelas: c.parcelas }));
  if (!parcelados.length) return out;
  const { data } = await createAdminClient()
    .from("contratos_analises")
    .select("contrato_id, analise:analises_credito(id, resultado, analisada_em, validade_ate, created_at)")
    .in("contrato_id", parcelados.map((c) => c.id));
  const porContrato = new Map<string, AnaliseResumo[]>();
  for (const l of (data ?? []) as unknown as { contrato_id: string; analise: AnaliseResumo | AnaliseResumo[] | null }[]) {
    const a = Array.isArray(l.analise) ? l.analise[0] : l.analise;
    if (!a) continue;
    porContrato.set(l.contrato_id, [...(porContrato.get(l.contrato_id) ?? []), a]);
  }
  for (const c of parcelados) {
    const s = seloDe(porContrato.get(c.id) ?? []);
    out.set(c.id, opts.semValidade ? { estado: s.estado } : s);
  }
  return out;
}

/** Contadores do dashboard do admin. */
export async function contadoresAnalise(): Promise<{ aguardandoContrato: number; parceladosSemAnalise: number }> {
  const db = createAdminClient();
  const [{ data: todas }, { data: vinc }, { data: abertos }] = await Promise.all([
    db.from("analises_credito").select("id").limit(5000),
    db.from("contratos_analises").select("analise_id, contrato_id").limit(10000),
    db.from("contratos").select("id, condicao_pagamento, parcelas:dados->pagamento->parcelas").in("status", STATUS_ABERTOS).limit(2000),
  ]);
  const analisesLigadas = new Set((vinc ?? []).map((v) => v.analise_id as string));
  const contratosComAnalise = new Set((vinc ?? []).map((v) => v.contrato_id as string));
  const aguardandoContrato = (todas ?? []).filter((a) => !analisesLigadas.has(a.id)).length;
  const parceladosSemAnalise = ((abertos ?? []) as unknown as { id: string; condicao_pagamento: string; parcelas: number | null }[])
    .filter((c) => contratoParcelado(c.condicao_pagamento, { parcelas: c.parcelas }) && !contratosComAnalise.has(c.id)).length;
  return { aguardandoContrato, parceladosSemAnalise };
}
