import assert from "node:assert/strict";
import { test } from "node:test";
import { cnpjValido, cpfValido } from "../lib/documentos";
import { formatarMoeda, valorPorExtenso } from "../lib/formatacao";
import { calcularPagamento } from "../lib/pagamento";
import { validarContrato } from "../lib/validacao";
import { montarVariaveis } from "../lib/variaveis";
import { CASOS, casoPF, receitaExemplo } from "./fixtures";

const variaveis = (d: ReturnType<(typeof CASOS)[keyof typeof CASOS]>) => {
  const v = validarContrato(d, { receita: receitaExemplo() });
  assert.ok(v.ok, v.erros.join("; "));
  return { v, vars: montarVariaveis({ numero: "2800-26", data_contrato: "2026-11-12", dados: v.dados!, pagamento: v.pagamento!, vendedor: { nome: "Teste", cpf: "987.654.321-00", email: "t@ecnc.com.br", celular: "(14) 99111-2233" } }) };
};

test("CNPJ e CPF", () => {
  assert.ok(cnpjValido("07.187.969/0001-62"));
  assert.ok(!cnpjValido("07.187.969/0001-63"));
  assert.ok(cpfValido("529.982.247-25"));
  assert.ok(!cpfValido("529.982.247-24"));
});

test("valor por extenso", () => {
  assert.equal(valorPorExtenso(100), "um real");
  assert.equal(valorPorExtenso(150000), "mil e quinhentos reais");
  assert.equal(valorPorExtenso(1990000), "dezenove mil e novecentos reais");
  assert.equal(valorPorExtenso(1255564), "doze mil, quinhentos e cinquenta e cinco reais e sessenta e quatro centavos");
  assert.equal(valorPorExtenso(3952361), "trinta e nove mil, quinhentos e vinte e três reais e sessenta e um centavos");
  assert.equal(valorPorExtenso(100000000), "um milhão de reais");
  assert.equal(formatarMoeda(6292361), "R$ 62.923,61");
});

test("Recorte 1 — à vista PIX: extenso com REAIS, nível 1", () => {
  const { v, vars } = variaveis(CASOS.vista_pix());
  assert.equal(vars.IV11_FORMA_PAGAMENTO, "PIX");
  assert.equal(vars.IV5_PRECO_TOTAL_EXTENSO, "DEZENOVE MIL E NOVECENTOS REAIS");
  assert.equal(vars.IV6_VALOR_ENTRADA, "R$ 19.900,00 VIA PIX NA ASSINATURA");
  assert.equal(vars.IV12_QTD_PRESTACOES, "--");
  assert.equal(vars.IV7_PRAZO_ENTREGA, "PRONTA ENTREGA");
  assert.equal(v.pagamento!.nivel, 1);
});

test("Recorte 2 — 15 boletos: centavos fecham, ainda é padrão", () => {
  const { v, vars } = variaveis(CASOS.boleto_15x());
  assert.equal(vars.IV11_FORMA_PAGAMENTO, "BOLETO — 1ª EM 30 DIAS APÓS A EMISSÃO DA NOTA FISCAL, DEMAIS A CADA 30 DIAS");
  assert.equal(vars.IV10_VALOR_PARCELA, "1ª de R$ 1.373,38 e 14 de R$ 1.373,33");
  assert.equal(vars.IV12_QTD_PRESTACOES, "15X");
  const soma = v.pagamento!.parcelas_centavos.reduce((a, b) => a + b, 0);
  assert.equal(soma + v.pagamento!.entrada_centavos, 3760000);
  assert.equal(v.pagamento!.nivel, 1);
  assert.match(vars.IV4_ACESSORIOS, /BONIFICAÇÃO/);
});

test("16 a 18 boletos: permitido como exceção (Atenção); 19 bloqueia", () => {
  const d = CASOS.boleto_15x();
  d.pagamento.parcelas = 18;
  const v = validarContrato(d, { receita: receitaExemplo() });
  assert.ok(v.ok, v.erros.join("; "));
  assert.equal(v.pagamento!.nivel, 2);
  assert.ok(v.pagamento!.motivos_nivel.some((m) => m.includes("mais de 15")));
  d.pagamento.parcelas = 19;
  assert.ok(validarContrato(d, { receita: receitaExemplo() }).erros.some((e) => e.includes("de 1 a 18")));
});

