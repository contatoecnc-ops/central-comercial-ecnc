import {
  buscarCondicao, CONDICOES, ENTRADA_PARCELADA, PRIMEIRO_BOLETO_DATA_FIXA, NOME_MEIO, NOME_MEIO_ENTRADA, TABELA_ACRESCIMO_CARTAO, TEXTO_GATILHO,
  type CondicaoPagamento, type MeioEntrada, type Nivel,
} from "../config/condicoes-pagamento";
import { dataIsoValida, diasEntre, formatarData, formatarMoeda, hojeBrasilia, inteiroPorExtenso, valorPorExtenso } from "./formatacao";

/** assinatura = data do contrato; data = data combinada; fim_fabricacao = restante na finalização da fabricação. */
export type MomentoEntrada = "assinatura" | "data" | "fim_fabricacao";

export interface PagamentoEntrada { valor_centavos: number; momento?: MomentoEntrada; data?: string; meio?: MeioEntrada }

/** Pagamento da entrada já resolvido: "assinatura" ganha a data do contrato; "fim_fabricacao" não tem data. */
export interface PagamentoEntradaResolvido { valor_centavos: number; meio: MeioEntrada; momento: MomentoEntrada; data?: string }

export interface EntradaPagamento {
  condicao: string;
  preco_total_centavos: number;
  /** Equipamento + acessórios, sem acréscimo de cartão. */
  preco_base_centavos?: number;
  entrada_centavos?: number;
  entrada_pagamentos?: PagamentoEntrada[];
  /** AAAA-MM-DD. Padrão: hoje em Brasília. */
  data_contrato?: string;
  parcelas?: number;
  dias_primeira_parcela?: number;
  primeiro_vencimento_data?: string;
  banco?: string;
  acrescimo_cartao_centavos?: number;
  divisao_cartoes_centavos?: number[];
}

export interface ResultadoPagamento {
  ok: boolean;
  erros: string[];
  alertas: string[];
  condicao?: CondicaoPagamento;
  entrada_centavos: number;
  /** Pagamentos da entrada (1 = único, na assinatura). */
  entrada_pagamentos: PagamentoEntradaResolvido[];
  saldo_centavos: number;
  /** Valor de cada parcela (a 1ª pode ter alguns centavos a mais). */
  parcelas_centavos: number[];
  dias_primeira?: number;
  /** Quando o 1º boleto tem data fixa. */
  primeiro_vencimento_data?: string;
  nivel: Nivel;
  motivos_nivel: string[];
  documentos: string[];
  /** Campos do quadro do contrato, já prontos. */
  campos?: {
    forma_pagamento: string;
    valor_entrada: string;
    valor_parcela: string;
    quantidade_prestacoes: string;
    condicao_resumo: string;
    clausula: string;
  };
}

const pct = (parte: number, total: number) => (total ? (parte / total) * 100 : 0);
const fmtPct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/** Divide em N parcelas exatas; os centavos que sobram vão na 1ª. */
export function dividirParcelas(saldo: number, n: number): number[] {
  const base = Math.floor(saldo / n);
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? saldo - base * n : 0));
}

/** "R$ 1.373,33" ou "1ª de R$ 1.373,38 e 14 de R$ 1.373,33" — nunca deixa centavo sobrando. */
export function descreverParcelas(p: number[]): string {
  if (!p.length) return "--";
  if (p.every((v) => v === p[0])) return formatarMoeda(p[0]);
  return `1ª de ${formatarMoeda(p[0])} e ${p.length - 1} de ${formatarMoeda(p[1])}`;
}

