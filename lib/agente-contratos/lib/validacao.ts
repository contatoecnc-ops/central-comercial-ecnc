import type { Nivel } from "../config/condicoes-pagamento";
import { REGRAS_GERAIS } from "../config/empresa";
import { DadosContratoSchema, type DadosContrato, type DadosContratoEntrada, type ResultadoValidacao } from "../tipos";
import type { DadosReceita } from "./cnpj-api";
import { cnpjValido, cpfValido, emailValido, normalizarNome, somenteDigitos, UFS } from "./documentos";
import { formatarMoeda } from "./formatacao";
import { conferirEquipamento, normalizarDados } from "./normalizacao";
import { calcularPagamento, type ResultadoPagamento } from "./pagamento";

export interface ValidacaoCompleta extends ResultadoValidacao {
  dados?: DadosContrato;
  pagamento?: ResultadoPagamento;
  preco_base_centavos?: number;
  /** O que o sistema ajustou sozinho (marca padrão, garantia do 90W...). Já estão também em `alertas`. */
  ajustes_automaticos: string[];
  /** Nível FINAL do contrato: o maior entre o das regras de pagamento e o das exceções (ex.: frete embutido). */
  nivel?: Nivel;
  motivos_nivel?: string[];
}

export const MOTIVO_FRETE_EMBUTIDO = "Frete e instalação embutidos no preço da máquina (exceção)";

function validarEndereco(prefixo: string, e: DadosContrato["contratante"]["endereco"], erros: string[]) {
  if (!UFS.includes(e.uf.toUpperCase())) erros.push(`${prefixo}: UF "${e.uf}" inválida.`);
  if (somenteDigitos(e.cep).length !== 8) erros.push(`${prefixo}: CEP "${e.cep}" precisa ter 8 dígitos.`);
}

/**
 * Validação completa e determinística. É ela — não a IA — que decide se o
 * contrato pode ou não ser gerado, e em qual nível de aprovação.
 */
