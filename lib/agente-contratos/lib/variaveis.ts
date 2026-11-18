import { EMPRESA } from "../config/empresa";
import type { DadosContrato, Endereco } from "../tipos";
import { formatarCep, formatarCnpj, formatarCpf } from "./documentos";
import { dataPorExtenso, formatarMoeda, inteiroPorExtenso, valorPorExtenso } from "./formatacao";
import type { ResultadoPagamento } from "./pagamento";

/**
 * Lista oficial das variáveis que podem existir nos modelos .docx.
 * No Word: {{IV5_PRECO_TOTAL}} (mesma sintaxe dos modelos dinâmicos do ZapSign).
 * Nenhuma delas é digitada pelo vendedor — todas saem calculadas.
 */
export const VARIAVEIS_DISPONIVEIS = {
  CONTRATO_NUMERO: "Número do contrato (ex.: 2800-26)",
  CONTRATO_DATA: "Data por extenso (12 de novembro de 2026)",
  CONTRATO_CIDADE: "Cidade de assinatura da ECNC",
  CONTRATADA_RAZAO_SOCIAL: "Razão social da Inovus",
  CONTRATADA_CNPJ: "CNPJ da Inovus",
  CONTRATANTE_RAZAO_SOCIAL: "Nome completo (PF) ou razão social da Receita (PJ)",
  CONTRATANTE_NOME_FANTASIA: "Nome fantasia",
  CONTRATANTE_TIPO_DOCUMENTO: "CPF ou CNPJ (o rótulo)",
  CONTRATANTE_DOCUMENTO: "Número do CPF ou CNPJ formatado",
  CONTRATANTE_CPF_CNPJ: "Rótulo + número (ex.: CNPJ 11.222.333/0001-81)",
  CONTRATANTE_IE: "Inscrição estadual (PJ sem IE: ISENTO; PF sem IE: --)",
  CONTRATANTE_ENDERECO: "Endereço completo em uma linha",
  CONTRATANTE_CIDADE_UF: "Cidade/UF",
  CONTRATANTE_CEP: "CEP formatado",
  CONTRATANTE_EMAIL: "E-mail",
  CONTRATANTE_TELEFONE: "Telefone",
  SIGNATARIOS: "Bloco com todos os signatários (nome, cargo, CPF)",
  SIGNATARIO_1_NOME: "Nome do 1º signatário",
  SIGNATARIO_1_CPF: "CPF do 1º signatário",
  SIGNATARIO_1_CARGO: "Cargo do 1º signatário",
  SIGNATARIO_1_EMAIL: "E-mail do 1º signatário",
  SIGNATARIO_2_NOME: "Nome do 2º signatário (vazio se não houver)",
  SIGNATARIO_2_CPF: "CPF do 2º signatário",
  SIGNATARIO_2_CARGO: "Cargo do 2º signatário",
  EQUIPAMENTO_MODELO: "Modelo da máquina",
  EQUIPAMENTO_DESCRICAO: "Descrição da máquina",
  IV3_PRECO_AQUISICAO: "Preço de aquisição (R$)",
  IV3_PRECO_AQUISICAO_EXTENSO: "Preço de aquisição por extenso (MAIÚSCULAS)",
  IV4_ACESSORIOS: "Acessórios vendidos separadamente, uma linha cada (ou --)",
  IV5_PRECO_TOTAL: "Preço total de aquisição (R$)",
  IV5_PRECO_TOTAL_EXTENSO: "Preço total por extenso (MAIÚSCULAS)",
  IV6_VALOR_ENTRADA: "Valor da entrada (ou SEM ENTRADA)",
  IV7_PRAZO_ENTREGA: "Prazo de entrega padronizado",
  IV10_VALOR_PARCELA: "Valor de cada parcela (ou --)",
  IV11_FORMA_PAGAMENTO: "PIX / BOLETO / CARTÃO DE CRÉDITO / FINANCIAMENTO BANCÁRIO",
  IV12_QTD_PRESTACOES: "Quantidade de prestações (ex.: 15X ou --)",
  RESPONSAVEL_FRETE: "COMPRADOR ou VENDEDOR",
  RESPONSAVEL_INSTALACAO: "COMPRADOR ou VENDEDOR (técnico/instalação)",
  CONDICAO_PAGAMENTO: "Resumo da condição em uma frase (vencimentos e gatilho)",
  CLAUSULA_PAGAMENTO: "Texto completo da cláusula de pagamento",
  ENDERECO_ENTREGA: "Endereço de entrega (ou o mesmo do contratante)",
  VENDEDOR_NOME: "Vendedor responsável",
  // Usados pelos modelos reais da ECNC (ver MAPA_ZAPSIGN em config/modelos.ts)
  CONTRATANTE_ENDERECO_SEDE: "Endereço do comprador (rua, número, complemento, CEP)",
  CONTRATANTE_BAIRRO: "Bairro do comprador",
  COMPRADOR_NOME: "Quem assina como comprador (1º signatário)",
  COMPRADOR_CPF: "CPF de quem assina como comprador",
  GARANTIDOR_NOME: "Nome do garantidor solidário (avalista)",
  GARANTIDOR_CPF: "CPF do garantidor solidário",
  GARANTIDOR_EMAIL: "E-mail do garantidor solidário",
  GARANTIDOR_ENDERECO: "Endereço completo do garantidor solidário",
  EQUIPAMENTO_POTENCIA: "Potência da máquina",
  EQUIPAMENTO_MARCA_LASER: "Marca do laser (fonte/tubo)",
  EQUIPAMENTO_QUANTIDADE: "Quantidade (ex.: 01 (UM))",
  ENTREGA_CIDADE: "Cidade de entrega (praça)",
  ENTREGA_ENDERECO: "Endereço de entrega completo",
  ACESSORIO_1: "Opcional 1 (ou --)",
  ACESSORIO_1_VALOR: "Valor do opcional 1",
  ACESSORIO_2: "Opcional 2 (ou --)",
  ACESSORIO_2_VALOR: "Valor do opcional 2",
  ACESSORIO_3: "Opcional 3 (ou --)",
  ACESSORIO_3_VALOR: "Valor do opcional 3",
  ACESSORIO_4: "Opcional 4 (ou --)",
  ACESSORIO_4_VALOR: "Valor do opcional 4",
  TESTEMUNHA_CLIENTE_NOME: "Testemunha do cliente — nome",
  TESTEMUNHA_CLIENTE_CPF: "Testemunha do cliente — CPF",
  TESTEMUNHA_CLIENTE_EMAIL: "Testemunha do cliente — e-mail",
  TESTEMUNHA_CLIENTE_CELULAR: "Testemunha do cliente — celular",
  TESTEMUNHA_ECNC_NOME: "Testemunha ECNC (vendedor) — nome",
  TESTEMUNHA_ECNC_CPF: "Testemunha ECNC (vendedor) — CPF (cadastro do vendedor na Central)",
  TESTEMUNHA_ECNC_EMAIL: "Testemunha ECNC (vendedor) — e-mail (cadastro do vendedor na Central)",
  TESTEMUNHA_ECNC_CELULAR: "Testemunha ECNC (vendedor) — celular (cadastro do vendedor na Central)",
} as const;

