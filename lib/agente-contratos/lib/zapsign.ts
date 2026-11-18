/**
 * ZapSign — envio para assinatura a partir dos modelos dinâmicos + webhook.
 * Conferido com a documentação oficial (docs.zapsign.com.br) em 17/11/2026.
 *
 * Para ligar:
 *  1. Token: ZapSign > Configurações > Integrações > API ZapSign (sandbox e produção têm tokens diferentes).
 *  2. Subir no ZapSign os 4 .docx de modelos/ como "Modelo dinâmico" (Modelos > Novo modelo > Modelo dinâmico)
 *     e copiar o ID de cada um para src/config/modelos.ts (zapsign_template_id).
 *  3. Variáveis de ambiente:
 *       ZAPSIGN_ATIVO=true
 *       ZAPSIGN_AMBIENTE=sandbox | producao      (comece em sandbox: sem validade jurídica e sem custo)
 *       ZAPSIGN_API_TOKEN=...                     (o token do ambiente escolhido)
 *       ZAPSIGN_WEBHOOK_SECRET=...                (string aleatória; NÃO é o token da API)
 *  4. Registrar o webhook uma vez: registrarWebhookZapsign(url, segredo).
 *
 * Ordem de assinatura (signature_order_active): lado do cliente (comprador, demais
 * signatários, garantidor solidário, testemunha do cliente) → vendedor (testemunha
 * ECNC) → gestor comercial (VENDEDORA, por último), como já é feito hoje.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { MODELOS } from "../config/modelos";
import { somenteDigitos } from "./documentos";
import { hojeBrasilia } from "./formatacao";
import { dadosZapsign } from "./gerador-docx";
import type { RegistroContrato } from "../repositorio/tipos";

const BASES = {
  producao: "https://api.zapsign.com.br/api/v1",
  sandbox: "https://sandbox.api.zapsign.com.br/api/v1",
};

export interface ConfigZapsign {
  token: string;
  ambiente: "sandbox" | "producao";
  fetchFn?: typeof fetch;
}

export const zapsignAtivo = () => process.env.ZAPSIGN_ATIVO === "true";

export function configZapsignDoAmbiente(): ConfigZapsign {
  const token = process.env.ZAPSIGN_API_TOKEN;
  if (!token) throw new Error("Falta ZAPSIGN_API_TOKEN.");
  const ambiente = process.env.ZAPSIGN_AMBIENTE === "producao" ? "producao" : "sandbox";
  return { token, ambiente };
}

async function chamar(cfg: ConfigZapsign, caminho: string, corpo: unknown) {
  const f = cfg.fetchFn ?? fetch;
  const r = await f(`${BASES[cfg.ambiente]}${caminho}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`ZapSign ${caminho} recusou (${r.status}): ${texto.slice(0, 500)}`);
  return texto ? JSON.parse(texto) : {};
}

export type PapelAssinatura = "cliente" | "garantidor" | "testemunha_cliente" | "testemunha" | "contratada";
export interface Assinante { nome: string; email: string; papel: PapelAssinatura; url: string; token: string }

export interface PessoaInterna { nome: string; email: string }

/** Pasta no ZapSign pelo nível — é o que o gestor vê na lista ao assinar. */
export function pastaPorNivel(c: RegistroContrato): string {
  const ano = hojeBrasilia().slice(0, 4);
  const nome = c.nivel_aprovacao === 3 ? "ATENÇÃO MÁXIMA" : c.nivel_aprovacao === 2 ? "ATENÇÃO" : "Padrão";
  return `/Contratos ${ano}/${nome}/`;
}

/**
 * Cria o documento no ZapSign a partir do modelo dinâmico e adiciona os
 * signatários na ordem. As variáveis enviadas são exatamente as que o gestor aprovou.
 */