export function validarContrato(entrada: DadosContratoEntrada, opts: { receita?: DadosReceita; data_contrato?: string } = {}): ValidacaoCompleta {
  const erros: string[] = [];
  const alertas: string[] = [];

  // Etapa 1: o que o catálogo manda e o vendedor não precisa informar (marca padrão, garantia do 90W).
  const norm = normalizarDados(entrada);
  const ajustes = norm.ajustes_automaticos;
  alertas.push(...ajustes.map((a) => `Ajuste automático: ${a}`));
  erros.push(...norm.erros);

  const parse = DadosContratoSchema.safeParse(norm.dados);
  if (!parse.success) {
    for (const issue of parse.error.issues) erros.push(`Campo "${issue.path.join(".")}": ${issue.message}`);
    return { ok: false, erros, alertas, ajustes_automaticos: ajustes };
  }
  const d = parse.data;
  const c = d.contratante;

  // Contratante
  const pf = c.tipo_pessoa === "PF";
  if (pf) {
    if (!cpfValido(c.documento)) erros.push(`CPF do comprador ${c.documento} é inválido.`);
    const cpfComprador = somenteDigitos(c.documento);
    if (!d.signatarios.some((s) => somenteDigitos(s.cpf) === cpfComprador))
      alertas.push("Comprador pessoa física não está entre os signatários — quem assina precisa de procuração.");
  } else if (!cnpjValido(c.documento)) erros.push(`CNPJ ${c.documento} é inválido (dígito verificador não confere).`);
  if (!emailValido(c.email)) erros.push(`E-mail do contratante "${c.email}" inválido.`);
  validarEndereco("Endereço do contratante", c.endereco, erros);
  if (d.endereco_entrega) validarEndereco("Endereço de entrega", d.endereco_entrega, erros);

  // Signatários
  if (d.signatarios.length > REGRAS_GERAIS.max_signatarios) erros.push(`Máximo de ${REGRAS_GERAIS.max_signatarios} signatários.`);
  const cpfs = new Set<string>();
  d.signatarios.forEach((s, i) => {
    const r = `Signatário ${i + 1} (${s.nome})`;
    if (!cpfValido(s.cpf)) erros.push(`${r}: CPF ${s.cpf} inválido.`);
    if (!emailValido(s.email)) erros.push(`${r}: e-mail "${s.email}" inválido.`);
    const cpf = somenteDigitos(s.cpf);
    if (cpfs.has(cpf)) erros.push(`${r}: CPF repetido.`);
    cpfs.add(cpf);
  });

  // Receita (só PJ)
  if (pf) {
    // pessoa física: sem consulta à Receita
  } else if (opts.receita) {
    const rf = opts.receita;
    if (rf.situacao && rf.situacao !== "ATIVA") erros.push(`CNPJ com situação "${rf.situacao}" na Receita — não é possível contratar.`);
    if (normalizarNome(rf.razao_social) !== normalizarNome(c.razao_social))
      erros.push(`Razão social diferente da Receita. Receita: "${rf.razao_social}". Informado: "${c.razao_social}".`);
    if (somenteDigitos(rf.endereco.cep) && somenteDigitos(rf.endereco.cep) !== somenteDigitos(c.endereco.cep))
      alertas.push(`Endereço do contrato difere do cadastro na Receita (CEP Receita ${rf.endereco.cep}).`);
    if (rf.socios.length) {
      const qsa = rf.socios.map((s) => normalizarNome(s.nome));
      for (const s of d.signatarios)
        if (!qsa.includes(normalizarNome(s.nome)))
          alertas.push(`${s.nome} não aparece no quadro de sócios da Receita — exigir procuração ou documento que comprove poderes para assinar.`);
    }
  } else alertas.push("CNPJ não foi conferido na Receita (consulta não feita ou indisponível).");

  // Equipamento: tipo, potência e marca saem do catálogo (config/equipamentos.ts)
  const eqv = conferirEquipamento(d);
  erros.push(...eqv.erros);
  alertas.push(...eqv.alertas);

  // Frete e instalação embutidos no preço: exceção, só com o vendedor pagando os dois
  if (d.frete_instalacao_embutidos && (d.responsavel_frete !== "VENDEDOR" || d.responsavel_instalacao !== "VENDEDOR"))
    erros.push("Frete e instalação embutidos no preço da máquina: o responsável pelo frete e pela instalação precisa ser o VENDEDOR.");

  // Valores: IV.3 + IV.4 (+ acréscimo do cartão) = IV.5
  const acessorios = d.acessorios.reduce((s, a) => s + a.valor_centavos, 0);
  const base = d.equipamento.preco_centavos + acessorios;
  const acrescimo = d.pagamento.acrescimo_cartao_centavos ?? 0;
  if (base + acrescimo !== d.preco_total_centavos && !(d.pagamento.condicao === "cartao"))
    erros.push(
      `Preço total não confere: equipamento ${formatarMoeda(d.equipamento.preco_centavos)} + acessórios ${formatarMoeda(acessorios)} = ${formatarMoeda(base)}, mas foi informado ${formatarMoeda(d.preco_total_centavos)}.`,
    );
  if (d.acessorios.length > REGRAS_GERAIS.max_acessorios)
    erros.push(`${d.acessorios.length} opcionais — o contrato tem espaço para ${REGRAS_GERAIS.max_acessorios} (IV.4). Junte itens ou fale com o gestor.`);

  // Garantidor solidário e testemunha do cliente
  const g = d.garantidor;
  if (!cpfValido(g.cpf)) erros.push(`Garantidor solidário (${g.nome}): CPF ${g.cpf} inválido.`);
  if (!emailValido(g.email)) erros.push(`Garantidor solidário: e-mail "${g.email}" inválido.`);
  validarEndereco("Endereço do garantidor", g.endereco, erros);
  if (!d.signatarios.some((s) => somenteDigitos(s.cpf) === somenteDigitos(g.cpf)))
    alertas.push(`Garantidor solidário (${g.nome}) não é quem assina pela compradora — confirmar se é avalista exigido pela análise de crédito.`);
  const t = d.testemunha_cliente;
  if (!cpfValido(t.cpf)) erros.push(`Testemunha do cliente (${t.nome}): CPF ${t.cpf} inválido.`);
  if (!emailValido(t.email)) erros.push(`Testemunha do cliente: e-mail "${t.email}" inválido.`);
  const partes = [...d.signatarios.map((s) => s.cpf), g.cpf, ...(pf ? [c.documento] : [])].map(somenteDigitos);
  if (partes.includes(somenteDigitos(t.cpf)))
    erros.push("A testemunha do cliente não pode ser parte do contrato (comprador, signatário ou garantidor). Peça outra pessoa.");
  for (const a of d.acessorios) if (a.valor_centavos === 0) alertas.push(`"${a.descricao}" com valor R$ 0,00 — sai como BONIFICAÇÃO.`);

  // Prazo de entrega
  const pe = d.prazo_entrega;
  if (pe.tipo !== "pronta_entrega" && !pe.dias) erros.push("Prazo de entrega: informe a quantidade de dias.");
  if (pe.tipo === "pronta_entrega" && pe.dias) erros.push("Prazo de entrega: pronta entrega não leva quantidade de dias.");
  if (pe.dias && pe.dias > REGRAS_GERAIS.prazo_entrega_max_dias)
    alertas.push(`Prazo de entrega de ${pe.dias} dias acima do padrão (${REGRAS_GERAIS.prazo_entrega_max_dias}) — confirmar com a produção.`);

  // Pagamento
  const pg = calcularPagamento({
    condicao: d.pagamento.condicao,
    preco_total_centavos: d.preco_total_centavos,
    preco_base_centavos: base,
    entrada_centavos: d.pagamento.entrada_centavos,
    entrada_pagamentos: d.pagamento.entrada_pagamentos,
    primeiro_vencimento_data: d.pagamento.primeiro_vencimento_data,
    data_contrato: opts.data_contrato,
    parcelas: d.pagamento.parcelas,
    dias_primeira_parcela: d.pagamento.dias_primeira_parcela,
    banco: d.pagamento.banco,
    acrescimo_cartao_centavos: d.pagamento.acrescimo_cartao_centavos,
    divisao_cartoes_centavos: d.pagamento.divisao_cartoes_centavos,
  });
  erros.push(...pg.erros.map((e) => `Pagamento: ${e}`));
  alertas.push(...pg.alertas);
  if (pg.condicao) alertas.push(...pg.condicao.pontos_atencao.map((p) => `Atenção (${pg.condicao!.nome}): ${p}`));

  // Nível final = o maior entre o das regras de pagamento e o das exceções (frete embutido = no mínimo 2).
  let nivel: Nivel = pg.nivel;
  const motivos_nivel = [...pg.motivos_nivel];
  if (d.frete_instalacao_embutidos) {
    motivos_nivel.push(MOTIVO_FRETE_EMBUTIDO);
    if (nivel < 2) nivel = 2;
  }

  return { ok: erros.length === 0, erros, alertas, dados: d, pagamento: pg, preco_base_centavos: base, ajustes_automaticos: ajustes, nivel, motivos_nivel };
}
