/**
 * Contratos — helpers SOMENTE de servidor. Usam a service role (que ignora RLS):
 * quem chama é responsável por checar a permissão ANTES (ver contextoContratos e buscarContratoAutorizado).
 * Regra de log: nunca registrar conteúdo de mensagens, CPF/CNPJ, endereços, tokens, segredos nem corpo de webhooks.
 */
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  AgenteContratos, SupabaseConversas, SupabaseRepositorio, TelegramApi,
  avisarAssinado, avisarGestorNovoContrato, avisarGestorSuaVez, avisarRecusado,
  avisarVendedorAprovado, avisarVendedorEnviado, avisarVendedorReprovado,
  type RegistroContrato, type RespostaAgente, type Vendedor,
} from "@/lib/agente-contratos";
import { CHAT_LIMITE_POR_HORA } from "@/lib/contratos-config";
import { vendedorLiberado } from "@/lib/contratos/liberacao";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PapelContratos = "admin" | "vendedor";
export interface CtxContratos { userId: string; nome: string; email: string; papel: PapelContratos }

// ───────────────────────────────────────────────────────────────── erros e log

/** Mensagem para o usuário: regras do pacote passam; detalhes internos viram texto genérico. */
export function mensagemSegura(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (/^ZapSign/i.test(m)) return "O ZapSign não aceitou o envio. Confira os dados dos assinantes e tente de novo.";
  if (!m || /^(Falha|Erro interno|Telegram|Falta [A-Z_]{4,})|supabase|postgres|fetch failed|ECONN|ETIMEDOUT|duplicate key|violates/i.test(m))
    return "Não foi possível concluir a operação. Tente de novo; se continuar, avise o gestor.";
  return m;
}

function resumoErro(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/^ZapSign/i.test(m)) return `ZapSign ${m.match(/\((\d{3})\)/)?.[1] ?? "erro"}`; // o corpo da resposta pode ter dados pessoais
  return m.slice(0, 120);
}

export function logErro(contexto: string, id: string | undefined, e: unknown) {
  console.error(`contratos: ${contexto}${id ? ` id=${id}` : ""} — ${resumoErro(e)}`);
}

// ───────────────────────────────────────────────────────────────── autorização

/** Para rotas de API. Sessão ativa; papéis admin ou vendedor com Contratos liberado. Marketing e analista: sempre 403. */
export async function contextoContratos(): Promise<{ ok: true; ctx: CtxContratos } | { ok: false; status: 401 | 403 }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };
  const { data: perfil } = await supabase.from("profiles").select("full_name, email, role, active").eq("id", user.id).single();
  if (!perfil || !perfil.active) return { ok: false, status: 401 };
  if (perfil.role === "admin") return { ok: true, ctx: { userId: user.id, nome: perfil.full_name, email: perfil.email, papel: "admin" } };
  if (perfil.role === "vendedor" && (await vendedorLiberado(user.id)))
    return { ok: true, ctx: { userId: user.id, nome: perfil.full_name, email: perfil.email, papel: "vendedor" } };
  return { ok: false, status: 403 };
}

/** Para páginas: exige o papel e, no vendedor, o soft launch (contratos_liberado). Sem permissão: "Acesso negado". */
export async function exigirPaginaContratos(papel: PapelContratos) {
  const profile = await requireProfile(papel);
  if (papel === "vendedor" && !(await vendedorLiberado(profile.id))) redirect("/acesso-negado");
  return profile;
}

export const repositorio = () => new SupabaseRepositorio(createAdminClient());

/** Contrato só se o usuário puder ver (vendedor: só o dele; admin: qualquer). null = responder 404 genérico. */
export async function buscarContratoAutorizado(id: string, ctx: CtxContratos): Promise<RegistroContrato | null> {
  if (!UUID_RE.test(id)) return null;
  const c = await repositorio().buscarContrato(id);
  if (!c) return null;
  if (ctx.papel === "vendedor" && c.vendedor_id !== ctx.userId) return null;
  return c;
}