test("Entrada não tem mínimo de 30% sobre o TOTAL", () => {
  const d = CASOS.boleto_15x();
  d.pagamento.entrada_centavos = 1000000; // 26,6% do total
  assert.ok(validarContrato(d, { receita: receitaExemplo() }).ok);
});

test("Recorte 3 — acessórios somam no total", () => {
  const { vars } = variaveis(CASOS.acessorios());
  assert.equal(vars.IV5_PRECO_TOTAL, "R$ 62.923,61");
  assert.equal(vars.IV4_ACESSORIOS.split("\n").length, 4);
  assert.equal(vars.IV7_PRAZO_ENTREGA.startsWith("30 (TRINTA) DIAS ÚTEIS"), true);
  const d = CASOS.acessorios();
  d.preco_total_centavos = 6292300;
  const v = validarContrato(d, { receita: receitaExemplo() });
  assert.ok(v.erros.some((e) => e.startsWith("Preço total não confere")));
});

test("Recorte 4 — cartão nunca sai como BOLETO; acréscimo explícito; 2 cartões", () => {
  const { v, vars } = variaveis(CASOS.cartao_2_cartoes());
  assert.equal(vars.IV11_FORMA_PAGAMENTO, "CARTÃO DE CRÉDITO — 2 CARTÕES (R$ 6.277,82 + R$ 6.277,82)");
  assert.equal(vars.IV6_VALOR_ENTRADA, "SEM ENTRADA");
  assert.equal(vars.IV10_VALOR_PARCELA, "1ª de R$ 1.046,34 e 11 de R$ 1.046,30");
  assert.equal(vars.IV5_PRECO_TOTAL_EXTENSO, "DOZE MIL, QUINHENTOS E CINQUENTA E CINCO REAIS E SESSENTA E QUATRO CENTAVOS");
  assert.match(vars.CLAUSULA_PAGAMENTO, /acréscimo de parcelamento de R\$ 1\.555,64/);
  assert.match(vars.CLAUSULA_PAGAMENTO, /cartão 1 no valor de R\$ 6\.277,82 e cartão 2 no valor de R\$ 6\.277,82/);
  assert.ok(v.alertas.some((a) => a.includes("Acréscimo de cartão")));

  // Sem informar o acréscimo, o total não fecha
  const semAcrescimo = CASOS.cartao_2_cartoes();
  delete semAcrescimo.pagamento.acrescimo_cartao_centavos;
  assert.ok(!validarContrato(semAcrescimo, { receita: receitaExemplo() }).ok);

  // Cartão com "entrada" de texto livre / boleto com acréscimo de cartão → bloqueia
  const misturado = CASOS.cartao_2_cartoes();
  misturado.pagamento.condicao = "entrada_boleto_nf";
  const r = validarContrato(misturado, { receita: receitaExemplo() });
  assert.ok(r.erros.some((e) => e.includes("não é cartão")));
});

test("Recorte 5 — 1 boleto em 40 dias: permitido, mas nível 2", () => {
  const { v, vars } = variaveis(CASOS.boleto_40_dias());
  assert.equal(vars.IV10_VALOR_PARCELA, "R$ 10.500,00");
  assert.equal(vars.IV12_QTD_PRESTACOES, "1X");
  assert.match(vars.CONDICAO_PAGAMENTO, /1º em 40 dias contados da emissão da nota fiscal/);
  assert.equal(v.pagamento!.nivel, 2);
});

test("Faturado após recebimento — nível 3 com documentos", () => {
  const { v, vars } = variaveis(CASOS.faturado());
  assert.equal(v.pagamento!.nivel, 3);
  assert.ok(v.pagamento!.documentos.length >= 4);
  assert.equal(vars.IV6_VALOR_ENTRADA, "SEM ENTRADA");
  assert.match(vars.CLAUSULA_PAGAMENTO, /contados do recebimento do equipamento/);
});

