import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { MODELOS } from "../config/modelos";
import { avisarGestorSuaVez, TelegramApi } from "../canais/telegram";
import { lerEventoZapsign, registrarWebhookZapsign, validarSegredoZapsign, type ConfigZapsign } from "../lib/zapsign";
import { MemoriaRepositorio } from "../repositorio/memoria";
import { aprovarContrato, enviarContratoParaAssinatura, gerarContratoParaAprovacao, processarWebhookZapsign } from "../servico";
import { CASOS, receitaExemplo } from "./fixtures";

const internos = { vendedor: { nome: "Luana Teste", email: "luana@ecnc.com.br" }, gestor: { nome: "Edmar", email: "edmar@ecnc.com.br" } };

function zapsignFalso() {
  const chamadas: { url: string; corpo: any; auth: string }[] = [];
  let n = 0;
  const fetchFn: any = async (url: string, init: any) => {
    const corpo = JSON.parse(init.body);
    chamadas.push({ url, corpo, auth: init.headers.Authorization });
    if (url.endsWith("/models/create-doc/"))
      return new Response(JSON.stringify({ token: "DOC1", status: "pending", signers: [{ token: "S0", sign_url: "https://z/S0", name: corpo.signer_name }] }));
    if (url.includes("/add-signer/")) { n++; return new Response(JSON.stringify({ token: `S${n}`, sign_url: `https://z/S${n}` })); }
    return new Response(JSON.stringify({ id: 1 }));
  };
  return { cfg: { token: "TK", ambiente: "sandbox", fetchFn } as ConfigZapsign, chamadas };
}

async function contratoAprovado(dados = CASOS.boleto_40_dias()) {
  const repo = new MemoriaRepositorio(await mkdtemp(join(tmpdir(), "zs-")), "modelos", { 0: 2799 });
  const r = await gerarContratoParaAprovacao({ repo, dados, vendedor: { id: "v-1", nome: "Luana Teste", cpf: "987.654.321-00", email: "vendedor@ecnc.com.br", celular: "(14) 99111-2233" }, receita: receitaExemplo(), data_contrato: "2026-11-17" });
  assert.ok(r.ok);
  if (!r.ok) throw 0;
  await aprovarContrato(repo, r.contrato.id, { id: "edmar", papel: "gestor_comercial" });
  return { repo, id: r.contrato.id };
}

test("envio: sandbox, variáveis aprovadas, pasta por nível e ordem cliente → testemunha → gestor", async () => {
  const modelo = MODELOS.find((m) => m.id === "contrato-fiber")!;
  const original = modelo.zapsign_template_id.sandbox;
  modelo.zapsign_template_id.sandbox = "TPL-FIBER";
  try {
    const { repo, id } = await contratoAprovado();
    const z = zapsignFalso();
    const d = CASOS.boleto_40_dias();
    const { contrato, assinantes } = await enviarContratoParaAssinatura(repo, id, "v-1", z.cfg, internos);
    const criar = z.chamadas[0];
    assert.equal(criar.url, "https://sandbox.api.zapsign.com.br/api/v1/models/create-doc/");
    assert.equal(criar.auth, "Bearer TK");
    assert.equal(criar.corpo.template_id, "TPL-FIBER");
    assert.equal(criar.corpo.external_id, id);
    assert.equal(criar.corpo.signature_order_active, true);
    assert.equal(criar.corpo.folder_path, "/Contratos 2026/ATENÇÃO/");
    const de = Object.fromEntries(criar.corpo.data.map((x: any) => [x.de, x.para]));
    // Variáveis com o nome exato do modelo real do ZapSign
    assert.equal(de["{{FORMA DE PAGAMENTO DA PARCELA (BOLETO, CARTÃOP DE CRÉDITO OU PIX)}}"], "BOLETO — 1ª EM 40 DIAS APÓS A EMISSÃO DA NOTA FISCAL");
    assert.equal(de["{{QUANTIDADE. EX.: 01 (HUM) }}"], "01 (UM)", "chave exata, com o espaço no fim");
    assert.equal(de["{{VALOR DO OPCIONAL 2}}"], "-", "vazio vira '-'");
    assert.equal(de["{{OPCIONAL2}}"], "--");
    assert.equal(de["{{TESTEMUNHA ECNC}}"], "LUANA TESTE");
    assert.equal(Object.keys(de).length, 50);
    assert.ok(Object.values(de).every((v) => String(v).length > 0));
    // garantidor = quem assina pela empresa → não entra duas vezes
    assert.deepEqual(assinantes.map((a) => a.papel), ["cliente", "testemunha_cliente", "testemunha", "contratada"]);
    assert.equal(z.chamadas[1].corpo.email, "ana@metalexemplo.com.br");
    assert.equal(z.chamadas[2].corpo.qualification, "testemunha");
    assert.equal(z.chamadas[3].corpo.email, "edmar@ecnc.com.br");
    assert.equal(contrato.status, "enviado_cliente");
    assert.equal(contrato.zapsign_doc_token, "DOC1");
    await assert.rejects(enviarContratoParaAssinatura(repo, id, "v-1", z.cfg, internos), /já foi enviado/);
    void d;
  } finally {
    modelo.zapsign_template_id.sandbox = original;
  }
});

