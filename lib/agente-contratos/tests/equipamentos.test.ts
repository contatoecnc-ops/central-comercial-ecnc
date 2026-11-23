import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { executarFerramenta, type EstadoAgente } from "../agente/ferramentas";
import { descreverCatalogo, ehGarantiaTreMeses, lerPotenciaW, reconhecerFamilia } from "../config/equipamentos";
import { normalizarDados } from "../lib/normalizacao";
import { textoIV6 } from "../lib/pagamento";
import { validarContrato } from "../lib/validacao";
import { montarVariaveis } from "../lib/variaveis";
import { MemoriaRepositorio } from "../repositorio/memoria";
import { gerarContratoParaAprovacao, reprovarContrato } from "../servico";
import { DadosContratoSchema, type DadosContrato } from "../tipos";
import { CASOS, receitaExemplo } from "./fixtures";

const HOJE = "2026-11-12";
const vendedor = { id: "v-1", nome: "Vendedor Teste", cpf: "987.654.321-00", email: "vendedor@ecnc.com.br", celular: "(14) 99111-2233" };
const gestor = { id: "edmar", papel: "gestor_comercial" };
const GARANTIA = "GARANTIA ESTENDIDA DO TUBO LASER DE 03 MESES (TOTALIZANDO 06 MESES DE GARANTIA)";

const validar = (d: DadosContrato) => validarContrato(d, { receita: receitaExemplo(), data_contrato: HOJE });
/** À vista, sem opcionais; troca só o equipamento. */
const com = (eq: Partial<DadosContrato["equipamento"]>): DadosContrato => {
  const d = CASOS.vista_pix();
  d.equipamento = { ...d.equipamento, ...eq };
  return d;
};
const semMarca = (d: DadosContrato) => { delete d.equipamento.marca_laser; return d; };
const erros = (d: DadosContrato) => validar(d).erros.join(" | ");
const novoRepo = async () => new MemoriaRepositorio(await mkdtemp(join(tmpdir(), "contratos-")), "modelos", { 0: 2799 });

test("1) L-1610: o tipo sai do catálogo; 1610, l1610 e L-1610 são reconhecidos", () => {
  assert.match(erros(com({ modelo: "L-1610", tipo: "fiber" })), /L-1610 é sempre CO₂/);
  assert.ok(validar(com({ modelo: "L-1610", tipo: "co2" })).ok);
  for (const m of ["1610", "l1610", "L-1610", "l 1610", " L-1610 "]) {
    assert.equal(reconhecerFamilia(m)?.id, "L-1610", m);
    assert.ok(validar(com({ modelo: m })).ok, m);
  }
  // Fora do formato do catálogo: não adivinha
  assert.equal(reconhecerFamilia("ECNC CO2 1610"), undefined);
  // F-1530 vem antes do Fiber genérico
  assert.equal(reconhecerFamilia("F1530")?.tipo, "fiber_corte");
  assert.equal(reconhecerFamilia("F-1530")?.tipo, "fiber_corte");
  assert.equal(reconhecerFamilia("ECNC Fiber Marking 30W")?.tipo, "fiber");
  assert.equal(reconhecerFamilia("Fibra 50W")?.tipo, "fiber");
});

test("2) L-6040 sem marca vira SPT (listado nos ajustes); 90W não existe", () => {
  const d = semMarca(com({ modelo: "6040", potencia: "60W" }));
  const v = validar(d);
  assert.ok(v.ok, v.erros.join("; "));
  assert.equal(v.dados!.equipamento.marca_laser, "SPT");
  assert.deepEqual(v.ajustes_automaticos, ["Marca SPT aplicada (padrão do L-6040)"]);
  assert.ok(v.alertas.includes("Ajuste automático: Marca SPT aplicada (padrão do L-6040)"), "ajustes entram nos alertas");
  assert.match(erros(com({ modelo: "L-6040", potencia: "90W", marca_laser: "SPT" })), /não existe em 90W/);
  // marca informada é respeitada, mas precisa ser aceita
  assert.ok(validar(com({ modelo: "L-6040", potencia: "50 W", marca_laser: "reci" })).ok);
  assert.match(erros(com({ modelo: "L-6040", potencia: "50W", marca_laser: "JPT" })), /Marca JPT não é aceita/);
});