export function calcularPagamento(e: EntradaPagamento): ResultadoPagamento {
  const erros: string[] = [];
  const alertas: string[] = [];
  const motivos: string[] = [];
  const res = (extra: Partial<ResultadoPagamento> = {}): ResultadoPagamento => ({
    ok: false, erros, alertas, entrada_centavos: 0, entrada_pagamentos: [], saldo_centavos: 0, parcelas_centavos: [],
    nivel: 1, motivos_nivel: motivos, documentos: [], ...extra,
  });

  const c = buscarCondicao(e.condicao);
  if (!c) {
    erros.push(`Condição "${e.condicao}" não é permitida. Opções: ${CONDICOES.map((x) => `${x.id} (${x.nome})`).join(", ")}.`);
    return res();
  }
  const total = e.preco_total_centavos;
  if (!total || total <= 0) erros.push("Preço total precisa ser maior que zero.");

  // ---------- Entrada ----------
  // À vista: se o vendedor não informou, a entrada é o próprio total.
  const vista = c.saldo === null;
  const hoje = e.data_contrato ?? hojeBrasilia();
  const pags = e.entrada_pagamentos ?? [];
  const somaPags = pags.reduce((a, p) => a + p.valor_centavos, 0);
  // Se veio só a lista de pagamentos, a entrada é a soma deles.
  if (pags.length && !e.entrada_centavos && !vista) e = { ...e, entrada_centavos: somaPags };
  const temEntrada = !!e.entrada_centavos || vista;
  if (c.entrada.exigencia === "obrigatorio" && !temEntrada) erros.push(`"${c.nome}" exige valor de entrada.`);
  if (c.entrada.exigencia === "proibido" && temEntrada) erros.push(`"${c.nome}" não tem entrada — remova o valor de entrada ou escolha outra condição.`);
  const entrada = c.entrada.exigencia === "proibido" ? 0 : vista ? e.entrada_centavos ?? total : e.entrada_centavos ?? 0;
  const percEntrada = pct(entrada, total);
  if (entrada > total) erros.push("Entrada maior que o preço total.");
  if (c.entrada.exigencia !== "proibido" && (temEntrada || c.entrada.exigencia === "obrigatorio")) {
    if (c.entrada.min_percent !== undefined && percEntrada + 1e-9 < c.entrada.min_percent)
      erros.push(`Entrada de ${fmtPct(percEntrada)} abaixo do mínimo de ${c.entrada.min_percent}% para "${c.nome}" (mínimo ${formatarMoeda(Math.ceil((total * c.entrada.min_percent) / 100))}).`);
    if (c.entrada.max_percent !== undefined && percEntrada > c.entrada.max_percent + 1e-9)
      erros.push(c.saldo === null
        ? `"${c.nome}" é 100% na entrada.`
        : `Entrada de ${fmtPct(percEntrada)} acima do máximo de ${c.entrada.max_percent}% para "${c.nome}"${percEntrada >= 100 ? " — se é pagamento integral, use a condição à vista" : ""}.`);
  }
  const saldo = total - entrada;

  // ---------- Entrada em mais de um pagamento ----------
  let pagamentosEntrada: PagamentoEntradaResolvido[] = entrada > 0 ? [{ valor_centavos: entrada, data: hoje, meio: "pix", momento: "assinatura" }] : [];
  let diasUltimo = 0;
  let valorFimFabricacao = 0;
  if (pags.length) {
    if (c.entrada.exigencia === "proibido") erros.push(`"${c.nome}" não tem entrada — não informe pagamentos de entrada.`);
    else {
      if (pags.length > ENTRADA_PARCELADA.max_pagamentos) erros.push(`Entrada em no máximo ${ENTRADA_PARCELADA.max_pagamentos} pagamentos.`);
      if (somaPags !== entrada) erros.push(`Pagamentos da entrada somam ${formatarMoeda(somaPags)}, mas a entrada é ${formatarMoeda(entrada)}.`);
      // fim_fabricacao: no máximo um, e o último. Não entra nas regras de data.
      const momentos = pags.map((p) => p.momento ?? "data");
      const iFim = momentos.flatMap((m, i) => (m === "fim_fabricacao" ? [i] : []));
      if (iFim.length > 1) erros.push("Só pode haver um pagamento da entrada na finalização da fabricação.");
      else if (iFim.length === 1 && iFim[0] !== pags.length - 1)
        erros.push("O pagamento da entrada na finalização da fabricação precisa ser o último da lista.");
      if (iFim.length) valorFimFabricacao = pags[iFim[0]].valor_centavos;

      let anterior = hoje;
      const resolvidos: PagamentoEntradaResolvido[] = [];
      pags.forEach((p, i) => {
        const momento = momentos[i];
        const meio = p.meio ?? "pix";
        if (!p.valor_centavos) erros.push(`Pagamento ${i + 1} da entrada sem valor.`);
        if (momento === "fim_fabricacao") return void resolvidos.push({ valor_centavos: p.valor_centavos, meio, momento });
        const data = momento === "assinatura" ? hoje : p.data;
        if (!data) return void erros.push(`Pagamento ${i + 1} da entrada: informe a data (AAAA-MM-DD), ou use o momento "assinatura" ou "fim_fabricacao".`);
        if (!dataIsoValida(data)) return void erros.push(`Pagamento ${i + 1} da entrada: data "${data}" inválida (use AAAA-MM-DD).`);
        if (diasEntre(hoje, data) < 0) erros.push(`Pagamento ${i + 1} da entrada (${formatarData(data)}) é anterior à data do contrato.`);
        if (diasEntre(anterior, data) < 0) erros.push(`Pagamentos da entrada fora de ordem (${formatarData(data)}).`);
        anterior = data;
        resolvidos.push({ valor_centavos: p.valor_centavos, meio, momento, data });
      });
      // Último pagamento COM data (o de fim de fabricação é ignorado).
      const comData = resolvidos.filter((p) => p.data);
      const ultimo = comData.length ? comData[comData.length - 1].data : undefined;
      if (ultimo && dataIsoValida(ultimo)) {
        diasUltimo = diasEntre(hoje, ultimo);
        if (diasUltimo > ENTRADA_PARCELADA.ultimo_dias_max)
          erros.push(`A entrada só fica completa em ${diasUltimo} dias; o máximo é ${ENTRADA_PARCELADA.ultimo_dias_max} dias após o contrato.`);
      }
      pagamentosEntrada = resolvidos;
      if (valorFimFabricacao)
        alertas.push(`Parte da entrada (${formatarMoeda(valorFimFabricacao)}) só na finalização da fabricação — a máquina só sai com a entrada quitada integralmente.`);
      else if (pags.length > 1)
        alertas.push(`Entrada em ${pags.length} pagamentos: a máquina só sai depois da compensação do último (${ultimo && dataIsoValida(ultimo) ? formatarData(ultimo) : "?"}).`);
    }
  }

  // ---------- Saldo ----------
  let parcelas: number[] = [];
  let dias: number | undefined;
  let dataFixa: string | undefined;
  let motivoDataFixa: string | undefined;
  const s = c.saldo;
  if (!s) {
    if (e.parcelas) erros.push(`"${c.nome}" não tem parcelas.`);
  } else {
    const n = s.meio === "financiamento" ? 1 : e.parcelas ?? 0;
    if (s.meio !== "financiamento") {
      if (!n) erros.push(`Informe a quantidade de parcelas (${s.parcelas_min} a ${s.parcelas_max}).`);
      else if (n < s.parcelas_min || n > s.parcelas_max) erros.push(`"${c.nome}" aceita de ${s.parcelas_min} a ${s.parcelas_max} parcela(s) (pedido: ${n}).`);
    }
    if (s.meio === "boleto" && e.primeiro_vencimento_data) {
      const d = e.primeiro_vencimento_data;
      const comDataEntrada = pagamentosEntrada.filter((p) => p.data);
      const fimEntrada = comDataEntrada.length ? comDataEntrada[comDataEntrada.length - 1].data! : hoje;
      if (e.dias_primeira_parcela !== undefined) erros.push("Informe o 1º boleto OU em dias após a NF OU com data fixa — não os dois.");
      if (!dataIsoValida(d)) erros.push(`Data do 1º boleto "${d}" inválida (use AAAA-MM-DD).`);
      else if (diasEntre(fimEntrada, d) <= 0)
        erros.push(`1º boleto (${formatarData(d)}) precisa vencer depois ${comDataEntrada.length ? `do último pagamento da entrada (${formatarData(fimEntrada)})` : "da data do contrato"}.`);
      else if (diasEntre(hoje, d) > PRIMEIRO_BOLETO_DATA_FIXA.max_dias_apos_contrato)
        erros.push(`1º boleto em ${formatarData(d)} (${diasEntre(hoje, d)} dias após o contrato); o máximo com data fixa é ${PRIMEIRO_BOLETO_DATA_FIXA.max_dias_apos_contrato} dias.`);
      else {
        dataFixa = d;
        motivoDataFixa = `1º boleto com DATA FIXA (${formatarData(d)}) em vez de prazo ${TEXTO_GATILHO[s.gatilho]} — conferir se é compatível com a entrega e a emissão da NF.`;
      }
    } else if (s.meio === "boleto") {
      dias = e.dias_primeira_parcela ?? s.dias_primeira_padrao;
      if (dias === undefined) erros.push("Informe em quantos dias vence o 1º boleto.");
      else if (s.dias_primeira_max !== undefined && dias > s.dias_primeira_max)
        erros.push(`1º boleto em ${dias} dias; o máximo é ${s.dias_primeira_max} dias contados ${TEXTO_GATILHO[s.gatilho]}.`);
    } else if (e.dias_primeira_parcela !== undefined || e.primeiro_vencimento_data) {
      erros.push(`"${c.nome}" não usa prazo nem data para a 1ª parcela.`);
    }
    if (s.meio === "financiamento") {
      if (!e.banco) erros.push("Informe o banco/instituição do financiamento.");
      else if (s.bancos_aceitos && !s.bancos_aceitos.some((b) => b.toLowerCase() === e.banco!.toLowerCase()))
        erros.push(`Instituição "${e.banco}" não aceita. Opções: ${s.bancos_aceitos.join(", ")}.`);
    } else if (e.banco) erros.push(`"${c.nome}" não usa banco financiador.`);

    if (saldo <= 0) erros.push(`"${c.nome}" precisa ter saldo — se é tudo na entrada, use a condição à vista.`);
    else if (n > 0) {
      parcelas = dividirParcelas(saldo, n);
      if (s.parcela_minima_centavos && Math.min(...parcelas) < s.parcela_minima_centavos)
        erros.push(`Parcela de ${formatarMoeda(Math.min(...parcelas))} abaixo do mínimo de ${formatarMoeda(s.parcela_minima_centavos)}.`);
    }

    // Cartão
    if (s.meio === "cartao") {
      const acr = e.acrescimo_cartao_centavos ?? 0;
      if (e.preco_base_centavos !== undefined && e.preco_base_centavos + acr !== total)
        erros.push(`Preço total ${formatarMoeda(total)} ≠ equipamento + acessórios ${formatarMoeda(e.preco_base_centavos)} + acréscimo do cartão ${formatarMoeda(acr)}. Se há acréscimo da operadora, informe o valor dele.`);
      const tabela = TABELA_ACRESCIMO_CARTAO[n];
      if (tabela !== undefined && e.preco_base_centavos !== undefined) {
        const esperado = Math.round((e.preco_base_centavos * tabela) / 100);
        if (Math.abs(esperado - acr) > 1) erros.push(`Acréscimo para ${n}x deveria ser ${formatarMoeda(esperado)} (${tabela}%), informado ${formatarMoeda(acr)}.`);
      } else if (acr > 0 && e.preco_base_centavos) {
        alertas.push(`Acréscimo de cartão de ${formatarMoeda(acr)} (${fmtPct(pct(acr, e.preco_base_centavos))} sobre o preço) — conferir com a taxa da operadora.`);
      }
      const div = e.divisao_cartoes_centavos;
      if (div?.length) {
        if (s.max_cartoes && div.length > s.max_cartoes) erros.push(`Máximo de ${s.max_cartoes} cartões.`);
        const soma = div.reduce((a, b) => a + b, 0);
        if (soma !== total) erros.push(`Soma dos cartões ${formatarMoeda(soma)} ≠ preço total ${formatarMoeda(total)}.`);
      }
    } else {
      if (e.acrescimo_cartao_centavos) erros.push(`"${c.nome}" não é cartão — não pode ter acréscimo de cartão.`);
      if (e.divisao_cartoes_centavos?.length) erros.push(`"${c.nome}" não é cartão — não pode dividir em cartões.`);
    }
  }

  // ---------- Nível de aprovação ----------
  let nivel: Nivel = c.nivel_base;
  if (c.nivel_base > 1) motivos.push(`Condição "${c.nome}" é nível ${c.nivel_base} por natureza.`);
  for (const esc of c.escalonar ?? []) {
    const disparou =
      (esc.quando === "entrada_abaixo_percent" && percEntrada < esc.valor) ||
      (esc.quando === "parcelas_acima" && parcelas.length > esc.valor) ||
      (esc.quando === "dias_primeira_acima" && (dias ?? 0) > esc.valor) ||
      (esc.quando === "valor_total_acima_centavos" && total > esc.valor);
    if (disparou) {
      motivos.push(esc.motivo);
      if (esc.nivel > nivel) nivel = esc.nivel;
    }
  }
  if (motivoDataFixa) {
    motivos.push(motivoDataFixa);
    alertas.push(`Atenção do gestor: ${motivoDataFixa}`);
    if (nivel < 2) nivel = 2;
    // Com a entrada na finalização da fabricação não dá para conferir a ordem das datas.
    if (valorFimFabricacao)
      alertas.push("1º boleto com data fixa e entrada na finalização da fabricação — conferir se o boleto não vence antes da saída da máquina");
  }
  if (diasUltimo > ENTRADA_PARCELADA.ultimo_dias_atencao) {
    motivos.push(`Entrada só fica completa ${diasUltimo} dias após o contrato.`);
    if (nivel < 2) nivel = 2;
  }
  if (c.exemplo) alertas.push(`Condição "${c.nome}" ainda é EXEMPLO de configuração — confirmar regras e texto.`);

  const base = res({
    ok: erros.length === 0, condicao: c, entrada_centavos: entrada, entrada_pagamentos: pagamentosEntrada, saldo_centavos: saldo,
    parcelas_centavos: parcelas, dias_primeira: dias, primeiro_vencimento_data: dataFixa, nivel, documentos: c.documentos ?? [],
  });
  if (!base.ok) return base;

  // ---------- Campos prontos ----------
  const meio = s ? NOME_MEIO[s.meio] : NOME_MEIO.pix_ted;
  const n = parcelas.length;
  base.campos = {
    // IV.11: meio do SALDO + quando vence (o contrato não tem outro campo para isso).
    // A entrada já aparece no IV.6. À vista = PIX.
    forma_pagamento: textoIV11(meio, s, { parcelas, dias, dataFixa, banco: e.banco, cartoes: e.divisao_cartoes_centavos ?? [] }),
    valor_entrada: entrada > 0 ? textoIV6(entrada, pagamentosEntrada, hoje) : "SEM ENTRADA",
    valor_parcela: s && s.meio !== "financiamento" ? descreverParcelas(parcelas) : "--",
    quantidade_prestacoes: s && s.meio !== "financiamento" ? `${n}X` : "--",
    condicao_resumo: resumo(c, { entrada, saldo, parcelas, dias, dataFixa, banco: e.banco, formaEntrada: formaEntrada(pagamentosEntrada, hoje, false) }),
    clausula: preencherClausula(c, {
      total, entrada, saldo, parcelas, dias, dataFixa, banco: e.banco, formaEntrada: formaEntrada(pagamentosEntrada, hoje, true),
      acrescimo: e.acrescimo_cartao_centavos ?? 0, cartoes: e.divisao_cartoes_centavos ?? [],
    }),
  };
  return base;
}

