import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import PizZip from "pizzip";
import { AgenteContratos } from "../agente/agente";
import { executarFerramenta, type EstadoAgente } from "../agente/ferramentas";
import { MemoriaRepositorio } from "../repositorio/memoria";
import { APROVACAO } from "../config/empresa";
import { aprovarContrato, cancelarContrato, gerarContratoParaAprovacao, marcarAssinado, marcarDocumento, marcarEnviado, reprovarContrato } from "../servico";
import { CASOS, casoPF, receitaExemplo } from "./fixtures";

const HOJE = "2026-11-12";
const vendedor = { id: "v-1", nome: "Vendedor Teste", cpf: "987.654.321-00", email: "vendedor@ecnc.com.br", celular: "(14) 99111-2233" };
const gestor = { id: "edmar", papel: "gestor_comercial" };
const outro = { id: "x", papel: "marketing" };
const novoRepo = async (ultimo = 2799) =>
  new MemoriaRepositorio(await mkdtemp(join(tmpdir(), "contratos-")), "modelos", { 0: ultimo });
const textoDocx = (buf: Buffer) =>
  new PizZip(buf).file("word/document.xml")!.asText().replace(/<\/w:p>/g, "\n").replace(/<w:br\/>/g, "\n").replace(/<[^>]+>/g, "");
const gerar = (repo: MemoriaRepositorio, dados = CASOS.cartao_2_cartoes(), extra = {}) =>
  gerarContratoParaAprovacao({ repo, dados, vendedor, receita: receitaExemplo(), data_contrato: HOJE, ...extra });

test("gera .docx do cartão com quadro correto e número sequencial", async () => {
  const repo = await novoRepo();
  const r = await gerar(repo);
  assert.ok(r.ok, !r.ok ? r.erros.join("; ") : "");
  if (!r.ok) return;
  assert.equal(r.contrato.numero, "2800-26");
  assert.deepEqual(r.faltando_no_modelo, []);
  const txt = textoDocx(await readFile(r.contrato.arquivo_path!));
  assert.ok(!txt.includes("{{"), "sobrou variável no docx");
  assert.match(txt, /CARTÃO DE CRÉDITO/);
  assert.ok(!/BOLETO/.test(txt), "cartão não pode aparecer como boleto");
  assert.match(txt, /12X/);
  assert.match(txt, /DOZE MIL, QUINHENTOS E CINQUENTA E CINCO REAIS E SESSENTA E QUATRO CENTAVOS/);
  const r2 = await gerar(repo, CASOS.vista_pix());
  assert.ok(r2.ok && r2.contrato.numero === "2801-26");
});

test("erro não gera contrato nem gasta número", async () => {
  const repo = await novoRepo();
  const d = CASOS.boleto_15x();
  d.pagamento.parcelas = 19;
  assert.ok(!(await gerar(repo, d)).ok);
  assert.equal(repo.contratos.size, 0);
  assert.equal(await repo.reservarNumero(0), 2800);
});

test("modo 'todos': todo contrato espera o gestor; Kanban até assinado", async () => {
  const repo = await novoRepo();
  const r = await gerar(repo, CASOS.vista_pix());
  assert.ok(r.ok);
  if (!r.ok) return;
  const id = r.contrato.id;
  assert.equal(r.contrato.status, "aguardando_aprovacao");
  assert.deepEqual(r.contrato.aprovacoes_necessarias, ["gestor_comercial"]);
  await assert.rejects(marcarEnviado(repo, id, "v-1"), /não foi aprovado/);
  await assert.rejects(aprovarContrato(repo, id, outro), /gestor_comercial/);
  assert.equal((await aprovarContrato(repo, id, gestor)).status, "aprovado");
  assert.equal((await marcarEnviado(repo, id, "v-1")).status, "enviado_cliente");
  assert.equal((await marcarAssinado(repo, id, "v-1")).status, "assinado");
  await assert.rejects(cancelarContrato(repo, id, "edmar", "x"), /assinado/);
});

test("nome do arquivo sinaliza atenção (é o que o gestor vê no ZapSign)", async () => {
  const repo = await novoRepo();
  const a = await gerar(repo, CASOS.boleto_40_dias());
  const b = await gerar(repo, CASOS.faturado());
  const c = await gerar(repo, CASOS.vista_pix());
  assert.ok(a.ok && b.ok && c.ok);
  if (!a.ok || !b.ok || !c.ok) return;
  assert.match(a.contrato.arquivo_path!, /ATENÇÃO - 2800-26/);
  assert.match(b.contrato.arquivo_path!, /ATENÇÃO MÁXIMA - 2801-26/);
  assert.match(c.contrato.arquivo_path!, /[\\/]2802-26 - /);
});

