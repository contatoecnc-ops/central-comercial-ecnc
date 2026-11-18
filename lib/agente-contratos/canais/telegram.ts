/**
 * Canal Telegram — o vendedor conversa com o agente por um bot.
 * A aprovação continua na Central; o bot só conversa e avisa.
 *
 * Fluxo na Central (Next.js na Vercel):
 *   POST /api/telegram/webhook
 *     1. validarSegredoTelegram(header "x-telegram-bot-api-secret-token")
 *     2. responde 200 NA HORA e processa depois (after() do next/server),
 *        porque o agente pode levar 10–30 s e o Telegram reenvia se demorar
 *     3. processarAtualizacaoTelegram(...)
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { AgenteContratos } from "../agente/agente";
import type { Canal, ConversasRepo } from "../conversas/tipos";
import { NIVEIS } from "../config/condicoes-pagamento";
import { formatarMoeda } from "../lib/formatacao";
import type { RegistroContrato } from "../repositorio/tipos";
import type { Vendedor } from "../servico";

const CANAL: Canal = "telegram";
const LIMITE_TEXTO = 4000; // Telegram aceita 4096
const TRAVA_SEGUNDOS = 120;

export class TelegramApi {
  private base: string;
  constructor(token: string, private fetchFn: typeof fetch = fetch) {
    this.base = `https://api.telegram.org/bot${token}`;
  }

  private async chamar(metodo: string, corpo: Record<string, unknown> | FormData) {
    const r = await this.fetchFn(`${this.base}/${metodo}`, corpo instanceof FormData
      ? { method: "POST", body: corpo }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(`Telegram ${metodo}: ${j.description ?? r.status}`);
    return j.result;
  }

  /** Texto simples (sem Markdown, para não quebrar com caracteres especiais). Divide mensagens longas. */
  async enviarTexto(chat_id: number | string, texto: string, link?: { rotulo: string; url: string }) {
    const partes = dividirTexto(texto || "(sem resposta)");
    for (let i = 0; i < partes.length; i++) {
      const ultimo = i === partes.length - 1;
      await this.chamar("sendMessage", {
        chat_id,
        text: partes[i],
        ...(ultimo && link ? { reply_markup: { inline_keyboard: [[{ text: link.rotulo, url: link.url }]] } } : {}),
      });
    }
  }

  async enviarDocumento(chat_id: number | string, arquivo: Buffer, nome: string, legenda?: string) {
    const fd = new FormData();
    fd.append("chat_id", String(chat_id));
    fd.append("document", new Blob([new Uint8Array(arquivo)]), nome);
    if (legenda) fd.append("caption", legenda.slice(0, 1000));
    await this.chamar("sendDocument", fd);
  }

  async digitando(chat_id: number | string) {
    await this.chamar("sendChatAction", { chat_id, action: "typing" }).catch(() => {});
  }

  /** Rodar uma vez, depois do deploy. */
  async configurarWebhook(url: string, segredo: string) {
    return this.chamar("setWebhook", { url, secret_token: segredo, allowed_updates: ["message"], drop_pending_updates: true });
  }
}

export function dividirTexto(t: string, limite = LIMITE_TEXTO): string[] {
  const out: string[] = [];
  let resto = t;
  while (resto.length > limite) {
    let corte = resto.lastIndexOf("\n", limite);
    if (corte < limite / 2) corte = limite;
    out.push(resto.slice(0, corte));
    resto = resto.slice(corte).replace(/^\n/, "");
  }
  out.push(resto);
  return out;
}

/** Comparação em tempo constante (hash de mesmo tamanho dos dois lados). */
export const validarSegredoTelegram = (recebido: string | null | undefined, esperado: string) => {
  if (!esperado || !recebido) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
};

export interface ProcessarTelegram {
  update: any;
  api: TelegramApi;
  agente: AgenteContratos;
  conversas: ConversasRepo;
  /** Procura o vendedor pelo ID do Telegram cadastrado no perfil. null = não cadastrado. */
  buscarVendedor: (telegram_user_id: string) => Promise<Vendedor | null>;
  /** Chamado quando um contrato é gerado (ex.: avisar o gestor). */
  aoGerarContrato?: (contrato: { id: string; numero: string }, vendedor: Vendedor) => Promise<void>;
}