test("3) L-560: marca obrigatória (sem padrão); 130W não existe", () => {
  assert.match(erros(semMarca(com({ modelo: "L-560", potencia: "100W" }))), /Informe a marca do laser/);
  assert.match(erros(com({ modelo: "L-560", potencia: "130W", marca_laser: "RECI" })), /não existe em 130W/);
  assert.ok(validar(com({ modelo: "L-560", potencia: "60W", marca_laser: "PURI" })).ok);
  assert.match(erros(com({ modelo: "L-560", potencia: "xyz", marca_laser: "RECI" })), /Não entendi a potência/);
});

test("4) 90W: PURI é erro; garantia de 3 meses entra sozinha (R$ 0,00) e nunca duplica", () => {
  assert.match(erros(com({ modelo: "L-1060", potencia: "90W", marca_laser: "PURI" })), /Marca PURI não é aceita.*Aceitas: RECI, SPT/);

  const v = validar(com({ modelo: "L-1060", potencia: "90W", marca_laser: "RECI" }));
  assert.ok(v.ok, v.erros.join("; "));
  assert.deepEqual(v.dados!.acessorios, [{ descricao: GARANTIA, valor_centavos: 0 }]);
  assert.deepEqual(v.ajustes_automaticos, ["Garantia adicional de 3 meses incluída (CO₂ 90W)"]);
  assert.equal(v.dados!.preco_total_centavos, 1990000, "bonificação não muda o total");
  const vars = montarVariaveis({ numero: "2800-26", data_contrato: HOJE, dados: v.dados!, pagamento: v.pagamento!, vendedor });
  assert.equal(vars.ACESSORIO_1_VALOR, "R$ 0,00 (BONIFICAÇÃO)");
  assert.match(vars.ACESSORIO_1, /GARANTIA ESTENDIDA DO TUBO LASER DE 03 MESES/);

  // já tem (em qualquer redação) → não duplica
  for (const texto of ["Garantia estendida do tubo laser de 03 meses (totalizando 06 meses de garantia)", "3 meses de garantia adicional do tubo", "garantia adicional de três meses"]) {
    const d = com({ modelo: "L-1610", potencia: "90W", marca_laser: "SPT" });
    d.acessorios = [{ descricao: texto, valor_centavos: 0 }];
    const r = validar(d);
    assert.ok(r.ok, r.erros.join("; "));
    assert.equal(r.dados!.acessorios.length, 1, texto);
    assert.deepEqual(r.ajustes_automaticos, []);
  }
  // idempotente (contrato já normalizado e salvo)
  const n1 = normalizarDados(com({ modelo: "L-1610", potencia: "90W", marca_laser: "RECI" }));
  assert.equal(normalizarDados(n1.dados).dados.acessorios!.length, 1);
  assert.deepEqual(normalizarDados(n1.dados).ajustes_automaticos, []);
  // outros textos de garantia não confundem
  assert.ok(!ehGarantiaTreMeses("Garantia estendida de 12 meses"));
  assert.ok(!ehGarantiaTreMeses("Câmera CCD"));
  assert.ok(ehGarantiaTreMeses("Garantia estendida do tubo (03 meses)"));
});