test("atenção máxima: documentos conferidos antes da aprovação", async () => {
  const repo = await novoRepo();
  const r = await gerar(repo, CASOS.faturado());
  assert.ok(r.ok);
  if (!r.ok) return;
  const id = r.contrato.id;
  assert.equal(r.contrato.nivel_aprovacao, 3);
  await assert.rejects(aprovarContrato(repo, id, gestor), /Faltam documentos/);
  for (const d of r.contrato.documentos) await marcarDocumento(repo, id, d.nome, true, "edmar");
  assert.equal((await aprovarContrato(repo, id, gestor)).status, "aprovado");
});

test("modos 'atencao' e 'nenhum' para afrouxar depois", async () => {
  const original = APROVACAO.modo;
  try {
    APROVACAO.modo = "atencao";
    const repo = await novoRepo();
    const padrao = await gerar(repo, CASOS.vista_pix());
    const atencao = await gerar(repo, CASOS.boleto_40_dias());
    assert.ok(padrao.ok && padrao.contrato.status === "aprovado");
    assert.ok(atencao.ok && atencao.contrato.status === "aguardando_aprovacao");
    APROVACAO.modo = "nenhum";
    const fat = await gerar(repo, CASOS.faturado());
    assert.ok(fat.ok && fat.contrato.status === "aprovado" && fat.contrato.nivel_aprovacao === 3);
  } finally {
    APROVACAO.modo = original;
  }
});

test("reprovado → corrigido mantém número, zera aprovações e mantém documentos conferidos", async () => {
  const repo = await novoRepo();
  const r = await gerar(repo, CASOS.faturado());
  assert.ok(r.ok);
  if (!r.ok) return;
  await marcarDocumento(repo, r.contrato.id, r.contrato.documentos[0].nome, true, "edmar");
  await reprovarContrato(repo, r.contrato.id, gestor, "Prazo de entrega errado");
  const d = CASOS.faturado();
  d.prazo_entrega = { tipo: "dias_corridos", dias: 30 };
  const c = await gerar(repo, d, { contrato_id: r.contrato.id });
  assert.ok(c.ok);
  if (!c.ok) return;
  assert.equal(c.contrato.numero, r.contrato.numero);
  assert.equal(c.contrato.status, "aguardando_aprovacao");
  assert.deepEqual(c.contrato.aprovacoes, []);
  assert.equal(c.contrato.documentos[0].recebido, true);
});

test("ferramentas: simulação devolve nível e exige confirmação para gerar", async () => {
  const repo = await novoRepo();
  const estado: EstadoAgente = { receitas: {} };
  const ctx = { repo, vendedor, estado, hoje: HOJE, consultarCnpj: async () => receitaExemplo() };
  const sim = await executarFerramenta("simular_pagamento", { preco_total_centavos: 45000000, pagamento: { condicao: "faturado_recebimento", parcelas: 1 } }, ctx);
  const s: any = sim.conteudo;
  assert.equal(s.nivel_atencao, 3);
  assert.equal(s.forma_pagamento_IV11, "BOLETO — 1ª EM 30 DIAS APÓS O RECEBIMENTO DO EQUIPAMENTO");
  assert.ok(s.documentos_exigidos.length >= 4);
  assert.ok((await executarFerramenta("gerar_contrato_para_aprovacao", { dados: CASOS.vista_pix(), confirmado_pelo_vendedor: false }, ctx)).erro);
  await executarFerramenta("consultar_cnpj", { cnpj: "11222333000181" }, ctx);
  const ok = await executarFerramenta("gerar_contrato_para_aprovacao", { dados: CASOS.vista_pix(), confirmado_pelo_vendedor: true }, ctx);
  assert.ok(!ok.erro, JSON.stringify(ok.conteudo));
});

test("loop do agente com IA simulada", async () => {
  const repo = await novoRepo();
  const roteiro: any[] = [
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "consultar_cnpj", input: { cnpj: "11.222.333/0001-81" } }] },
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t2", name: "gerar_contrato_para_aprovacao", input: { dados: CASOS.vista_pix(), confirmado_pelo_vendedor: true } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Contrato gerado e enviado para aprovação." }] },
  ];
  const recebidos: any[] = [];
  const falso: any = { messages: { create: async (req: any) => { recebidos.push(req); return roteiro.shift(); } } };
  const agente = new AgenteContratos({ repo, anthropic: falso, consultarCnpj: async () => receitaExemplo() });
  const r = await agente.responder({ vendedor, mensagem: "confirmo, pode gerar" });
  assert.equal(r.texto, "Contrato gerado e enviado para aprovação.");
  assert.ok(r.contrato_gerado);
  assert.equal(recebidos[0].tools.length, 5);
  assert.match(recebidos[0].system[0].text, /faturado_recebimento/);
  assert.equal(r.mensagens.length, 6);
});