const APOS_GATILHO = {
  assinatura: "APÓS A ASSINATURA",
  emissao_nf: "APÓS A EMISSÃO DA NOTA FISCAL",
  recebimento: "APÓS O RECEBIMENTO DO EQUIPAMENTO",
} as const;

/** IV.11 padronizado. Ex.: "BOLETO — 1ª EM 30 DIAS DA EMISSÃO DA NOTA FISCAL, DEMAIS A CADA 30 DIAS". */
function textoIV11(
  meio: string,
  s: CondicaoPagamento["saldo"],
  x: { parcelas: number[]; dias?: number; dataFixa?: string; banco?: string; cartoes: number[] },
): string {
  if (!s) return meio;
  if (s.meio === "financiamento") return `${meio} — ${(x.banco ?? "").toUpperCase()}`;
  if (s.meio === "cartao")
    return x.cartoes.length > 1 ? `${meio} — ${x.cartoes.length} CARTÕES (${x.cartoes.map(formatarMoeda).join(" + ")})` : meio;
  const primeira = x.dataFixa
    ? `1ª EM ${formatarData(x.dataFixa)}`
    : `1ª EM ${x.dias} DIAS ${APOS_GATILHO[s.gatilho]}`;
  const demais = x.parcelas.length > 1 && s.intervalo_dias ? `, DEMAIS A CADA ${s.intervalo_dias} DIAS` : "";
  return `${meio} — ${primeira}${demais}`;
}