export type NomeVariavel = keyof typeof VARIAVEIS_DISPONIVEIS;

/**
 * Únicas variáveis que podem sair vazias no contrato (não existem em toda venda).
 * Qualquer outra variável que o modelo use e esteja vazia BLOQUEIA a geração —
 * o contrato nunca vai ao cliente com campo em branco.
 */
export const VARIAVEIS_OPCIONAIS = new Set<NomeVariavel>([
  "CONTRATANTE_NOME_FANTASIA",
  "SIGNATARIO_2_NOME",
  "SIGNATARIO_2_CPF",
  "SIGNATARIO_2_CARGO",
  // Os valores dos opcionais não usados ficam vazios (o nome sai "--").
  "ACESSORIO_1_VALOR",
  "ACESSORIO_2_VALOR",
  "ACESSORIO_3_VALOR",
  "ACESSORIO_4_VALOR",
]);

/** Dados do vendedor que entram no contrato (testemunha ECNC) — vêm do perfil na Central. */
export interface DadosVendedor { nome: string; cpf?: string; email?: string; celular?: string }

const linhaEndereco = (e: Endereco) =>
  `${e.logradouro}, ${e.numero}${e.complemento ? `, ${e.complemento}` : ""}, ${e.bairro}, ${e.cidade}/${e.uf.toUpperCase()}, CEP ${formatarCep(e.cep)}`;