test("Bloqueios de regra", () => {
  const e = (x: Parameters<typeof calcularPagamento>[0]) => calcularPagamento(x).erros.join(" | ");
  assert.match(e({ condicao: "entrada_boleto_nf", preco_total_centavos: 1000000, parcelas: 3 }), /exige valor de entrada/);
  assert.match(e({ condicao: "entrada_boleto_nf", preco_total_centavos: 10000000, entrada_centavos: 3000000, parcelas: 2, dias_primeira_parcela: 60 }), /máximo é 45 dias/);
  assert.match(e({ condicao: "cartao", preco_total_centavos: 100000, entrada_centavos: 30000, parcelas: 3 }), /não tem entrada/);
  assert.match(e({ condicao: "faturado_recebimento", preco_total_centavos: 100000, entrada_centavos: 10000, parcelas: 1 }), /não tem entrada/);
  assert.match(e({ condicao: "permuta", preco_total_centavos: 100 }), /não é permitida/);
  assert.match(e({ condicao: "a_vista", preco_total_centavos: 100000, parcelas: 2 }), /não tem parcelas/);
});

test("Prazo de entrega padronizado", () => {
  const d = CASOS.vista_pix();
  d.prazo_entrega = { tipo: "dias_uteis" };
  assert.ok(validarContrato(d, { receita: receitaExemplo() }).erros.some((x) => x.includes("quantidade de dias")));
});

test("Receita: CNPJ baixado bloqueia; signatário fora do QSA alerta", () => {
  const rf = receitaExemplo();
  rf.situacao = "BAIXADA";
  assert.ok(validarContrato(CASOS.vista_pix(), { receita: rf }).erros.some((e) => e.includes("BAIXADA")));
  const d = CASOS.vista_pix();
  d.signatarios.push({ nome: "Fulano Comprador", cpf: "153.509.460-56", cargo: "Compras", email: "fulano@x.com.br" });
  assert.ok(validarContrato(d, { receita: receitaExemplo() }).alertas.some((a) => a.includes("Fulano Comprador")));
});

test("Comprador PF: CPF, sem Receita, IE '--'; alerta se outro assina", () => {
  const { v, vars } = variaveis(casoPF());
  assert.equal(vars.CONTRATANTE_CPF_CNPJ, "CPF 153.509.460-56");
  assert.equal(vars.CONTRATANTE_IE, "--");
  assert.ok(!v.alertas.some((a) => a.includes("Receita")));
  const d = casoPF();
  d.signatarios = [{ nome: "Filho da Maria", cpf: "529.982.247-25", cargo: "Procurador", email: "f@x.com.br" }];
  assert.ok(validarContrato(d).alertas.some((a) => a.includes("procuração")));
  const ruim = casoPF();
  ruim.contratante.documento = "111.222.333-44";
  assert.ok(validarContrato(ruim).erros.some((e) => e.includes("CPF do comprador")));
});

test("PJ continua exigindo CNPJ válido", () => {
  const d = CASOS.vista_pix();
  d.contratante.documento = "11.222.333/0001-82";
  assert.ok(validarContrato(d, { receita: receitaExemplo() }).erros.some((e) => e.includes("CNPJ")));
});

