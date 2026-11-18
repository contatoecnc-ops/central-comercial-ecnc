/**
 * CONDIÇÕES DE PAGAMENTO PERMITIDAS
 * ------------------------------------------------------------------
 * Toda condição tem a mesma estrutura:
 *   ENTRADA  — quanto, por qual meio, paga na assinatura (antes da saída da máquina)
 *   SALDO    — meio (boleto, cartão, financiamento), parcelas e o GATILHO
 *              do 1º vencimento (assinatura, emissão da NF ou recebimento da máquina)
 *   NÍVEL    — Padrão / Atenção / Atenção máxima. Sobe sozinho quando algo foge do padrão.
 *
 * O vendedor escolhe a condição e informa só os números. Forma de pagamento,
 * valor da parcela, quantidade de prestações e extensos são CALCULADOS —
 * ninguém digita. Por isso "cartão" nunca mais sai como "boleto".
 *
 * ⚠️ Os limites e textos abaixo partem do que foi dito (até 15 boletos padrão,
 *    até 18 em exceção; 1º boleto padrão 30 dias, máx. 45; faturado = atenção máxima).
 *    A regra de entrada (30%–50% sobre o valor À VISTA) depende da tabela de
 *    parcelamento e ainda não está aplicada.
 *    Tudo marcado `exemplo: true` precisa ser confirmado.
 */

export type Exigencia = "obrigatorio" | "opcional" | "proibido";
export type MeioSaldo = "boleto" | "cartao" | "financiamento";
/** A partir de quando conta o 1º vencimento do saldo. */
export type Gatilho = "assinatura" | "emissao_nf" | "recebimento";
export type Nivel = 1 | 2 | 3;

export const NOME_MEIO: Record<MeioSaldo | "pix_ted", string> = {
  pix_ted: "PIX",
  boleto: "BOLETO",
  cartao: "CARTÃO DE CRÉDITO",
  financiamento: "FINANCIAMENTO BANCÁRIO",
};

export const TEXTO_GATILHO: Record<Gatilho, string> = {
  assinatura: "da assinatura deste contrato",
  emissao_nf: "da emissão da nota fiscal",
  recebimento: "do recebimento do equipamento pelo COMPRADOR",
};

/**
 * Nível de ATENÇÃO do contrato. Não muda quem aprova (sempre o gestor comercial,
 * ver APROVACAO em empresa.ts) — serve para sinalizar no índice, no nome do arquivo
 * e para decidir o que passa por aprovação quando o modo for "atencao".
 */
export const NIVEIS: Record<Nivel, { nome: string; descricao: string }> = {
  1: { nome: "Padrão", descricao: "Dentro da política." },
  2: { nome: "Atenção", descricao: "Fora do padrão em algum ponto — conferir com cuidado antes de assinar." },
  3: { nome: "Atenção máxima", descricao: "Máquina sai sem pagamento garantido. Documentos conferidos antes da aprovação." },
};

export interface Escalonamento {
  quando: "entrada_abaixo_percent" | "parcelas_acima" | "dias_primeira_acima" | "valor_total_acima_centavos";
  valor: number;
  nivel: Nivel;
  motivo: string;
}

export interface CondicaoPagamento {
  id: string;
  nome: string;
  descricao: string;
  entrada: {
    exigencia: Exigencia;
    min_percent?: number; // abaixo disso BLOQUEIA
    max_percent?: number;
  };
  /** null = não tem saldo (100% na entrada). */
  saldo: null | {
    meio: MeioSaldo;
    gatilho: Gatilho;
    parcelas_min: number;
    parcelas_max: number; // acima disso BLOQUEIA
    intervalo_dias?: number;
    dias_primeira_padrao?: number;
    dias_primeira_max?: number; // acima disso BLOQUEIA
    parcela_minima_centavos?: number;
    max_cartoes?: number;
    bancos_aceitos?: string[];
  };
  nivel_base: Nivel;
  escalonar?: Escalonamento[];
  /** Documentos que precisam ser conferidos antes da aprovação. */
  documentos?: string[];
  /** De quando conta o prazo de entrega nesta condição (sai no IV.7). */
  prazo_entrega_apos: string;
  /** Texto da cláusula. Marcadores: ver lib/pagamento.ts (preencherClausula). */
  clausula: string;
  pontos_atencao: string[];
  exemplo?: boolean;
}