export const MENSAGENS = {
  naoCadastrado: (id: string) =>
    `Olá! Este é o assistente de contratos da ECNC.\n\nSeu ID do Telegram é ${id}. Peça ao gestor comercial para cadastrá-lo no seu perfil da Central e mande /start de novo.`,
  boasVindas: (nome: string) =>
    `Olá, ${nome}! Me mande os dados da venda do jeito que tiver (cliente, máquina, valores, pagamento) e eu monto o contrato.\n\nComandos:\n/novo — começar outro contrato\n/id — ver seu ID do Telegram`,
  novo: "Pronto. Pode começar um novo contrato — me mande os dados da venda.",
  ocupado: "Ainda estou processando sua mensagem anterior. Aguarde a resposta e mande de novo.",
  soTexto: "Por enquanto só consigo ler texto. Digite ou cole os dados da venda.",
  erro: "Tive um problema para processar sua mensagem. Tente de novo em instantes. Se continuar, avise o gestor.",
};

/** Processa uma atualização do webhook. Nunca lança erro para o vendedor sem avisar. */
export async function processarAtualizacaoTelegram(p: ProcessarTelegram): Promise<void> {
  const msg = p.update?.message;
  if (!msg?.chat || msg.chat.type !== "private" || !msg.from) return; // só conversa privada
  const chat = msg.chat.id;
  const tgId = String(msg.from.id);

  if (p.update.update_id !== undefined && !(await p.conversas.registrarAtualizacao(CANAL, String(p.update.update_id)))) return;

  const texto: string = (msg.text ?? "").trim();
  if (texto === "/id") return void (await p.api.enviarTexto(chat, `Seu ID do Telegram é ${tgId}.`));

  const vendedor = await p.buscarVendedor(tgId);
  if (!vendedor) return void (await p.api.enviarTexto(chat, MENSAGENS.naoCadastrado(tgId)));

  if (texto === "/start") return void (await p.api.enviarTexto(chat, MENSAGENS.boasVindas(vendedor.nome.split(" ")[0])));
  if (!texto) return void (await p.api.enviarTexto(chat, MENSAGENS.soTexto));

  const conversa = await p.conversas.abrirOuCriar(vendedor.id, CANAL);
  if (texto === "/novo") {
    await p.conversas.encerrar(conversa.id);
    return void (await p.api.enviarTexto(chat, MENSAGENS.novo));
  }

  if (!(await p.conversas.travar(conversa.id, TRAVA_SEGUNDOS))) return void (await p.api.enviarTexto(chat, MENSAGENS.ocupado));
  try {
    await p.api.digitando(chat);
    const r = await p.agente.responder({ vendedor, mensagem: texto, historico: conversa.mensagens, estado: conversa.estado });
    conversa.mensagens = r.mensagens;
    conversa.estado = r.estado;
    if (r.contrato_gerado) conversa.contrato_id = r.contrato_gerado.id;
    await p.conversas.salvar(conversa);
    await p.api.enviarTexto(chat, r.texto);
    if (r.contrato_gerado && p.aoGerarContrato) await p.aoGerarContrato(r.contrato_gerado, vendedor).catch(() => {});
  } catch (e) {
    await p.api.enviarTexto(chat, MENSAGENS.erro).catch(() => {});
    throw e;
  } finally {
    await p.conversas.destravar(conversa.id);
  }
}

// ---------------------------------------------------------------- Avisos

const linhaContrato = (c: RegistroContrato) =>
  `Contrato ${c.numero} — ${c.cliente_razao_social}\n${formatarMoeda(c.valor_total_centavos)} · ${c.variaveis.IV11_FORMA_PAGAMENTO ?? c.condicao_pagamento}`;

/**
 * Pontos de atenção do contrato, sem repetição e sem os avisos genéricos da
 * condição (que valem para todo contrato) nem os de configuração de exemplo.
 */
