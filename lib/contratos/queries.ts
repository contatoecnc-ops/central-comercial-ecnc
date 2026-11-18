/**
 * Leituras das telas de Contratos. Usam o client do USUÁRIO (RLS: vendedor só os dele, admin todos) —
 * a service role fica só nas rotas de API e nos avisos.
 */
import { createClient } from "@/lib/supabase/server";
import type { RegistroContrato } from "@/lib/agente-contratos";
import type { DocumentoExigido } from "@/lib/agente-contratos/repositorio/tipos";

export interface ContratoCard {
  id: string;
  numero: string;
  status: RegistroContrato["status"];
  vendedor_id: string;
  vendedor_nome: string;
  cliente_razao_social: string;
  cliente_tipo_pessoa: "PF" | "PJ";
  valor_total_centavos: number;
  condicao_pagamento: string;
  nivel_aprovacao: 1 | 2 | 3;
  motivos_nivel: string[];
  documentos: DocumentoExigido[];
  motivo_reprovacao: string | null;
  created_at: string;
  updated_at: string;
  equipamento: { tipo?: string; modelo?: string } | null;
  /** Assinatura recusada no ZapSign (destaque vermelho). */
  recusado: boolean;
}

const CAMPOS_CARD =
  "id, numero, status, vendedor_id, vendedor_nome, cliente_razao_social, cliente_tipo_pessoa, valor_total_centavos, condicao_pagamento, nivel_aprovacao, motivos_nivel, documentos, motivo_reprovacao, created_at, updated_at, equipamento:dados->equipamento";

export async function listarContratos(opts: { vendedorId?: string; cancelados?: boolean }): Promise<ContratoCard[]> {
  const supabase = createClient();
  let q = supabase.from("contratos").select(CAMPOS_CARD);
  q = opts.cancelados ? q.eq("status", "cancelado") : q.neq("status", "cancelado");
  if (opts.vendedorId) q = q.eq("vendedor_id", opts.vendedorId);
  const { data } = await q.order("updated_at", { ascending: false }).limit(300);
  const lista = ((data ?? []) as unknown as Omit<ContratoCard, "recusado">[]).map((c) => ({ ...c, recusado: false }));

  const enviados = lista.filter((c) => c.status === "enviado_cliente").map((c) => c.id);
  if (enviados.length) {
    const { data: ev } = await supabase.from("contratos_eventos").select("contrato_id").eq("evento", "recusado_zapsign").in("contrato_id", enviados);
    const recusados = new Set((ev ?? []).map((e) => e.contrato_id as string));
    for (const c of lista) c.recusado = recusados.has(c.id);
  }
  return lista;
}

export type ContratoCompleto = RegistroContrato & { created_at: string; updated_at: string };

export async function carregarContrato(id: string): Promise<ContratoCompleto | null> {
  const { data } = await createClient().from("contratos").select("*").eq("id", id).maybeSingle();
  return (data as ContratoCompleto) ?? null;
}

export interface EventoContrato { id: number; evento: string; por: string; detalhe: Record<string, unknown> | null; em: string }

export async function listarEventos(contratoId: string): Promise<(EventoContrato & { quem: string })[]> {
  const supabase = createClient();
  const { data } = await supabase.from("contratos_eventos").select("id, evento, por, detalhe, em").eq("contrato_id", contratoId).order("em").order("id");
  const eventos = (data ?? []) as EventoContrato[];
  const ids = Array.from(new Set(eventos.map((e) => e.por).filter((p) => /^[0-9a-f-]{36}$/i.test(p))));
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data: perfis } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    for (const p of perfis ?? []) nomes.set(p.id, p.full_name);
  }
  return eventos.map((e) => ({ ...e, quem: nomes.get(e.por) ?? (e.por === "zapsign" ? "ZapSign" : "—") }));
}

/** Contratos esperando aprovação (RLS: só o admin enxerga todos). */
export async function countContratosAguardando(): Promise<number> {
  const { count } = await createClient().from("contratos").select("id", { count: "exact", head: true }).eq("status", "aguardando_aprovacao");
  return count ?? 0;
}

export async function listarVendedoresContratos() {
  const { data } = await createClient().from("profiles").select("id, full_name").eq("role", "vendedor").order("full_name");
  return (data ?? []) as { id: string; full_name: string }[];
}