/** Dados do vendedor para o contrato: nome e e-mail do perfil; CPF e celular de perfis_contrato. */
export async function montarVendedor(userId: string): Promise<Vendedor | null> {
  const db = createAdminClient();
  const [{ data: p }, { data: pc }] = await Promise.all([
    db.from("profiles").select("id, full_name, email").eq("id", userId).maybeSingle(),
    db.from("perfis_contrato").select("cpf, celular").eq("user_id", userId).maybeSingle(),
  ]);
  if (!p) return null;
  return { id: p.id, nome: p.full_name, email: p.email || undefined, cpf: pc?.cpf || undefined, celular: pc?.celular || undefined };
}

/** Telegram: vendedor ativo, com Contratos liberado, pelo ID do Telegram cadastrado. */
export async function buscarVendedorPorTelegram(telegramId: string): Promise<Vendedor | null> {
  const db = createAdminClient();
  const { data: pc } = await db.from("perfis_contrato").select("user_id, contratos_liberado").eq("telegram_user_id", telegramId).maybeSingle();
  if (!pc || !pc.contratos_liberado) return null;
  const { data: p } = await db.from("profiles").select("role, active").eq("id", pc.user_id).maybeSingle();
  if (!p || !p.active || p.role !== "vendedor") return null;
  return montarVendedor(pc.user_id);
}

// ───────────────────────────────────────────────────────────────── limite de uso do agente (API paga)

/**
 * 30 mensagens por hora por usuário, contadas no banco (canal_atualizacoes) — vale entre instâncias serverless.
 * Retorna false quando o limite foi atingido; senão registra o uso.
 */
export async function registrarUsoAgente(userId: string): Promise<boolean> {
  const db = createAdminClient();
  const agora = Date.now();
  const { count } = await db.from("canal_atualizacoes").select("*", { count: "exact", head: true })
    .eq("canal", "uso_agente").like("atualizacao_id", `${userId}:%`).gte("em", new Date(agora - 3600_000).toISOString());
  if ((count ?? 0) >= CHAT_LIMITE_POR_HORA) return false;
  await db.from("canal_atualizacoes").insert({ canal: "uso_agente", atualizacao_id: `${userId}:${randomUUID()}` });
  // limpeza do que já passou de 1 dia (não precisa esperar)
  void db.from("canal_atualizacoes").delete().eq("canal", "uso_agente").like("atualizacao_id", `${userId}:%`)
    .lt("em", new Date(agora - 86_400_000).toISOString()).then(() => undefined);
  return true;
}

/** Mesmo agente, com o limite por hora: usado no Telegram, que chama `responder` por dentro do pacote. */
export class AgenteComLimite extends AgenteContratos {
  async responder(p: Parameters<AgenteContratos["responder"]>[0]): Promise<RespostaAgente> {
    if (!(await registrarUsoAgente(p.vendedor.id)))
      return { texto: "Você atingiu o limite de mensagens por hora. Tente de novo mais tarde.", mensagens: p.historico ?? [], estado: p.estado! };
    return super.responder(p);
  }
}

const opcoesAgente = () => ({ repo: repositorio(), modelo: process.env.MODELO_IA || undefined });
export const criarAgente = () => new AgenteContratos(opcoesAgente());
export const criarAgenteTelegram = () => new AgenteComLimite(opcoesAgente());

// ───────────────────────────────────────────────────────────────── arquivos