export function pontosDeAtencao(c: RegistroContrato): string[] {
  const genericos = (a: string) => a.startsWith("Atenção (") || a.startsWith("Atenção do gestor:") || a.includes("EXEMPLO");
  const lista = [...c.motivos_nivel, ...c.alertas.filter((a) => !genericos(a))];
  const pend = c.documentos.filter((d) => !d.recebido).map((d) => d.nome);
  if (pend.length) lista.push(`Documentos pendentes: ${pend.join("; ")}`);
  return [...new Set(lista)];
}

/** Resumo do que foi preenchido, no formato do quadro IV, para conferir pelo celular. */
export function resumoParaGestor(c: RegistroContrato): string {
  const v = c.variaveis;
  const d = c.dados;
  const nivel = NIVEIS[c.nivel_aprovacao];
  const marca = c.nivel_aprovacao === 3 ? "🔴" : c.nivel_aprovacao === 2 ? "🟡" : "⚪";
  const pontos = pontosDeAtencao(c);
  const linha = (rotulo: string, valor?: string) => (valor && valor !== "--" ? `${rotulo}: ${valor}` : null);
  const bloco = (titulo: string, linhas: (string | null)[]) => {
    const l = linhas.filter(Boolean) as string[];
    return l.length ? ["", titulo, ...l] : [];
  };
  return [
    `${marca} Contrato ${c.numero} para aprovar — ${nivel.nome}`,
    `Vendedor: ${c.vendedor_nome}`,
    ...(pontos.length ? ["", "⚠️ PONTOS DE ATENÇÃO", ...pontos.map((p) => `• ${p}`)] : ["", "✓ Sem pontos de atenção."]),
    ...bloco("CLIENTE", [
      `${v.CONTRATANTE_RAZAO_SOCIAL} (${d.contratante.tipo_pessoa})`,
      v.CONTRATANTE_CPF_CNPJ,
      v.CONTRATANTE_ENDERECO,
      linha("Assina", d.signatarios.map((s) => `${s.nome} (${s.cargo})`).join(", ")),
    ]),
    ...bloco("EQUIPAMENTO", [
      `${v.EQUIPAMENTO_MODELO} — ${v.IV3_PRECO_AQUISICAO}`,
      ...(d.acessorios.length ? v.IV4_ACESSORIOS.split("\n").map((a) => `+ ${a}`) : []),
    ]),
    ...bloco("VALORES E PAGAMENTO", [
      linha("Total (IV.5)", v.IV5_PRECO_TOTAL),
      linha("Entrada (IV.6)", v.IV6_VALOR_ENTRADA.replace(/\n/g, "\n   ")),
      linha("Forma (IV.11)", v.IV11_FORMA_PAGAMENTO),
      linha("Parcelas (IV.12 × IV.10)", v.IV12_QTD_PRESTACOES !== "--" ? (v.IV10_VALOR_PARCELA.startsWith("1ª") ? `${v.IV12_QTD_PRESTACOES} (${v.IV10_VALOR_PARCELA})` : `${v.IV12_QTD_PRESTACOES} de ${v.IV10_VALOR_PARCELA}`) : undefined),
      linha("Condição", v.CONDICAO_PAGAMENTO),
    ]),
    ...bloco("ENTREGA", [
      linha("Prazo (IV.7)", v.IV7_PRAZO_ENTREGA),
      `Frete: ${v.RESPONSAVEL_FRETE} · Instalação: ${v.RESPONSAVEL_INSTALACAO}`,
      d.endereco_entrega ? linha("Local", v.ENDERECO_ENTREGA) : null,
    ]),
  ].join("\n");
}

/** Para o gestor: contrato novo esperando aprovação — resumo completo + pontos de atenção, e opcionalmente o .docx. */
export async function avisarGestorNovoContrato(
  api: TelegramApi,
  chat_ids: (number | string)[],
  c: RegistroContrato,
  urlCentral: string,
  anexo?: { arquivo: Buffer; nome: string },
) {
  const texto = resumoParaGestor(c);
  for (const id of chat_ids) {
    await api.enviarTexto(id, texto, { rotulo: "Aprovar ou reprovar na Central", url: urlCentral });
    if (anexo) await api.enviarDocumento(id, anexo.arquivo, anexo.nome);
  }
}