const quandoData = (data: string, hoje: string, minusc: boolean) =>
  data === hoje ? (minusc ? "na assinatura deste contrato" : "NA ASSINATURA") : `${minusc ? "em" : "EM"} ${formatarData(data)}`;

/** Quando um pagamento da entrada é feito — "NA ASSINATURA", "EM 30/11/2026" ou na finalização da fabricação. */
const quando = (p: Pick<PagamentoEntradaResolvido, "data" | "momento">, hoje: string, minusc: boolean) =>
  p.momento === "fim_fabricacao"
    ? minusc ? "na finalização da fabricação, antes da saída do equipamento" : "NA FINALIZAÇÃO DA FABRICAÇÃO, ANTES DA SAÍDA DO EQUIPAMENTO"
    : quandoData(p.data ?? hoje, hoje, minusc);

/** IV.6 — texto padronizado; nunca copiado do vendedor. */
export function textoIV6(entrada: number, pags: PagamentoEntradaResolvido[], hoje: string): string {
  if (pags.length <= 1) {
    const p = pags[0] ?? { meio: "pix" as const, data: hoje, momento: "assinatura" as const };
    return `${formatarMoeda(entrada)} VIA ${NOME_MEIO_ENTRADA[p.meio]} ${quando(p, hoje, false)}`;
  }
  const linhas = pags.map((p, i) => `${i + 1}) ${formatarMoeda(p.valor_centavos)} VIA ${NOME_MEIO_ENTRADA[p.meio]} ${quando(p, hoje, false)}`);
  return [
    `${formatarMoeda(entrada)} EM ${pags.length} PAGAMENTOS:`,
    ...linhas,
    "SAÍDA DO EQUIPAMENTO SOMENTE APÓS A COMPENSAÇÃO INTEGRAL DA ENTRADA",
  ].join("\n");
}

