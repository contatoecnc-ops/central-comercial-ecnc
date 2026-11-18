import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AgenteContratos } from "../agente/agente";
import {
  avisarGestorNovoContrato, avisarVendedorAprovado, avisarVendedorReprovado, dividirTexto,
  processarAtualizacaoTelegram, TelegramApi, validarSegredoTelegram,
} from "../canais/telegram";
import { MemoriaConversas } from "../conversas/memoria";
import { MemoriaRepositorio } from "../repositorio/memoria";
import { gerarContratoParaAprovacao, reprovarContrato } from "../servico";
import { CASOS, receitaExemplo } from "./fixtures";

const vendedor = { id: "v-1", nome: "Luana Teste", cpf: "987.654.321-00", email: "vendedor@ecnc.com.br", celular: "(14) 99111-2233" };

/** fetch falso que registra o que seria enviado ao Telegram. */
function telegramFalso() {
  const enviados: { metodo: string; corpo: any }[] = [];
  const fetchFn: any = async (url: string, init: any) => {
    const metodo = url.split("/").pop()!;
    const corpo = init.body instanceof FormData ? Object.fromEntries(init.body.entries()) : JSON.parse(init.body);
    enviados.push({ metodo, corpo });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  };
  return { api: new TelegramApi("TOKEN", fetchFn), enviados, textos: () => enviados.filter((e) => e.metodo === "sendMessage").map((e) => e.corpo.text) };
}

function agenteFalso(repo: MemoriaRepositorio, roteiro: any[]) {
  const pedidos: any[] = [];
  const anthropic: any = { messages: { create: async (req: any) => { pedidos.push(structuredClone(req)); return roteiro.shift(); } } };
  return { agente: new AgenteContratos({ repo, anthropic, consultarCnpj: async () => receitaExemplo() }), pedidos };
}

const upd = (id: number, text: string, from = 555, tipo = "private") => ({ update_id: id, message: { chat: { id: from, type: tipo }, from: { id: from }, text } });

test("vendedor não cadastrado recebe o ID; grupos são ignorados; /id funciona", async () => {
  const tg = telegramFalso();
  const repo = new MemoriaRepositorio(await mkdtemp(join(tmpdir(), "tg-")), "modelos");
  const { agente } = agenteFalso(repo, []);
  const base = { api: tg.api, agente, conversas: new MemoriaConversas(), buscarVendedor: async () => null };
  await processarAtualizacaoTelegram({ ...base, update: upd(1, "oi") });
  await processarAtualizacaoTelegram({ ...base, update: upd(2, "oi", 555, "group") });
  await processarAtualizacaoTelegram({ ...base, update: upd(3, "/id") });
  assert.equal(tg.textos().length, 2);
  assert.match(tg.textos()[0], /Seu ID do Telegram é 555/);
  assert.match(tg.textos()[1], /Seu ID do Telegram é 555/);
});

test("conversa: agente responde, gera contrato, guarda histórico e avisa o gestor", async () => {
  const tg = telegramFalso();
  const repo = new MemoriaRepositorio(await mkdtemp(join(tmpdir(), "tg-")), "modelos", { 0: 2799 });
  const { agente, pedidos } = agenteFalso(repo, [
    { stop_reason: "end_turn", content: [{ type: "text", text: "Me manda o CNPJ." }] },
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "gerar_contrato_para_aprovacao", input: { dados: CASOS.vista_pix(), confirmado_pelo_vendedor: true } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Contrato gerado e enviado para aprovação." }] },
  ]);
  const conversas = new MemoriaConversas();
  const gerados: string[] = [];
  const base = {
    api: tg.api, agente, conversas,
    buscarVendedor: async (id: string) => (id === "555" ? vendedor : null),
    aoGerarContrato: async (c: { numero: string }) => void gerados.push(c.numero),
  };
  await processarAtualizacaoTelegram({ ...base, update: upd(10, "Vendi uma CO2 à vista") });
  await processarAtualizacaoTelegram({ ...base, update: upd(10, "Vendi uma CO2 à vista") }); // reenvio do Telegram: ignorado
  await processarAtualizacaoTelegram({ ...base, update: upd(11, "confirmo") });
  assert.deepEqual(tg.textos(), ["Me manda o CNPJ.", "Contrato gerado e enviado para aprovação."]);
  assert.equal(gerados.length, 1);
  // a 2ª mensagem levou o histórico da 1ª
  assert.equal(pedidos[1].messages[0].content, "Vendi uma CO2 à vista");
  const [c] = [...conversas.conversas.values()];
  assert.ok(c.contrato_id);
  assert.equal(c.canal, "telegram");
});