export async function baixarArquivo(bucket: string, caminho: string): Promise<Buffer | null> {
  const { data, error } = await createAdminClient().storage.from(bucket).download(caminho);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export const nomeDoArquivo = (caminho: string) => caminho.split("/").pop() ?? "contrato.docx";

// ───────────────────────────────────────────────────────────────── Telegram (avisos nunca quebram a ação na Central)

export const telegramApi = () => (process.env.TELEGRAM_BOT_TOKEN ? new TelegramApi(process.env.TELEGRAM_BOT_TOKEN) : null);

export function urlCentral(caminho: string): string | null {
  const base = process.env.CENTRAL_URL?.replace(/\/+$/, "");
  return base ? `${base}${caminho}` : null;
}

async function chatsAdmins(): Promise<string[]> {
  const db = createAdminClient();
  const { data: admins } = await db.from("profiles").select("id").eq("role", "admin").eq("active", true);
  const ids = (admins ?? []).map((a) => a.id);
  if (!ids.length) return [];
  const { data } = await db.from("perfis_contrato").select("telegram_user_id").in("user_id", ids).not("telegram_user_id", "is", null);
  return (data ?? []).map((r) => r.telegram_user_id as string);
}

async function chatVendedor(userId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("perfis_contrato").select("telegram_user_id").eq("user_id", userId).maybeSingle();
  return data?.telegram_user_id ?? null;
}

/** Contrato novo (ou corrigido) na fila de aprovação → resumo + .docx para cada admin com Telegram. */
export async function avisarGestor(contratoId: string) {
  try {
    const api = telegramApi();
    const link = urlCentral(`/admin/contratos/${contratoId}`);
    if (!api || !link) return;
    const c = await repositorio().buscarContrato(contratoId);
    if (!c || c.status !== "aguardando_aprovacao") return;
    const chats = await chatsAdmins();
    if (!chats.length) return;
    const arquivo = c.arquivo_path ? await baixarArquivo("contratos", c.arquivo_path) : null;
    const anexo = arquivo && c.arquivo_path ? { arquivo, nome: nomeDoArquivo(c.arquivo_path) } : undefined;
    for (const chat of chats) {
      await avisarGestorNovoContrato(api, [chat], c, link, anexo).catch((e) => logErro("aviso ao gestor", contratoId, e));
    }
  } catch (e) {
    logErro("aviso ao gestor", contratoId, e);
  }
}

export async function avisarAprovadoAoVendedor(c: RegistroContrato) {
  try {
    const api = telegramApi();
    const chat = await chatVendedor(c.vendedor_id);
    if (!api || !chat || !c.arquivo_path) return;
    const arquivo = await baixarArquivo("contratos", c.arquivo_path);
    if (!arquivo) return;
    await avisarVendedorAprovado(api, chat, c, arquivo, nomeDoArquivo(c.arquivo_path));
  } catch (e) {
    logErro("aviso de aprovação", c.id, e);
  }
}

export async function avisarReprovadoAoVendedor(c: RegistroContrato) {
  try {
    const api = telegramApi();
    const chat = await chatVendedor(c.vendedor_id);
    if (!api || !chat) return;
    await avisarVendedorReprovado(api, chat, c, new SupabaseConversas(createAdminClient()));
  } catch (e) {
    logErro("aviso de reprovação", c.id, e);
  }
}

export async function avisarEnviadoAoVendedor(c: RegistroContrato) {
  try {
    const api = telegramApi();
    const chat = await chatVendedor(c.vendedor_id);
    if (api && chat) await avisarVendedorEnviado(api, chat, c);
  } catch (e) {
    logErro("aviso de envio", c.id, e);
  }
}

export async function avisarVezDoGestor(c: RegistroContrato) {
  try {
    const api = telegramApi();
    const chats = await chatsAdmins();
    if (!api || !chats.length) return;
    for (const chat of chats) await avisarGestorSuaVez(api, [chat], c).catch((e) => logErro("aviso vez do gestor", c.id, e));
  } catch (e) {
    logErro("aviso vez do gestor", c.id, e);
  }
}

/** Assinado ou recusado: avisa o vendedor e os gestores. */
export async function avisarFimDeAssinatura(c: RegistroContrato, tipo: "assinado" | "recusado", quem?: string) {
  try {
    const api = telegramApi();
    if (!api) return;
    const chats = new Set(await chatsAdmins());
    const doVendedor = await chatVendedor(c.vendedor_id);
    if (doVendedor) chats.add(doVendedor);
    for (const chat of Array.from(chats)) {
      await (tipo === "assinado" ? avisarAssinado(api, [chat], c) : avisarRecusado(api, [chat], c, quem))
        .catch((e) => logErro(`aviso de ${tipo}`, c.id, e));
    }
  } catch (e) {
    logErro(`aviso de ${tipo}`, c.id, e);
  }
}

/** Aviso de texto simples aos admins com Telegram (sem dados de cliente). Falha nunca quebra a ação. */
export async function avisarAdminsTexto(texto: string, link?: { rotulo: string; caminho: string }) {
  try {
    const api = telegramApi();
    if (!api) return;
    const url = link ? urlCentral(link.caminho) : null;
    for (const chat of await chatsAdmins()) {
      await api.enviarTexto(chat, texto, link && url ? { rotulo: link.rotulo, url } : undefined).catch((e) => logErro("aviso aos admins", undefined, e));
    }
  } catch (e) {
    logErro("aviso aos admins", undefined, e);
  }
}