test("Entrada dividida (sinal + restante): texto padronizado e entrega só após compensação integral", () => {
  const d = CASOS.boleto_15x();
  d.equipamento.preco_centavos = 4401893;
  d.acessorios = [];
  d.preco_total_centavos = 4401893;
  d.prazo_entrega = { tipo: "dias_uteis", dias: 10 };
  d.pagamento = {
    condicao: "entrada_boleto_nf",
    entrada_pagamentos: [
      { valor_centavos: 1000000, data: "2026-11-13", meio: "pix" },
      { valor_centavos: 993750, data: "2026-11-30", meio: "pix" },
    ],
    parcelas: 15,
  };
  const v = validarContrato(d, { receita: receitaExemplo(), data_contrato: "2026-11-13" });
  assert.ok(v.ok, v.erros.join("; "));
  const vars = montarVariaveis({ numero: "2026-0150", data_contrato: "2026-11-13", dados: v.dados!, pagamento: v.pagamento!, vendedor: { nome: "T" } });
  assert.equal(vars.IV6_VALOR_ENTRADA, [
    "R$ 19.937,50 EM 2 PAGAMENTOS:",
    "1) R$ 10.000,00 VIA PIX NA ASSINATURA",
    "2) R$ 9.937,50 VIA PIX EM 30/11/2026",
    "SAÍDA DO EQUIPAMENTO SOMENTE APÓS A COMPENSAÇÃO INTEGRAL DA ENTRADA",
  ].join("\n"));
  assert.equal(vars.IV7_PRAZO_ENTREGA, "10 (DEZ) DIAS ÚTEIS APÓS A COMPENSAÇÃO INTEGRAL DA ENTRADA");
  assert.equal(vars.IV11_FORMA_PAGAMENTO, "BOLETO — 1ª EM 30 DIAS APÓS A EMISSÃO DA NOTA FISCAL, DEMAIS A CADA 30 DIAS");
  assert.equal(vars.IV12_QTD_PRESTACOES, "15X");
  // saldo 24.081,43 em 15x fecha no centavo (o contrato manual somava 24.081,45)
  assert.equal(v.pagamento!.parcelas_centavos.reduce((a, b) => a + b, 0), 2408143);
  assert.match(vars.CLAUSULA_PAGAMENTO, /em 2 \(dois\) pagamentos: \(a\) R\$ 10\.000,00 \(dez mil reais\) por PIX na assinatura deste contrato; \(b\) R\$ 9\.937,50/);
  assert.match(vars.CLAUSULA_PAGAMENTO, /compensação integral da entrada/);
  assert.equal(v.pagamento!.nivel, 1);
  assert.ok(v.alertas.some((a) => a.includes("só sai depois da compensação do último (30/11/2026)")));
});

test("Entrada dividida: soma errada, data passada, fora de ordem e prazo longo", () => {
  const base = { condicao: "entrada_boleto_nf", preco_total_centavos: 1000000, parcelas: 3, data_contrato: "2026-11-13" };
  const e = (pags: any[], entrada?: number) => calcularPagamento({ ...base, entrada_centavos: entrada, entrada_pagamentos: pags });
  assert.match(e([{ valor_centavos: 200000, data: "2026-11-13" }, { valor_centavos: 100000, data: "2026-11-20" }], 400000).erros.join(), /somam R\$ 3\.000,00/);
  assert.match(e([{ valor_centavos: 300000, data: "2026-11-10" }]).erros.join(), /anterior à data do contrato/);
  assert.match(e([{ valor_centavos: 100000, data: "2026-11-30" }, { valor_centavos: 200000, data: "2026-11-20" }]).erros.join(), /fora de ordem/);
  assert.match(e([{ valor_centavos: 100000, data: "2026-11-13" }, { valor_centavos: 200000, data: "2027-02-01" }]).erros.join(), /máximo é 60 dias/);
  const atencao = e([{ valor_centavos: 100000, data: "2026-11-13" }, { valor_centavos: 200000, data: "2026-12-30" }]);
  assert.ok(atencao.ok && atencao.nivel === 2);
  assert.match(calcularPagamento({ condicao: "faturado_recebimento", preco_total_centavos: 1000000, parcelas: 1, entrada_pagamentos: [{ valor_centavos: 1, data: "2026-11-13" }], data_contrato: "2026-11-13" }).erros.join(), /não tem entrada/);
});

test("1º boleto com data fixa: permitido, vira Atenção com alerta ao gestor", () => {
  const base = {
    condicao: "entrada_boleto_nf", preco_total_centavos: 4401893, parcelas: 15, data_contrato: "2026-11-13",
    entrada_pagamentos: [
      { valor_centavos: 1000000, data: "2026-11-13" },
      { valor_centavos: 993750, data: "2026-11-30" },
    ],
  };
  const r = calcularPagamento({ ...base, primeiro_vencimento_data: "2027-01-10" });
  assert.ok(r.ok, r.erros.join("; "));
  assert.equal(r.nivel, 2);
  assert.ok(r.alertas.some((a) => a.startsWith("Atenção do gestor: 1º boleto com DATA FIXA (10/01/2027)")));
  assert.match(r.campos!.clausula, /vencendo a primeira em 10\/01\/2027, e as demais a cada 30/);
  assert.match(r.campos!.condicao_resumo, /1º em 10\/01\/2027 \(data fixa\)/);
  assert.equal(r.campos!.forma_pagamento, "BOLETO — 1ª EM 10/01/2027, DEMAIS A CADA 30 DIAS");
  // antes de terminar a entrada, muito longe, ou junto com "dias" → bloqueia
  assert.match(calcularPagamento({ ...base, primeiro_vencimento_data: "2026-11-25" }).erros.join(), /depois do último pagamento da entrada/);
  assert.match(calcularPagamento({ ...base, primeiro_vencimento_data: "2027-03-01" }).erros.join(), /máximo com data fixa é 90/);
  assert.match(calcularPagamento({ ...base, primeiro_vencimento_data: "2027-01-10", dias_primeira_parcela: 30 }).erros.join(), /não os dois/);
});