/** Como a entrada é paga, em minúsculas (cláusula) ou frase curta (resumo). */
function formaEntrada(pags: PagamentoEntradaResolvido[], hoje: string, clausula: boolean): string {
  const meio = (m: MeioEntrada) => (m === "pix" ? "PIX" : m === "transferencia" ? "transferência bancária" : "boleto bancário");
  if (pags.length <= 1) {
    const p = pags[0];
    if (!p) return "";
    if (p.meio === "pix" && p.momento !== "fim_fabricacao" && p.data === hoje && clausula) return "por PIX ou transferência bancária na assinatura deste contrato";
    return `por ${meio(p.meio)} ${quando(p, hoje, true)}`;
  }
  const letras = "abcdefgh";
  return `em ${pags.length} (${inteiroPorExtenso(pags.length)}) pagamentos: ${pags
    .map((p, i) => `(${letras[i]}) ${formatarMoeda(p.valor_centavos)}${clausula ? ` (${valorPorExtenso(p.valor_centavos)})` : ""} por ${meio(p.meio)} ${quando(p, hoje, true)}`)
    .join("; ")}`;
}

function resumo(c: CondicaoPagamento, x: { entrada: number; saldo: number; parcelas: number[]; dias?: number; dataFixa?: string; banco?: string; formaEntrada: string }): string {
  const s = c.saldo;
  if (!s) return `À vista: ${formatarMoeda(x.entrada)} ${x.formaEntrada}.`;
  const ent = x.entrada ? `Entrada de ${formatarMoeda(x.entrada)} ${x.formaEntrada}. ` : "Sem entrada. ";
  if (s.meio === "financiamento") return `${ent}Saldo de ${formatarMoeda(x.saldo)} financiado por ${x.banco}.`;
  if (s.meio === "cartao") return `${ent}${formatarMoeda(x.saldo)} no cartão em ${x.parcelas.length}x de ${descreverParcelas(x.parcelas)}.`;
  return `${ent}Saldo de ${formatarMoeda(x.saldo)} em ${x.parcelas.length} boleto(s) de ${descreverParcelas(x.parcelas)}, 1º ${x.dataFixa ? `em ${formatarData(x.dataFixa)} (data fixa)` : `em ${x.dias} dias contados ${TEXTO_GATILHO[s.gatilho]}`}${x.parcelas.length > 1 ? `, demais a cada ${s.intervalo_dias} dias` : ""}.`;
}

