import { fromZonedTime } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import { TZ } from "@/lib/dates";
import { addDays, isValidDate } from "@/lib/analysis/period";
import { ABANDON_HOURS, PAGE_SIZE, STATUS_FILTROS, TEMPERATURA_FILTROS } from "@/lib/michele/config";
import type {
  MicheleAtendimento,
  MicheleAtendimentoLinha,
  MicheleMensagem,
  MicheleRelatorio,
} from "@/types/database";

/** Início do dia (America/Sao_Paulo) de "YYYY-MM-DD", em ISO UTC. */
export const dayStartUtc = (iso: string) => fromZonedTime(`${iso}T00:00:00`, TZ).toISOString();

/** Janela [de, até) que cobre os dias from..to inclusive, em ISO UTC. */
export const windowUtc = (from: string, to: string) => ({ de: dayStartUtc(from), ate: dayStartUtc(addDays(to, 1)) });

export async function getRelatorio(from: string, to: string): Promise<MicheleRelatorio> {
  const { de, ate } = windowUtc(from, to);
  const { data, error } = await createClient().rpc("michele_relatorio", { p_de: de, p_ate: ate });
  if (error || !data) throw new Error(`michele_relatorio: ${error?.code ?? "sem_dados"}`);
  return data as MicheleRelatorio;
}

const COLUNAS =
  "id, sessao_id, telefone, nome, origem, campanha, status, score, temperatura, prioridade, segmento, budget, momento_compra, produto_provavel, kommo_lead_id, iniciado_em, ultima_mensagem_em, encerrado_em, ultima_atividade_em, status_efetivo, msgs_lead, msgs_total";

/** Atendimentos em andamento e ainda ativos (mensagem nas últimas 24 h), mais recentes primeiro. */
export async function listEmAndamento(limit = 100): Promise<MicheleAtendimentoLinha[]> {
  const since = new Date(Date.now() - ABANDON_HOURS * 3_600_000).toISOString();
  const { data, error } = await createClient()
    .from("v_michele_atendimentos")
    .select(COLUNAS)
    .eq("status", "em_andamento")
    .gte("ultima_atividade_em", since)
    .order("ultima_atividade_em", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`v_michele_atendimentos: ${error.code ?? "erro"}`);
  return (data ?? []) as unknown as MicheleAtendimentoLinha[];
}

export interface ConversaFiltros {
  q?: string;
  status?: string;
  temperatura?: string;
  campanha?: string;
  from?: string;
  to?: string;
  page?: number;
}

/** Deixa só letras, números e espaço: o termo entra num filtro do PostgREST. */
const safeTerm = (s: string) => s.replace(/[^a-zA-Z0-9À-ÿ ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

export async function listConversas(f: ConversaFiltros) {
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const abandonSince = new Date(Date.now() - ABANDON_HOURS * 3_600_000).toISOString();
  let q = createClient().from("v_michele_atendimentos").select(COLUNAS, { count: "exact" });

  const term = safeTerm(f.q ?? "");
  if (term) {
    const digits = term.replace(/\D/g, "");
    const conds = [`nome.ilike.*${term}*`];
    if (digits.length >= 3) conds.push(`telefone.like.*${digits}*`);
    q = q.or(conds.join(","));
  }
  if (f.status === "abandonado") q = q.eq("status", "em_andamento").lt("ultima_atividade_em", abandonSince);
  else if (f.status === "em_andamento") q = q.eq("status", "em_andamento").gte("ultima_atividade_em", abandonSince);
  else if ((STATUS_FILTROS as readonly string[]).includes(f.status ?? "")) q = q.eq("status", f.status!);
  if ((TEMPERATURA_FILTROS as readonly string[]).includes(f.temperatura ?? "")) q = q.eq("temperatura", f.temperatura!);
  if (f.campanha === "__sem__") q = q.is("campanha", null);
  else if (f.campanha) q = q.eq("campanha", f.campanha.slice(0, 120));
  if (f.from && isValidDate(f.from)) q = q.gte("iniciado_em", dayStartUtc(f.from));
  if (f.to && isValidDate(f.to)) q = q.lt("iniciado_em", dayStartUtc(addDays(f.to, 1)));

  const { data, error, count } = await q
    .order("ultima_atividade_em", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error(`v_michele_atendimentos: ${error.code ?? "erro"}`);
  return { rows: (data ?? []) as unknown as MicheleAtendimentoLinha[], total: count ?? 0, page };
}

/** Campanhas distintas para o filtro (últimas 500 linhas mais recentes bastam para o seletor). */
export async function listCampanhas(): Promise<string[]> {
  const { data } = await createClient()
    .from("michele_atendimentos")
    .select("campanha")
    .not("campanha", "is", null)
    .order("iniciado_em", { ascending: false })
    .limit(500);
  return Array.from(new Set((data ?? []).map((r) => String(r.campanha)))).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function getConversa(id: string) {
  const db = createClient();
  const [a, m] = await Promise.all([
    db.from("v_michele_atendimentos").select(COLUNAS).eq("id", id).maybeSingle(),
    db.from("michele_mensagens").select("*").eq("atendimento_id", id).order("ordem", { ascending: true }).limit(2000),
  ]);
  if (a.error || !a.data) return null;
  const { data: full } = await db.from("michele_atendimentos").select("resumo, cnpj_cpf").eq("id", id).maybeSingle();
  return {
    atendimento: a.data as unknown as MicheleAtendimentoLinha,
    extra: (full ?? { resumo: null, cnpj_cpf: null }) as Pick<MicheleAtendimento, "resumo" | "cnpj_cpf">,
    mensagens: (m.data ?? []) as MicheleMensagem[],
  };
}