test("conferência de preenchimento (modelo real): campo obrigatório vazio bloqueia", async () => {
  const { readFile } = await import("node:fs/promises");
  const { conferirPreenchimento } = await import("../lib/gerador-docx");
  const { VARIAVEIS_OPCIONAIS } = await import("../lib/variaveis");
  const { MAPA_ZAPSIGN } = await import("../config/modelos");
  const { vars } = variaveis(CASOS.vista_pix());
  const modelo = await readFile("modelos/contrato-co2.docx");
  assert.deepEqual(conferirPreenchimento(modelo, vars, VARIAVEIS_OPCIONAIS, MAPA_ZAPSIGN), []);
  const p = conferirPreenchimento(modelo, { ...vars, CONTRATANTE_TELEFONE: " ", IV7_PRAZO_ENTREGA: "" }, VARIAVEIS_OPCIONAIS, MAPA_ZAPSIGN);
  assert.equal(p.length, 1);
  assert.match(p[0], /em branco: .*Telefone/);
  assert.match(p[0], /Prazo de entrega/);
});

test("garantidor e testemunha validados; testemunha não pode ser parte", () => {
  const d = CASOS.vista_pix();
  d.testemunha_cliente.cpf = d.signatarios[0].cpf;
  assert.ok(validarContrato(d, { receita: receitaExemplo() }).erros.some((e) => e.includes("não pode ser parte")));
  const d2 = CASOS.vista_pix();
  d2.garantidor.cpf = "111.111.111-11";
  assert.ok(validarContrato(d2, { receita: receitaExemplo() }).erros.some((e) => e.includes("Garantidor solidário")));
  const d3 = CASOS.vista_pix();
  d3.garantidor = { ...d3.garantidor, nome: "Avalista", cpf: "390.533.447-05" };
  assert.ok(validarContrato(d3, { receita: receitaExemplo() }).alertas.some((a) => a.includes("avalista")));
  const d4 = CASOS.vista_pix();
  d4.acessorios = Array.from({ length: 5 }, (_, i) => ({ descricao: `Item ${i}`, valor_centavos: 0 }));
  assert.ok(validarContrato(d4, { receita: receitaExemplo() }).erros.some((e) => e.includes("espaço para 4")));
});

test("variáveis dos modelos reais: opcionais, quantidade, frete e entrega", () => {
  const { vars } = variaveis(CASOS.acessorios());
  assert.equal(vars.ACESSORIO_1, "CÂMERA CCD");
  assert.equal(vars.ACESSORIO_1_VALOR, "R$ 20.000,00");
  assert.equal(vars.ACESSORIO_4_VALOR, "R$ 0,00 (BONIFICAÇÃO)");
  const { vars: v2 } = variaveis(CASOS.vista_pix());
  assert.equal(v2.ACESSORIO_1, "--");
  assert.equal(v2.EQUIPAMENTO_QUANTIDADE, "01 (UM)");
  assert.equal(v2.RESPONSAVEL_FRETE, "COMPRADOR");
  assert.equal(v2.RESPONSAVEL_INSTALACAO, "VENDEDOR");
  assert.equal(v2.ENTREGA_CIDADE, "Marília/SP");
  assert.equal(v2.CONTRATANTE_ENDERECO_SEDE, "Rua das Indústrias, 500 — CEP 17512-000");
  assert.equal(v2.COMPRADOR_NOME, "JOÃO DA SILVA");
});