test("5) CO₂ de outra potência com garantia adicional: permitido, com alerta de fora da política", () => {
  const d = com({ modelo: "L-1210", potencia: "130W", marca_laser: "RECI" });
  d.acessorios = [{ descricao: "Garantia adicional de 03 meses do tubo", valor_centavos: 0 }];
  const v = validar(d);
  assert.ok(v.ok, v.erros.join("; "));
  assert.ok(v.alertas.includes("Garantia adicional de 3 meses para CO₂ de 130W — fora da política, só o 90W tem"));
  assert.deepEqual(v.ajustes_automaticos, []);
  // 100W sem garantia: nada acontece
  const sem = validar(com({ modelo: "L-1210", potencia: "100W", marca_laser: "RECI" }));
  assert.ok(sem.ok && sem.dados!.acessorios.length === 0 && !sem.alertas.some((a) => a.includes("política")));
});

test("6) Fiber: marca padrão RAYCUS Q/QB, variações sem alerta, outra marca com alerta", () => {
  const fiber = (marca?: string) => {
    const d = com({ modelo: "ECNC Fiber Marking 30W", tipo: "fiber", potencia: "30W", marca_laser: marca });
    if (marca === undefined) delete d.equipamento.marca_laser;
    return validar(d);
  };
  const sem = fiber();
  assert.ok(sem.ok, sem.erros.join("; "));
  assert.equal(sem.dados!.equipamento.marca_laser, "RAYCUS Q/QB");
  assert.deepEqual(sem.ajustes_automaticos, ["Marca RAYCUS Q/QB aplicada (padrão do Fiber)"]);

  for (const m of ["Raycus", "RAYCUS QB", "raycus q", "RAYCUS Q/QB", "raycus q / qb", "Raycus Q"]) {
    const v = fiber(m);
    assert.ok(v.ok, `${m}: ${v.erros.join("; ")}`);
    assert.equal(v.dados!.equipamento.marca_laser, "RAYCUS Q/QB", m);
    assert.ok(!v.alertas.some((a) => a.includes("Fiber com marca")), `${m} não deveria alertar`);
    assert.deepEqual(v.ajustes_automaticos, [], m);
  }
  const jpt = fiber("JPT");
  assert.ok(jpt.ok, jpt.erros.join("; "));
  assert.equal(jpt.dados!.equipamento.marca_laser, "JPT");
  assert.ok(jpt.alertas.includes("Fiber com marca JPT — padrão é RAYCUS Q/QB"));
  // Fiber exige potência (livre), mas aceita qualquer valor
  assert.ok(validar(com({ modelo: "Fiber", tipo: "fiber", potencia: "3kW" })).ok);
  assert.match(erros(com({ modelo: "Fiber", tipo: "fiber", potencia: undefined })), /Informe a potência/);
});

test("7) F-1530, Router, UV e solda bloqueiam por 'sem modelo'; modelo desconhecido pede confirmação", async () => {
  const semModelo = /Ainda não há modelo de contrato/;
  const confirme = /confirmar o modelo/;

  const f = erros(com({ modelo: "F-1530", tipo: "fiber_corte", potencia: "3kW", marca_laser: undefined }));
  assert.match(f, semModelo);
  assert.doesNotMatch(f, confirme);

  // Router sem potência nem marca: bloqueia por falta de modelo, NÃO por falta de potência
  const router = validar(com({ modelo: "Router 1325", tipo: "router", potencia: undefined, marca_laser: undefined }));
  assert.ok(!router.ok);
  assert.match(router.erros.join(" | "), semModelo);
  assert.doesNotMatch(router.erros.join(" | "), /potência|marca/i);
  // e também com texto vazio vindo da IA
  const routerVazio = validar(com({ modelo: "Router", tipo: "router", potencia: "", marca_laser: " " }));
  assert.doesNotMatch(routerVazio.erros.join(" | "), /potência|marca|Campo/i);

  for (const modelo of ["ECNC UV 5W", "uv", "Marcadora UV 3W"]) {
    const e = erros(com({ modelo, tipo: "uv", potencia: undefined, marca_laser: undefined }));
    assert.match(e, semModelo, modelo);
    assert.doesNotMatch(e, confirme, modelo);
  }
  for (const modelo of ["Máquina de solda a laser", "Welding 1500W"]) {
    const e = erros(com({ modelo, tipo: "solda", potencia: undefined, marca_laser: undefined }));
    assert.match(e, semModelo, modelo);
    assert.doesNotMatch(e, confirme, modelo);
  }
  // modelo desconhecido
  const x = erros(com({ modelo: "XYZ-999", tipo: "co2" }));
  assert.match(x, confirme);
  assert.doesNotMatch(x, semModelo);

  // na geração, o contrato não é criado e o número não é gasto
  const repo = await novoRepo();
  const r = await gerarContratoParaAprovacao({ repo, dados: com({ modelo: "Router", tipo: "router", potencia: undefined, marca_laser: undefined }), vendedor, receita: receitaExemplo(), data_contrato: HOJE });
  assert.ok(!r.ok && r.erros.some((e) => semModelo.test(e)));
  assert.equal(repo.contratos.size, 0);
  assert.equal(await repo.reservarNumero(0), 2800);
});