test("/novo encerra a conversa; mensagem durante processamento recebe aviso", async () => {
  const tg = telegramFalso();
  const repo = new MemoriaRepositorio(await mkdtemp(join(tmpdir(), "tg-")), "modelos");
  const { agente } = agenteFalso(repo, []);
  const conversas = new MemoriaConversas();
  const base = { api: tg.api, agente, conversas, buscarVendedor: async () => vendedor };
  const c = await conversas.abrirOuCriar("v-1", "telegram");
  await conversas.travar(c.id, 60);
  await processarAtualizacaoTelegram({ ...base, update: upd(20, "mais um dado") });
  assert.match(tg.textos()[0], /Ainda estou processando/);
  await conversas.destravar(c.id);
  await processarAtualizacaoTelegram({ ...base, update: upd(21, "/novo") });
  assert.ok(conversas.conversas.get(c.id)!.encerrada);
});

test("avisos: gestor (com botão), aprovado (com .docx), reprovado (prepara correção)", async () => {
  const tg = telegramFalso();
  const repo = new MemoriaRepositorio(await mkdtemp(join(tmpdir(), "tg-")), "modelos", { 0: 2799 });
  const r = await gerarContratoParaAprovacao({ repo, dados: CASOS.boleto_40_dias(), vendedor, receita: receitaExemplo(), data_contrato: "2026-11-16" });
  assert.ok(r.ok);
  if (!r.ok) return;
  await avisarGestorNovoContrato(tg.api, [999], r.contrato, "https://central/contratos/x", { arquivo: Buffer.from("x"), nome: "c.docx" });
  const g = tg.enviados[0].corpo;
  assert.match(g.text, /🟡 Contrato 2800-26 para aprovar — Atenção/);
  assert.match(g.text, /⚠️ PONTOS DE ATENÇÃO\n• 1º boleto com mais de 30 dias/);
  assert.match(g.text, /METALÚRGICA EXEMPLO LTDA \(PJ\)/);
  assert.match(g.text, /\+ EIXO ROTATIVO MARKING NORMAL — R\$ 2\.000,00/);
  assert.match(g.text, /Entrada \(IV\.6\): R\$ 10\.000,00 VIA PIX NA ASSINATURA/);
  assert.match(g.text, /Parcelas \(IV\.12 × IV\.10\): 1X de R\$ 10\.500,00/);
  assert.match(g.text, /Prazo \(IV\.7\): PRONTA ENTREGA/);
  assert.ok(!/ainda é EXEMPLO|Atenção \(/.test(g.text), "sem avisos genéricos");
  assert.equal(g.reply_markup.inline_keyboard[0][0].url, "https://central/contratos/x");
  assert.equal(tg.enviados[1].metodo, "sendDocument");
  tg.enviados.length = 0;

  await avisarVendedorAprovado(tg.api, 555, r.contrato, Buffer.from("docx"), "contrato.docx");
  assert.equal(tg.enviados.at(-1)!.metodo, "sendDocument");

  const conversas = new MemoriaConversas();
  const reprovado = await reprovarContrato(repo, r.contrato.id, { id: "edmar", papel: "gestor_comercial" }, "Prazo de entrega errado");
  await avisarVendedorReprovado(tg.api, 555, reprovado, conversas);
  assert.match(tg.textos().at(-1)!, /Motivo: Prazo de entrega errado/);
  const [c] = [...conversas.conversas.values()];
  assert.equal(c.contrato_id, r.contrato.id);
  assert.match(String(c.mensagens[0].content), new RegExp(`contrato_id ${r.contrato.id}`));
});

test("utilitários", () => {
  assert.ok(validarSegredoTelegram("abc", "abc"));
  assert.ok(!validarSegredoTelegram("abc", ""));
  assert.ok(!validarSegredoTelegram(undefined, "abc"));
  const partes = dividirTexto("a\n".repeat(5000));
  assert.ok(partes.length > 1 && partes.every((p) => p.length <= 4000));
});