export const CONDICOES: CondicaoPagamento[] = [
  {
    id: "a_vista",
    prazo_entrega_apos: "após a compensação integral do pagamento",
    nome: "À vista (PIX/TED)",
    descricao: "100% por PIX/TED na assinatura, antes da saída do equipamento.",
    entrada: { exigencia: "obrigatorio", min_percent: 100, max_percent: 100 },
    saldo: null,
    nivel_base: 1,
    clausula:
      "O CONTRATANTE pagará o preço total de {TOTAL} ({TOTAL_EXTENSO}) à vista, {ENTRADA_FORMA}, em conta de titularidade da CONTRATADA. A liberação do equipamento fica condicionada à compensação integral do pagamento.",
    pontos_atencao: ["Pagamento só em conta de titularidade da Inovus — nunca de terceiros."],
    exemplo: true,
  },
  {
    id: "entrada_boleto_nf",
    prazo_entrega_apos: "após a compensação integral da entrada",
    nome: "Entrada + saldo em boleto após a NF",
    descricao: "Entrada por PIX na assinatura e saldo em boletos com 1º vencimento contado da emissão da nota fiscal (padrão 30 dias).",
    // Sem mínimo sobre o total: os 30%–50% são sobre o valor à vista (regra pendente da tabela de parcelamento).
    entrada: { exigencia: "obrigatorio", max_percent: 99 },
    saldo: {
      meio: "boleto",
      gatilho: "emissao_nf",
      parcelas_min: 1,
      parcelas_max: 18,
      intervalo_dias: 30,
      dias_primeira_padrao: 30,
      dias_primeira_max: 45,
      parcela_minima_centavos: 50000,
    },
    nivel_base: 1,
    escalonar: [
      { quando: "parcelas_acima", valor: 15, nivel: 2, motivo: "Saldo em mais de 15 boletos (exceção rara)." },
      { quando: "dias_primeira_acima", valor: 30, nivel: 2, motivo: "1º boleto com mais de 30 dias após a NF (exceção)." },
    ],
    clausula:
      "O CONTRATANTE pagará o preço total de {TOTAL} ({TOTAL_EXTENSO}) da seguinte forma: (i) entrada de {ENTRADA} ({ENTRADA_EXTENSO}), correspondente a {ENTRADA_PERCENT} do preço total, {ENTRADA_FORMA}; e (ii) saldo de {SALDO} ({SALDO_EXTENSO}) em {PARCELAS} ({PARCELAS_EXTENSO}) parcela(s) por boleto bancário, {PARCELAS_VALORES}, vencendo a primeira {PRIMEIRO_VENCIMENTO}{INTERVALO_FRASE}. A emissão da nota fiscal e a liberação do equipamento ficam condicionadas à compensação integral da entrada.",
    pontos_atencao: [
      "Padrão até 15 boletos; 16 a 18 só em exceção.",
      "1º boleto em 30 dias da NF; prazo maior é exceção (máx. 45 dias).",
    ],
    exemplo: true,
  },
  {
    id: "cartao",
    prazo_entrega_apos: "após a aprovação do pagamento",
    nome: "Cartão de crédito",
    descricao: "Total no cartão em até 12x, em até 2 cartões, sem entrada. Acréscimo da operadora informado à parte.",
    entrada: { exigencia: "proibido" },
    saldo: { meio: "cartao", gatilho: "assinatura", parcelas_min: 1, parcelas_max: 12, max_cartoes: 2 },
    nivel_base: 1,
    clausula:
      "O CONTRATANTE pagará o preço total de {TOTAL} ({TOTAL_EXTENSO}), já incluído o acréscimo de parcelamento de {ACRESCIMO_CARTAO}, por cartão de crédito em {PARCELAS} ({PARCELAS_EXTENSO}) parcela(s){CARTOES_FRASE}, na assinatura deste contrato, por meio de link ou máquina de cartão da CONTRATADA. A liberação do equipamento fica condicionada à aprovação da transação pela operadora.",
    pontos_atencao: [
      "Forma de pagamento sai CARTÃO DE CRÉDITO automaticamente — nunca boleto.",
      "O acréscimo do cartão precisa estar explícito; ele entra no preço total.",
    ],
    exemplo: true,
  },
  {
    id: "financiamento",
    prazo_entrega_apos: "após a compensação integral da entrada, quando houver, e a liberação do financiamento",
    nome: "Financiamento bancário (BNDES/Finame ou banco)",
    descricao: "Saldo pago pela instituição financeira; entrada por PIX opcional.",
    entrada: { exigencia: "opcional", min_percent: 0, max_percent: 50 },
    saldo: {
      meio: "financiamento",
      gatilho: "assinatura",
      parcelas_min: 1,
      parcelas_max: 1,
      bancos_aceitos: ["BNDES/Finame", "Banco do Brasil", "Caixa", "Bradesco", "Itaú", "Santander", "Sicoob", "Sicredi"],
    },
    nivel_base: 1,
    documentos: ["Carta de crédito ou aprovação do banco"],
    clausula:
      "O CONTRATANTE pagará o preço total de {TOTAL} ({TOTAL_EXTENSO}) {ENTRADA_FRASE}mediante financiamento junto a {BANCO}, que repassará o valor financiado diretamente à CONTRATADA. A liberação do equipamento fica condicionada ao crédito integral do valor financiado.",
    pontos_atencao: ["Conferir se o modelo da máquina é credenciado no Finame antes de prometer essa linha."],
    exemplo: true,
  },
  {
    id: "faturado_recebimento",
    prazo_entrega_apos: "após a aprovação do pedido",
    nome: "Faturado — boleto após o recebimento (grandes empresas)",
    descricao: "Sem entrada. Boleto com vencimento contado do recebimento da máquina. Exceção para empresas grandes; exige documentação e dupla aprovação.",
    entrada: { exigencia: "proibido" },
    saldo: {
      meio: "boleto",
      gatilho: "recebimento",
      parcelas_min: 1,
      parcelas_max: 3,
      intervalo_dias: 30,
      dias_primeira_padrao: 30,
      dias_primeira_max: 30,
    },
    nivel_base: 3,
    documentos: [
      "Cartão CNPJ atualizado",
      "Contrato social / última alteração",
      "Consulta de crédito (Serasa/SPC) aprovada",
      "Pedido de compra (PO) formal assinado pelo cliente",
      "Cadastro de fornecedor aprovado no cliente (se houver)",
    ],
    clausula:
      "O CONTRATANTE pagará o preço total de {TOTAL} ({TOTAL_EXTENSO}) em {PARCELAS} ({PARCELAS_EXTENSO}) parcela(s) por boleto bancário, {PARCELAS_VALORES}, vencendo a primeira {PRIMEIRO_VENCIMENTO}{INTERVALO_FRASE}. O recebimento será comprovado pelo canhoto da nota fiscal ou documento de entrega assinado.",
    pontos_atencao: [
      "A máquina sai SEM nenhum pagamento — documentos conferidos antes da aprovação.",
      "Se o cliente não assinar o contrato, o pedido de compra (PO) formal é o documento que vale.",
    ],
    exemplo: true,
  },
];