test("8) Frete e instalação embutidos: exige VENDEDOR; sobe para no mínimo nível 2; nível 3 continua 3", async () => {
  const d = CASOS.vista_pix();
  d.frete_instalacao_embutidos = true;
  d.responsavel_frete = "COMPRADOR";
  d.responsavel_instalacao = "VENDEDOR";
  assert.match(erros(d), /frete e pela instalação precisa ser o VENDEDOR/);
  d.responsavel_frete = "VENDEDOR";
  d.responsavel_instalacao = "COMPRADOR";
  assert.match(erros(d), /precisa ser o VENDEDOR/);

  d.responsavel_instalacao = "VENDEDOR";
  const v = validar(d);
  assert.ok(v.ok, v.erros.join("; "));
  assert.equal(v.pagamento!.nivel, 1, "pelo pagamento seria padrão");
  assert.equal(v.nivel, 2);
  assert.deepEqual(v.motivos_nivel, ["Frete e instalação embutidos no preço da máquina (exceção)"]);

  // sem a flag, nada muda
  assert.equal(validar(CASOS.vista_pix()).nivel, 1);

  // já é nível 3 (faturado): continua 3 e soma o motivo
  const f = CASOS.faturado();
  f.frete_instalacao_embutidos = true;
  f.responsavel_frete = "VENDEDOR";
  f.responsavel_instalacao = "VENDEDOR";
  const vf = validar(f);
  assert.ok(vf.ok, vf.erros.join("; "));
  assert.equal(vf.nivel, 3);
  assert.ok(vf.motivos_nivel!.some((m) => m.includes("por natureza")));
  assert.ok(vf.motivos_nivel!.includes("Frete e instalação embutidos no preço da máquina (exceção)"));

  // o nível final é o que vai para o registro e para o nome do arquivo
  const repo = await novoRepo();
  const r = await gerarContratoParaAprovacao({ repo, dados: d, vendedor, receita: receitaExemplo(), data_contrato: HOJE });
  assert.ok(r.ok, !r.ok ? r.erros.join("; ") : "");
  if (!r.ok) return;
  assert.equal(r.contrato.nivel_aprovacao, 2);
  assert.ok(r.contrato.motivos_nivel.includes("Frete e instalação embutidos no preço da máquina (exceção)"));
  assert.match(r.contrato.arquivo_path!, /ATENÇÃO - 2800-26/);
  assert.equal(r.contrato.variaveis.RESPONSAVEL_FRETE, "VENDEDOR");
});

/** Boleto em 15x com entrada de R$ 19.937,50 = 10.000,00 + 9.937,50. */
const comEntrada = (pags: any[], extra: Partial<DadosContrato["pagamento"]> = {}) => {
  const d = CASOS.boleto_15x();
  d.equipamento.preco_centavos = 4401893;
  d.acessorios = [];
  d.preco_total_centavos = 4401893;
  d.prazo_entrega = { tipo: "dias_uteis", dias: 10 };
  d.pagamento = { condicao: "entrada_boleto_nf", entrada_pagamentos: pags, parcelas: 15, ...extra };
  return d;
};