/** Para o vendedor: aprovado, com o .docx para subir no ZapSign. */
export async function avisarVendedorAprovado(api: TelegramApi, chat_id: number | string, c: RegistroContrato, arquivo: Buffer, nomeArquivo: string) {
  await api.enviarTexto(chat_id, `✅ Aprovado!\n${linhaContrato(c)}\n\nSegue o contrato para enviar ao cliente. Depois de enviar, marque "Com o cliente" na Central.`);
  await api.enviarDocumento(chat_id, arquivo, nomeArquivo);
}

/**
 * Para o vendedor: reprovado. Já deixa a conversa do Telegram pronta para a
 * correção — ele só responde o que mudar e o agente mantém o mesmo número.
 */
export async function avisarVendedorReprovado(api: TelegramApi, chat_id: number | string, c: RegistroContrato, conversas: ConversasRepo) {
  const aberta = await conversas.abrirOuCriar(c.vendedor_id, CANAL);
  let conversa = aberta;
  if (aberta.contrato_id !== c.id && aberta.mensagens.length) {
    await conversas.encerrar(aberta.id);
    conversa = await conversas.abrirOuCriar(c.vendedor_id, CANAL);
  }
  conversa.contrato_id = c.id;
  conversa.mensagens = [
    ...conversa.mensagens,
    {
      role: "user",
      content: `[Aviso do sistema] O contrato ${c.numero} (contrato_id ${c.id}) foi REPROVADO pelo gestor. Motivo: ${c.motivo_reprovacao}. Dados atuais do contrato: ${JSON.stringify(c.dados)}. Ao gerar a correção, use este contrato_id para manter o número.`,
    },
    { role: "assistant", content: `Contrato ${c.numero} reprovado. Motivo: ${c.motivo_reprovacao}. O que precisa ser corrigido?` },
  ];
  await conversas.salvar(conversa);
  await api.enviarTexto(chat_id, `❌ Reprovado\n${linhaContrato(c)}\n\nMotivo: ${c.motivo_reprovacao}\n\nMe diga aqui o que corrigir que eu refaço com o mesmo número.`);
}

// ---------------------------------------------------------------- Avisos do ZapSign

/** Vendedor: contrato criado no ZapSign, com os links na ordem. */
export async function avisarVendedorEnviado(api: TelegramApi, chat_id: number | string, c: RegistroContrato) {
  const ordem = (c.zapsign_assinantes ?? []).map((a, i) => `${i + 1}. ${a.nome} (${a.papel})`).join("\n");
  await api.enviarTexto(chat_id, `📨 Enviado para assinatura\n${linhaContrato(c)}\n\nO ZapSign mandou o link por e-mail, nesta ordem:\n${ordem}\n\nAcompanhe e cobre o cliente se precisar. Você assina como testemunha quando chegar sua vez.`);
}

/**
 * Gestor: o vendedor assinou como testemunha — é a vez dele. Repete o resumo
 * com os pontos de atenção para conferir antes de assinar.
 */
export async function avisarGestorSuaVez(api: TelegramApi, chat_ids: (number | string)[], c: RegistroContrato) {
  const link = (c.zapsign_assinantes ?? []).find((a) => a.papel === "contratada")?.url;
  const texto = `✍️ Sua vez de assinar\n\n${resumoParaGestor(c).replace(/^.*para aprovar — /, `Contrato ${c.numero} — `)}`;
  for (const id of chat_ids) await api.enviarTexto(id, texto, link ? { rotulo: "Assinar no ZapSign", url: link } : undefined);
}

export async function avisarAssinado(api: TelegramApi, chat_ids: (number | string)[], c: RegistroContrato) {
  for (const id of chat_ids) await api.enviarTexto(id, `🎉 Contrato assinado por todos\n${linhaContrato(c)}`);
}

export async function avisarRecusado(api: TelegramApi, chat_ids: (number | string)[], c: RegistroContrato, quem?: string) {
  for (const id of chat_ids) await api.enviarTexto(id, `⛔ Assinatura RECUSADA${quem ? ` por ${quem}` : ""}\n${linhaContrato(c)}\n\nVerifique com o cliente.`);
}