/**
 * ENTRADA EM MAIS DE UM PAGAMENTO (ex.: sinal + restante).
 * Regra fixa: TUDO que está no IV.6 precisa estar compensado antes da saída
 * da máquina — o prazo de entrega só conta depois do último pagamento da entrada.
 * ⚠️ Limites de exemplo — confirmar.
 */
export const ENTRADA_PARCELADA = {
  max_pagamentos: 3,
  /** Último pagamento da entrada depois disso (dias após o contrato) = Atenção. */
  ultimo_dias_atencao: 30,
  /** Depois disso bloqueia. */
  ultimo_dias_max: 60,
};

/**
 * 1º BOLETO COM DATA FIXA (em vez de "N dias após a NF").
 * Permitido, mas sempre vira ATENÇÃO para o gestor: a data da NF não é conhecida
 * no contrato, então o boleto pode vencer antes ou muito depois da entrega.
 * ⚠️ Limite de exemplo — confirmar.
 */
export const PRIMEIRO_BOLETO_DATA_FIXA = {
  /** Data fixa depois disso (dias após o contrato) bloqueia. */
  max_dias_apos_contrato: 90,
};

export const NOME_MEIO_ENTRADA = { pix: "PIX", transferencia: "TRANSFERÊNCIA BANCÁRIA", boleto: "BOLETO" } as const;
export type MeioEntrada = keyof typeof NOME_MEIO_ENTRADA;

export const buscarCondicao = (id: string) => CONDICOES.find((c) => c.id === id);

/** Acréscimo de cartão por nº de parcelas (% sobre o preço). Deixe vazio para só exigir que seja informado. ⚠️ CONFIRMAR */
export const TABELA_ACRESCIMO_CARTAO: Record<number, number> = {};