test("9) Entrada: restante na finalização da fabricação", () => {
  const d = comEntrada([
    { valor_centavos: 1000000, momento: "assinatura" },
    { valor_centavos: 993750, momento: "fim_fabricacao" },
  ]);
  const v = validar(d);
  assert.ok(v.ok, v.erros.join("; "));
  const vars = montarVariaveis({ numero: "2800-26", data_contrato: HOJE, dados: v.dados!, pagamento: v.pagamento!, vendedor });
  assert.equal(vars.IV6_VALOR_ENTRADA, [
    "R$ 19.937,50 EM 2 PAGAMENTOS:",
    "1) R$ 10.000,00 VIA PIX NA ASSINATURA",
    "2) R$ 9.937,50 VIA PIX NA FINALIZAÇÃO DA FABRICAÇÃO, ANTES DA SAÍDA DO EQUIPAMENTO",
    "SAÍDA DO EQUIPAMENTO SOMENTE APÓS A COMPENSAÇÃO INTEGRAL DA ENTRADA",
  ].join("\n"));
  assert.equal(vars.IV7_PRAZO_ENTREGA, "10 (DEZ) DIAS ÚTEIS APÓS A COMPENSAÇÃO INTEGRAL DA ENTRADA");
  assert.ok(v.alertas.includes("Parte da entrada (R$ 9.937,50) só na finalização da fabricação — a máquina só sai com a entrada quitada integralmente."));
  assert.ok(!v.alertas.some((a) => a.includes("depois da compensação do último")));
  assert.match(vars.CLAUSULA_PAGAMENTO, /\(b\) R\$ 9\.937,50 \(nove mil, novecentos e trinta e sete reais e cinquenta centavos\) por PIX na finalização da fabricação, antes da saída do equipamento/);
  assert.equal(v.nivel, 1);

  // fim_fabricacao antes de outro item → erro; dois → erro
  assert.match(erros(comEntrada([{ valor_centavos: 993750, momento: "fim_fabricacao" }, { valor_centavos: 1000000, momento: "assinatura" }])), /precisa ser o último/);
  assert.match(erros(comEntrada([{ valor_centavos: 1000000, momento: "assinatura" }, { valor_centavos: 500000, momento: "fim_fabricacao" }, { valor_centavos: 493750, momento: "fim_fabricacao" }])), /Só pode haver um pagamento .* finalização da fabricação/);

  // não entra nas regras de data: nem ordem, nem "antes do contrato", nem prazo máximo, nem Atenção por dias
  const lixo = validar(comEntrada([
    { valor_centavos: 1000000, momento: "assinatura" },
    { valor_centavos: 993750, momento: "fim_fabricacao", data: "2020-01-01" },
  ]));
  assert.ok(lixo.ok, lixo.erros.join("; "));
  assert.equal(lixo.nivel, 1);
  const longe = validar(comEntrada([
    { valor_centavos: 1000000, momento: "assinatura" },
    { valor_centavos: 993750, momento: "fim_fabricacao", data: "2030-01-01" },
  ]));
  assert.ok(longe.ok && longe.nivel === 1, longe.erros.join("; "));
  // o último pagamento COM data é que conta: 45 dias → Atenção mesmo com o fim_fabricacao depois
  const atencao = validar(comEntrada([
    { valor_centavos: 1000000, momento: "assinatura" },
    { valor_centavos: 500000, momento: "data", data: "2026-12-27" },
    { valor_centavos: 493750, momento: "fim_fabricacao" },
  ]));
  assert.ok(atencao.ok, atencao.erros.join("; "));
  assert.equal(atencao.nivel, 2);
  // "data" exige a data
  assert.match(erros(comEntrada([{ valor_centavos: 1000000, momento: "data" }, { valor_centavos: 993750, momento: "fim_fabricacao" }])), /informe a data/);
  // sem "momento" (formato antigo) continua sendo "data"
  assert.ok(validar(comEntrada([{ valor_centavos: 1000000, data: HOJE }, { valor_centavos: 993750, data: "2026-11-30" }] as any)).ok);

  // 1º boleto com data fixa + fim_fabricacao → alerta de conferência
  const fixa = validar(comEntrada(
    [{ valor_centavos: 1000000, momento: "assinatura" }, { valor_centavos: 993750, momento: "fim_fabricacao" }],
    { parcelas: 15, primeiro_vencimento_data: "2027-01-10" },
  ));
  assert.ok(fixa.ok, fixa.erros.join("; "));
  assert.ok(fixa.alertas.includes("1º boleto com data fixa e entrada na finalização da fabricação — conferir se o boleto não vence antes da saída da máquina"));
  assert.equal(fixa.nivel, 2);
  // sem fim_fabricacao esse alerta não existe
  const semFim = validar(comEntrada(
    [{ valor_centavos: 1000000, momento: "assinatura" }, { valor_centavos: 993750, momento: "data", data: "2026-11-30" }],
    { primeiro_vencimento_data: "2027-01-10" },
  ));
  assert.ok(!semFim.alertas.some((a) => a.includes("finalização da fabricação")));

  // entrada inteira na finalização da fabricação (um só item)
  assert.equal(textoIV6(1000000, [{ valor_centavos: 1000000, meio: "pix", momento: "fim_fabricacao" }], HOJE), "R$ 10.000,00 VIA PIX NA FINALIZAÇÃO DA FABRICAÇÃO, ANTES DA SAÍDA DO EQUIPAMENTO");
});