test("bloqueia sem template_id, sem aprovação ou sem e-mail interno", async () => {
  const { repo, id } = await contratoAprovado();
  const z = zapsignFalso();
  const fiber = MODELOS.find((m) => m.id === "contrato-fiber")!;
  const original = fiber.zapsign_template_id.sandbox;
  fiber.zapsign_template_id.sandbox = "";
  try {
    await assert.rejects(enviarContratoParaAssinatura(repo, id, "v-1", z.cfg, internos), /zapsign_template_id/);
  } finally {
    fiber.zapsign_template_id.sandbox = original;
  }
  const repo2 = new MemoriaRepositorio(await mkdtemp(join(tmpdir(), "zs-")), "modelos");
  const r = await gerarContratoParaAprovacao({ repo: repo2, dados: CASOS.vista_pix(), vendedor: { id: "v", nome: "L", cpf: "987.654.321-00", email: "vendedor@ecnc.com.br", celular: "(14) 99111-2233" }, receita: receitaExemplo() });
  assert.ok(r.ok);
  if (r.ok) await assert.rejects(enviarContratoParaAssinatura(repo2, r.contrato.id, "v", z.cfg, internos), /aprovados/);
  assert.equal(z.chamadas.length, 0);
});

test("webhook: testemunha assinou → vez do gestor; todos → assinado; reenvio ignorado; recusa", async () => {
  const modelo = MODELOS.find((m) => m.id === "contrato-fiber")!;
  const original = modelo.zapsign_template_id.sandbox;
  modelo.zapsign_template_id.sandbox = "TPL";
  try {
    const { repo, id } = await contratoAprovado();
    await enviarContratoParaAssinatura(repo, id, "v-1", zapsignFalso().cfg, internos);
    const base = { token: "DOC1", external_id: id, status: "pending" };
    const cli = await processarWebhookZapsign(repo, { ...base, event_type: "doc_signed", signer_who_signed: { name: "João da Silva", email: "joao@metalexemplo.com.br" } });
    assert.equal(cli.acao, "assinatura");
    const test1 = await processarWebhookZapsign(repo, { ...base, event_type: "doc_signed", signer_who_signed: { name: "Luana", email: "LUANA@ecnc.com.br" } });
    assert.equal(test1.acao, "vez_do_gestor");
    assert.ok(test1.contrato!.zapsign_assinantes![2].assinou_em);

    // aviso no Telegram com link de assinatura do gestor
    const env: any[] = [];
    const api = new TelegramApi("T", (async (_u: string, i: any) => { env.push(JSON.parse(i.body)); return new Response('{"ok":true}'); }) as any);
    await avisarGestorSuaVez(api, [1], test1.contrato!);
    assert.match(env[0].text, /✍️ Sua vez de assinar/);
    assert.match(env[0].text, /PONTOS DE ATENÇÃO/);
    assert.equal(env[0].reply_markup.inline_keyboard[0][0].url, "https://z/S3");

    const fim = await processarWebhookZapsign(repo, { ...base, status: "signed", event_type: "doc_signed", signer_who_signed: { email: "edmar@ecnc.com.br" } });
    assert.equal(fim.acao, "assinado");
    assert.equal(fim.contrato!.status, "assinado");
    assert.equal((await processarWebhookZapsign(repo, { ...base, status: "signed", event_type: "doc_signed" })).acao, "ignorado");
    assert.equal((await processarWebhookZapsign(repo, { ...base, event_type: "doc_refused" })).acao, "recusado");
    assert.equal((await processarWebhookZapsign(repo, { ...base, token: "OUTRO", event_type: "doc_signed" })).acao, "ignorado");
    assert.equal((await processarWebhookZapsign(repo, { event_type: "evento_novo" })).acao, "ignorado");
  } finally {
    modelo.zapsign_template_id.sandbox = original;
  }
});

test("registro do webhook e segredo", async () => {
  const z = zapsignFalso();
  z.cfg.ambiente = "producao";
  await registrarWebhookZapsign(z.cfg, "https://central/api/zapsign/webhook", "SEGREDO");
  assert.equal(z.chamadas[0].url, "https://api.zapsign.com.br/api/v1/user/company/webhook/");
  assert.deepEqual(z.chamadas[0].corpo.headers, [{ name: "Authorization", value: "Bearer SEGREDO" }]);
  assert.ok(validarSegredoZapsign("Bearer SEGREDO", "SEGREDO"));
  assert.ok(!validarSegredoZapsign("Bearer TK", "SEGREDO"));
  assert.ok(lerEventoZapsign({ signers: [{ status: "signed" }, { status: "signed" }] }).todos_assinaram);
  assert.ok(!lerEventoZapsign({ status: "pending", signers: [{ status: "signed" }, { status: "new" }] }).todos_assinaram);
});

test("avalista diferente de quem assina entra como garantidor", async () => {
  const modelo = MODELOS.find((m) => m.id === "contrato-co2")!;
  const original = modelo.zapsign_template_id.sandbox;
  modelo.zapsign_template_id.sandbox = "TPL";
  try {
    const d = CASOS.vista_pix();
    d.garantidor = { ...d.garantidor, nome: "Carlos Avalista", cpf: "390.533.447-05", email: "carlos@x.com.br" };
    const { repo, id } = await contratoAprovado(d);
    const { assinantes } = await enviarContratoParaAssinatura(repo, id, "v-1", zapsignFalso().cfg, internos);
    assert.deepEqual(assinantes.map((a) => a.papel), ["cliente", "garantidor", "testemunha_cliente", "testemunha", "contratada"]);
  } finally {
    modelo.zapsign_template_id.sandbox = original;
  }
});

test("IDs reais do sandbox configurados nos dois modelos", () => {
  assert.equal(MODELOS.find((m) => m.id === "contrato-co2")!.zapsign_template_id.sandbox, "bdbc19d9-769a-42d2-8c7e-485758f941c4");
  assert.equal(MODELOS.find((m) => m.id === "contrato-fiber")!.zapsign_template_id.sandbox, "3d996002-faf9-44cc-a12a-42433955baea");
});