const valorAcessorio = (a?: { valor_centavos: number }) =>
  !a ? "" : a.valor_centavos ? formatarMoeda(a.valor_centavos) : "R$ 0,00 (BONIFICAÇÃO)";

const EXT = (centavos: number) => valorPorExtenso(centavos).toUpperCase();

export function textoPrazoEntrega(p: DadosContrato["prazo_entrega"], apos = ""): string {
  if (p.tipo === "pronta_entrega") return "PRONTA ENTREGA";
  const tipo = p.tipo === "dias_uteis" ? "DIAS ÚTEIS" : "DIAS CORRIDOS";
  return `${p.dias} (${inteiroPorExtenso(p.dias!).toUpperCase()}) ${tipo}${apos ? ` ${apos.toUpperCase()}` : ""}`;
}

export function montarVariaveis(p: {
  numero: string;
  data_contrato: string;
  dados: DadosContrato;
  pagamento: ResultadoPagamento;
  vendedor: DadosVendedor;
}): Record<NomeVariavel, string> {
  const { dados: d, pagamento: pg } = p;
  const c = d.contratante;
  const pf = c.tipo_pessoa === "PF";
  const doc = pf ? formatarCpf(c.documento) : formatarCnpj(c.documento);
  const campos = pg.campos!;
  const sig = (i: number) => d.signatarios[i];
  const g = d.garantidor;
  const t = d.testemunha_cliente;
  const v = p.vendedor;
  const entrega = d.endereco_entrega ?? c.endereco;
  const acessorio = (i: number) => d.acessorios[i];
  const q = d.equipamento.quantidade ?? 1;

  return {
    CONTRATO_NUMERO: p.numero,
    CONTRATO_DATA: dataPorExtenso(p.data_contrato),
    CONTRATO_CIDADE: EMPRESA.cidade_uf,
    CONTRATADA_RAZAO_SOCIAL: EMPRESA.razao_social,
    CONTRATADA_CNPJ: EMPRESA.cnpj,
    CONTRATANTE_RAZAO_SOCIAL: c.razao_social.toUpperCase(),
    CONTRATANTE_NOME_FANTASIA: c.nome_fantasia ?? "",
    CONTRATANTE_TIPO_DOCUMENTO: pf ? "CPF" : "CNPJ",
    CONTRATANTE_DOCUMENTO: doc,
    CONTRATANTE_CPF_CNPJ: `${pf ? "CPF" : "CNPJ"} ${doc}`,
    CONTRATANTE_IE: c.inscricao_estadual?.trim() || (pf ? "--" : "ISENTO"),
    CONTRATANTE_ENDERECO: linhaEndereco(c.endereco),
    CONTRATANTE_CIDADE_UF: `${c.endereco.cidade}/${c.endereco.uf.toUpperCase()}`,
    CONTRATANTE_CEP: formatarCep(c.endereco.cep),
    CONTRATANTE_EMAIL: c.email.trim().toLowerCase(),
    CONTRATANTE_TELEFONE: c.telefone,
    SIGNATARIOS: d.signatarios
      .map((s) => `${s.nome.toUpperCase()}, ${s.cargo}, inscrito(a) no CPF sob o nº ${formatarCpf(s.cpf)}`)
      .join(";\n"),
    SIGNATARIO_1_NOME: sig(0)?.nome.toUpperCase() ?? "",
    SIGNATARIO_1_CPF: sig(0) ? formatarCpf(sig(0).cpf) : "",
    SIGNATARIO_1_CARGO: sig(0)?.cargo ?? "",
    SIGNATARIO_1_EMAIL: sig(0)?.email.toLowerCase() ?? "",
    SIGNATARIO_2_NOME: sig(1)?.nome.toUpperCase() ?? "",
    SIGNATARIO_2_CPF: sig(1) ? formatarCpf(sig(1).cpf) : "",
    SIGNATARIO_2_CARGO: sig(1)?.cargo ?? "",
    EQUIPAMENTO_MODELO: d.equipamento.modelo,
    EQUIPAMENTO_DESCRICAO: d.equipamento.descricao ?? d.equipamento.modelo,
    IV3_PRECO_AQUISICAO: formatarMoeda(d.equipamento.preco_centavos),
    IV3_PRECO_AQUISICAO_EXTENSO: EXT(d.equipamento.preco_centavos),
    IV4_ACESSORIOS: d.acessorios.length
      ? d.acessorios.map((a) => `${a.descricao.toUpperCase()} — ${a.valor_centavos ? formatarMoeda(a.valor_centavos) : "R$ 0,00 (BONIFICAÇÃO)"}`).join("\n")
      : "--",
    IV5_PRECO_TOTAL: formatarMoeda(d.preco_total_centavos),
    IV5_PRECO_TOTAL_EXTENSO: EXT(d.preco_total_centavos),
    IV6_VALOR_ENTRADA: campos.valor_entrada,
    IV7_PRAZO_ENTREGA: textoPrazoEntrega(d.prazo_entrega, pg.condicao?.prazo_entrega_apos),
    IV10_VALOR_PARCELA: campos.valor_parcela,
    IV11_FORMA_PAGAMENTO: campos.forma_pagamento,
    IV12_QTD_PRESTACOES: campos.quantidade_prestacoes,
    RESPONSAVEL_FRETE: d.responsavel_frete,
    RESPONSAVEL_INSTALACAO: d.responsavel_instalacao,
    CONDICAO_PAGAMENTO: campos.condicao_resumo,
    CLAUSULA_PAGAMENTO: campos.clausula,
    ENDERECO_ENTREGA: d.endereco_entrega ? linhaEndereco(d.endereco_entrega) : "O mesmo endereço do CONTRATANTE",
    VENDEDOR_NOME: v.nome,
    CONTRATANTE_ENDERECO_SEDE: `${c.endereco.logradouro}, ${c.endereco.numero}${c.endereco.complemento ? `, ${c.endereco.complemento}` : ""} — CEP ${formatarCep(c.endereco.cep)}`,
    CONTRATANTE_BAIRRO: c.endereco.bairro,
    COMPRADOR_NOME: sig(0)?.nome.toUpperCase() ?? "",
    COMPRADOR_CPF: sig(0) ? formatarCpf(sig(0).cpf) : "",
    GARANTIDOR_NOME: g.nome.toUpperCase(),
    GARANTIDOR_CPF: formatarCpf(g.cpf),
    GARANTIDOR_EMAIL: g.email.trim().toLowerCase(),
    GARANTIDOR_ENDERECO: linhaEndereco(g.endereco),
    EQUIPAMENTO_POTENCIA: d.equipamento.potencia.toUpperCase(),
    EQUIPAMENTO_MARCA_LASER: d.equipamento.marca_laser.toUpperCase(),
    EQUIPAMENTO_QUANTIDADE: `${String(q).padStart(2, "0")} (${inteiroPorExtenso(q).toUpperCase()})`,
    ENTREGA_CIDADE: `${entrega.cidade}/${entrega.uf.toUpperCase()}`,
    ENTREGA_ENDERECO: linhaEndereco(entrega),
    ACESSORIO_1: acessorio(0)?.descricao.toUpperCase() ?? "--",
    ACESSORIO_1_VALOR: valorAcessorio(acessorio(0)),
    ACESSORIO_2: acessorio(1)?.descricao.toUpperCase() ?? "--",
    ACESSORIO_2_VALOR: valorAcessorio(acessorio(1)),
    ACESSORIO_3: acessorio(2)?.descricao.toUpperCase() ?? "--",
    ACESSORIO_3_VALOR: valorAcessorio(acessorio(2)),
    ACESSORIO_4: acessorio(3)?.descricao.toUpperCase() ?? "--",
    ACESSORIO_4_VALOR: valorAcessorio(acessorio(3)),
    TESTEMUNHA_CLIENTE_NOME: t.nome.toUpperCase(),
    TESTEMUNHA_CLIENTE_CPF: formatarCpf(t.cpf),
    TESTEMUNHA_CLIENTE_EMAIL: t.email.trim().toLowerCase(),
    TESTEMUNHA_CLIENTE_CELULAR: t.celular,
    TESTEMUNHA_ECNC_NOME: v.nome.toUpperCase(),
    TESTEMUNHA_ECNC_CPF: v.cpf ? formatarCpf(v.cpf) : "",
    TESTEMUNHA_ECNC_EMAIL: v.email?.trim().toLowerCase() ?? "",
    TESTEMUNHA_ECNC_CELULAR: v.celular ?? "",
  };
}