test("modelos reais: Fiber e CO₂ pelo tipo; UV/solda ainda sem modelo; CO₂ só 1 unidade", async () => {
  const repo = await novoRepo();
  const co2 = await gerar(repo, CASOS.vista_pix());
  const fiber = await gerarContratoParaAprovacao({ repo, dados: casoPF(), vendedor, data_contrato: HOJE });
  assert.ok(co2.ok && fiber.ok, JSON.stringify([co2, fiber].map((r: any) => r.erros)));
  if (!co2.ok || !fiber.ok) return;
  assert.deepEqual([co2.contrato.modelo_id, fiber.contrato.modelo_id], ["contrato-co2", "contrato-fiber"]);
  assert.equal(fiber.contrato.cliente_tipo_pessoa, "PF");
  const txt = textoDocx(await readFile(fiber.contrato.arquivo_path!));
  assert.ok(!txt.includes("{{"), "sobrou variável");
  assert.match(txt, /MARIA OLIVEIRA SANTOS/);
  assert.match(txt, /153\.509\.460-56/);
  assert.match(txt, /ECNC UV 5W\/5W\/HUARAY/);
  assert.match(txt, /01 \(UM\)/);
  assert.match(txt, /PEDRO HENRIQUE LIMA/);
  assert.match(txt, /VENDEDOR TESTE/);
  assert.match(txt, /987\.654\.321-00/);

  const uv = CASOS.vista_pix();
  uv.equipamento.tipo = "uv";
  const r = await gerar(repo, uv);
  assert.ok(!r.ok && r.erros[0].includes("Ainda não há modelo"));
  const corte = CASOS.faturado();
  corte.equipamento.tipo = "fiber_corte";
  const rc = await gerar(repo, corte);
  assert.ok(!rc.ok && rc.erros[0].includes("Ainda não há modelo"));

  const dois = CASOS.vista_pix();
  dois.equipamento.quantidade = 2;
  dois.equipamento.preco_centavos = 1990000;
  const r2 = await gerar(repo, dois);
  assert.ok(!r2.ok && r2.erros.some((e) => e.includes("1 unidade")));
});

test("vendedor sem CPF/celular no cadastro: bloqueia com mensagem clara", async () => {
  const repo = await novoRepo();
  const r = await gerarContratoParaAprovacao({ repo, dados: CASOS.vista_pix(), vendedor: { id: "x", nome: "Sem Cadastro" }, receita: receitaExemplo(), data_contrato: HOJE });
  assert.ok(!r.ok);
  if (!r.ok) assert.match(r.erros.join(), /Testemunha ECNC \(vendedor\) — CPF \(cadastro do vendedor na Central\)/);
  assert.equal(await repo.reservarNumero(0), 2800);
});

test("nenhum campo em branco: modelo com campo desconhecido ou vazio bloqueia sem gastar número", async () => {
  const PizZipM = (await import("pizzip")).default;
  const { writeFile, mkdir } = await import("node:fs/promises");
  const pasta = await mkdtemp(join(tmpdir(), "modelos-"));
  await mkdir(pasta, { recursive: true });
  const original = await readFile("tests/modelos-exemplo/contrato-co2.docx"); // modelo simples, com variáveis do agente
  const alterar = (de: string, para: string) => {
    const z = new PizZipM(original);
    const xml = z.file("word/document.xml")!.asText();
    assert.ok(xml.includes(de));
    z.file("word/document.xml", xml.replace(de, para));
    return z.generate({ type: "nodebuffer" }) as Buffer;
  };
  // 1) campo que o agente não conhece (ex.: alguém adicionou "número de série" no Word)
  await writeFile(join(pasta, "contrato-co2.docx"), alterar("{{EQUIPAMENTO_MODELO}}", "{{EQUIPAMENTO_MODELO}} Série {{NUMERO_SERIE}}"));
  const repo = new MemoriaRepositorio(await mkdtemp(join(tmpdir(), "c-")), pasta, { 0: 2799 });
  const r1 = await gerar(repo, CASOS.vista_pix());
  assert.ok(!r1.ok && r1.erros[0].includes("NUMERO_SERIE"));
  // 2) campo conhecido mas vazio (ex.: modelo usa o 2º signatário obrigatório? não — usa IE de PF vazio? usa CONTRATANTE_NOME_FANTASIA opcional → ok)
  await writeFile(join(pasta, "contrato-co2.docx"), alterar("{{EQUIPAMENTO_MODELO}}", "{{EQUIPAMENTO_MODELO}} {{CONTRATANTE_NOME_FANTASIA}}"));
  const d = CASOS.vista_pix();
  delete d.contratante.nome_fantasia;
  assert.ok((await gerar(repo, d)).ok, "opcional vazio é permitido");
  assert.equal(await repo.reservarNumero(0), 2801, "só o contrato válido gastou número");
});