export async function enviarParaAssinatura(
  cfg: ConfigZapsign,
  contrato: RegistroContrato,
  internos: { vendedor: PessoaInterna; gestor: PessoaInterna },
): Promise<{ doc_token: string; assinantes: Assinante[] }> {
  if (contrato.status !== "aprovado") throw new Error("Só contratos aprovados podem ir para assinatura.");
  const modelo = MODELOS.find((m) => m.id === contrato.modelo_id);
  const template_id = modelo?.zapsign_template_id[cfg.ambiente];
  if (!template_id) throw new Error(`Modelo "${contrato.modelo_id}" ainda não tem zapsign_template_id (${cfg.ambiente}) em config/modelos.ts.`);
  for (const p of [internos.vendedor, internos.gestor])
    if (!p.nome || !p.email) throw new Error("Vendedor e gestor precisam de nome e e-mail cadastrados na Central.");

  const [primeiro, ...outros] = contrato.dados.signatarios;
  const doc = await chamar(cfg, "/models/create-doc/", {
    template_id,
    external_id: contrato.id,
    signer_name: primeiro.nome,
    signer_email: primeiro.email,
    // Variáveis exatamente como estão no modelo do ZapSign; vazio sai como "-".
    data: dadosZapsign(contrato.variaveis, modelo?.mapa),
    lang: "pt-br",
    folder_path: pastaPorNivel(contrato),
    send_automatic_email: true,
    signature_order_active: true,
    brand_name: "ECNC",
    metadata: [
      { key: "contrato_numero", value: contrato.numero },
      { key: "nivel_atencao", value: String(contrato.nivel_aprovacao) },
    ],
  });
  if (!doc?.token) throw new Error("ZapSign não devolveu o token do documento.");

  const s0 = (doc.signers ?? [])[0] ?? {};
  const assinantes: Assinante[] = [{ nome: primeiro.nome, email: primeiro.email, papel: "cliente", url: s0.sign_url, token: s0.token }];

  const adicionar = async (nome: string, email: string, papel: PapelAssinatura, qualification?: string) => {
    const s = await chamar(cfg, `/docs/${doc.token}/add-signer/`, {
      name: nome, email, send_automatic_email: true, lock_name: true, lock_email: true,
      ...(qualification ? { qualification } : {}),
    });
    assinantes.push({ nome, email, papel, url: s.sign_url, token: s.token });
  };
  const jaAssina = new Set(contrato.dados.signatarios.map((s) => somenteDigitos(s.cpf)));
  for (const s of outros) await adicionar(s.nome, s.email, "cliente");
  const g = contrato.dados.garantidor;
  if (g && !jaAssina.has(somenteDigitos(g.cpf))) await adicionar(g.nome, g.email, "garantidor", "Garantidor(a) solidário(a)");
  const t = contrato.dados.testemunha_cliente;
  if (t) await adicionar(t.nome, t.email, "testemunha_cliente", "testemunha");
  await adicionar(internos.vendedor.nome, internos.vendedor.email, "testemunha", "testemunha");
  await adicionar(internos.gestor.nome, internos.gestor.email, "contratada", "Representante da CONTRATADA");

  return { doc_token: doc.token, assinantes };
}

/** Registra o webhook (uma vez, pela tela de admin). Todos os eventos; o receptor valida o segredo. */
export async function registrarWebhookZapsign(cfg: ConfigZapsign, url: string, segredo: string) {
  return chamar(cfg, "/user/company/webhook/", {
    url,
    type: "",
    headers: [{ name: "Authorization", value: `Bearer ${segredo}` }],
  });
}

/** Comparação em tempo constante (hash de mesmo tamanho dos dois lados). */
export const validarSegredoZapsign = (authorization: string | null | undefined, segredo: string) => {
  if (!segredo || !authorization) return false;
  const a = createHash("sha256").update(authorization).digest();
  const b = createHash("sha256").update(`Bearer ${segredo}`).digest();
  return timingSafeEqual(a, b);
};

/** Leitura do webhook — robusta a campos ausentes e eventos novos. */
export interface EventoZapsign {
  tipo: string; // doc_signed, doc_refused, doc_created, doc_deleted, email_bounce, ... (outros são ignorados)
  doc_token?: string;
  contrato_id?: string; // external_id
  quem_assinou?: { nome?: string; email?: string };
  todos_assinaram: boolean;
}

export function lerEventoZapsign(payload: any): EventoZapsign {
  const signers: any[] = Array.isArray(payload?.signers) ? payload.signers : [];
  const assinou = (s: any) => ["signed", "assinou", "assinado"].includes(String(s?.status ?? "").toLowerCase());
  const statusDoc = String(payload?.status ?? "").toLowerCase();
  return {
    tipo: String(payload?.event_type ?? ""),
    doc_token: payload?.token,
    contrato_id: payload?.external_id || undefined,
    quem_assinou: payload?.signer_who_signed
      ? { nome: payload.signer_who_signed.name, email: payload.signer_who_signed.email }
      : undefined,
    todos_assinaram: ["signed", "assinado"].includes(statusDoc) || (signers.length > 0 && signers.every(assinou)),
  };
}