test("10) Garantia automática sem espaço nos opcionais: erro claro", () => {
  const d = com({ modelo: "L-1610", potencia: "90W", marca_laser: "RECI" });
  d.acessorios = ["Câmera CCD", "Colmeia", "Exaustor", "Rotativo"].map((descricao) => ({ descricao, valor_centavos: 0 }));
  const v = validar(d);
  assert.ok(!v.ok);
  assert.match(v.erros.join(" | "), /Sem espaço para a garantia adicional de 3 meses do CO₂ 90W.*reduza os opcionais para 3/i);
  assert.equal(v.ajustes_automaticos.length, 0);
  // com 3 opcionais cabe
  d.acessorios = d.acessorios.slice(0, 3);
  assert.ok(validar(d).ok);
  // 4 opcionais onde um já é a garantia: ok
  d.acessorios = [...d.acessorios, { descricao: "Garantia estendida do tubo laser de 03 meses", valor_centavos: 0 }];
  assert.ok(validar(d).ok);
});

test("11) Contratos antigos: leitura sem erro (padrões do schema) e correção com modelo no formato antigo pede confirmação", async () => {
  // JSON como estava gravado em contratos.dados (sem os campos novos)
  const antigo: any = JSON.parse(JSON.stringify(CASOS.boleto_15x()));
  delete antigo.frete_instalacao_embutidos;
  antigo.equipamento.modelo = "ECNC CO2 1610";
  antigo.pagamento = {
    condicao: "entrada_boleto_nf", parcelas: 15,
    entrada_pagamentos: [{ valor_centavos: 1000000, data: HOJE, meio: "pix" }, { valor_centavos: 700000, data: "2026-11-20", meio: "pix" }],
  };
  const lido = DadosContratoSchema.safeParse(antigo);
  assert.ok(lido.success, lido.success ? "" : JSON.stringify(lido.error.issues));
  if (lido.success) {
    assert.equal(lido.data.frete_instalacao_embutidos, false);
    assert.deepEqual(lido.data.pagamento.entrada_pagamentos!.map((p) => p.momento), ["data", "data"]);
  }
  // sem potência e marca (campos agora opcionais) também lê
  const semLaser = JSON.parse(JSON.stringify(antigo));
  delete semLaser.equipamento.potencia;
  delete semLaser.equipamento.marca_laser;
  assert.ok(DadosContratoSchema.safeParse(semLaser).success);

  // Contrato reprovado, gravado com o modelo antigo → a correção pede para confirmar o modelo (não é erro técnico)
  const repo = await novoRepo();
  const r = await gerarContratoParaAprovacao({ repo, dados: CASOS.boleto_15x(), vendedor, receita: receitaExemplo(), data_contrato: HOJE });
  assert.ok(r.ok);
  if (!r.ok) return;
  await reprovarContrato(repo, r.contrato.id, gestor, "Revisar");
  const estado: EstadoAgente = { receitas: {} };
  const ctx = { repo, vendedor, estado, hoje: HOJE, consultarCnpj: async () => receitaExemplo() };
  await executarFerramenta("consultar_cnpj", { cnpj: "11222333000181" }, ctx);

  const dadosAntigos = { ...antigo, pagamento: CASOS.boleto_15x().pagamento };
  const val: any = (await executarFerramenta("validar_contrato", { dados: dadosAntigos }, ctx)).conteudo;
  assert.equal(val.ok, false);
  assert.equal(val.erros.length, 1);
  assert.match(val.erros[0], /^Modelo "ECNC CO2 1610" não bate com nenhum do catálogo — peça ao vendedor para confirmar o modelo\. Aceitos: .*L-1610/);
  assert.doesNotMatch(val.erros[0], /Campo "|undefined|TypeError/);

  const ger = await executarFerramenta("gerar_contrato_para_aprovacao", { dados: dadosAntigos, confirmado_pelo_vendedor: true, contrato_id: r.contrato.id }, ctx);
  assert.ok(ger.erro);
  assert.match((ger.conteudo as any).erros[0], /confirmar o modelo/);
  assert.equal(repo.contratos.get(r.contrato.id)!.status, "reprovado", "nada foi alterado");

  // vendedor confirma "L-1610" → a correção passa e mantém o número
  const certo = await executarFerramenta("gerar_contrato_para_aprovacao", { dados: { ...dadosAntigos, equipamento: { ...dadosAntigos.equipamento, modelo: "L-1610" } }, confirmado_pelo_vendedor: true, contrato_id: r.contrato.id }, ctx);
  assert.ok(!certo.erro, JSON.stringify(certo.conteudo));
  assert.equal((certo.conteudo as any).numero, r.contrato.numero);
});

test("ferramenta validar_contrato devolve ajustes_automaticos e o equipamento normalizado; prompt traz o catálogo", async () => {
  const repo = await novoRepo();
  const estado: EstadoAgente = { receitas: {} };
  const ctx = { repo, vendedor, estado, hoje: HOJE, consultarCnpj: async () => receitaExemplo() };
  await executarFerramenta("consultar_cnpj", { cnpj: "11222333000181" }, ctx);
  const d: any = semMarca(com({ modelo: "L-6040", potencia: "60W" }));
  const out: any = (await executarFerramenta("validar_contrato", { dados: d }, ctx)).conteudo;
  assert.ok(out.ok, JSON.stringify(out.erros));
  assert.deepEqual(out.ajustes_automaticos, ["Marca SPT aplicada (padrão do L-6040)"]);
  assert.equal(out.equipamento_normalizado.marca_laser, "SPT");

  const cat = descreverCatalogo();
  assert.match(cat, /L-6040.*50W, 60W.*SPT/);
  assert.match(cat, /L-1610.*90W, 100W, 130W, 150W/);
  assert.match(cat, /90W: RECI, SPT/);
  assert.match(cat, /Router.*sem potência.*sem marca/);
  assert.match(cat, /RAYCUS Q\/QB/);
  assert.equal(lerPotenciaW("100 W"), 100);
  assert.equal(lerPotenciaW("100w"), 100);
  assert.equal(lerPotenciaW("3kW"), 3000);
  assert.equal(lerPotenciaW("abc"), undefined);
});