function preencherClausula(
  c: CondicaoPagamento,
  x: { total: number; entrada: number; saldo: number; parcelas: number[]; dias?: number; dataFixa?: string; banco?: string; acrescimo: number; cartoes: number[]; formaEntrada: string },
): string {
  const n = x.parcelas.length;
  const s = c.saldo;
  const mapa: Record<string, string> = {
    TOTAL: formatarMoeda(x.total),
    TOTAL_EXTENSO: valorPorExtenso(x.total),
    ENTRADA: formatarMoeda(x.entrada),
    ENTRADA_EXTENSO: valorPorExtenso(x.entrada),
    ENTRADA_PERCENT: fmtPct(pct(x.entrada, x.total)),
    ENTRADA_FORMA: x.formaEntrada,
    SALDO: formatarMoeda(x.saldo),
    SALDO_EXTENSO: valorPorExtenso(x.saldo),
    PARCELAS: String(n),
    PARCELAS_EXTENSO: n ? inteiroPorExtenso(n) : "",
    PARCELAS_VALORES: n && x.parcelas.every((v) => v === x.parcelas[0])
      ? `cada uma no valor de ${formatarMoeda(x.parcelas[0])} (${valorPorExtenso(x.parcelas[0])})`
      : n ? `sendo a primeira de ${formatarMoeda(x.parcelas[0])} (${valorPorExtenso(x.parcelas[0])}) e as demais de ${formatarMoeda(x.parcelas[1])} (${valorPorExtenso(x.parcelas[1])})` : "",
    PRIMEIRO_VENCIMENTO: x.dataFixa
      ? `em ${formatarData(x.dataFixa)}`
      : x.dias !== undefined && s ? `em ${x.dias} (${inteiroPorExtenso(x.dias)}) dias contados ${TEXTO_GATILHO[s.gatilho]}` : "",
    DIAS_PRIMEIRA: String(x.dias ?? ""),
    DIAS_PRIMEIRA_EXTENSO: x.dias !== undefined ? inteiroPorExtenso(x.dias) : "",
    GATILHO: s ? TEXTO_GATILHO[s.gatilho] : "",
    INTERVALO_FRASE: n > 1 && s?.intervalo_dias ? `, e as demais a cada ${s.intervalo_dias} (${inteiroPorExtenso(s.intervalo_dias)}) dias` : "",
    BANCO: x.banco ?? "",
    ACRESCIMO_CARTAO: x.acrescimo ? `${formatarMoeda(x.acrescimo)} (${valorPorExtenso(x.acrescimo)})` : "R$ 0,00",
    CARTOES_FRASE: x.cartoes.length > 1
      ? `, dividido em ${x.cartoes.length} cartões: ${x.cartoes.map((v, i) => `cartão ${i + 1} no valor de ${formatarMoeda(v)}`).join(" e ")}`
      : "",
    ENTRADA_FRASE: x.entrada
      ? `mediante entrada de ${formatarMoeda(x.entrada)} (${valorPorExtenso(x.entrada)}) ${x.formaEntrada}, cuja compensação integral é condição para a liberação do equipamento, e saldo de ${formatarMoeda(x.saldo)} (${valorPorExtenso(x.saldo)}) `
      : "",
  };
  return c.clausula.replace(/\{([A-Z_]+)\}/g, (m, k) => (k in mapa ? mapa[k] : m));
}
