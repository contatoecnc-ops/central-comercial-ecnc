/**
 * Regras puras da análise de crédito (sem acesso a dados; seguras para cliente e servidor).
 * Nada aqui altera o pacote do agente: só lê a config de condições e as funções de CPF/CNPJ e datas.
 */
import { buscarCondicao } from "@/lib/agente-contratos/config/condicoes-pagamento";
import { cnpjValido, cpfValido, somenteDigitos } from "@/lib/agente-contratos/lib/documentos";
import { hojeBrasilia, somarDias } from "@/lib/agente-contratos/lib/formatacao";
import { ANALISE_VALIDADE_PADRAO_DIAS } from "@/lib/contratos-config";

export type EstadoAnalise = "aprovada" | "reprovada" | "vencida";
/** "sem" = contrato parcelado sem análise vinculada. Contrato à vista não tem selo (null). */
export type EstadoSelo = EstadoAnalise | "sem";
export interface SeloAnalise { estado: EstadoSelo; validade?: string }

export interface AnaliseResumo {
  id: string;
  resultado: "aprovada" | "reprovada";
  analisada_em: string;
  validade_ate: string;
  created_at: string;
}

export { somenteDigitos, hojeBrasilia };

/**
 * Contrato com saldo parcelado em boleto — o caso em que a ECNC entrega a máquina antes de receber tudo e,
 * por isso, o financeiro analisa o crédito. Vem da config de condições (saldo.meio), nunca de nomes de condição escritos à mão;
 * cartão (a operadora paga) e financiamento (o banco paga) não entram.
 */
export function contratoParcelado(condicaoId: string, pagamento?: { parcelas?: number | null } | null): boolean {
  const saldo = buscarCondicao(condicaoId)?.saldo;
  if (!saldo || saldo.meio !== "boleto") return false;
  const parcelas = pagamento?.parcelas;
  return parcelas === undefined || parcelas === null || parcelas > 0;
}

export const documentoValido = (d: string) => {
  const dig = somenteDigitos(d);
  return dig.length === 11 ? cpfValido(dig) : dig.length === 14 ? cnpjValido(dig) : false;
};

// CPF mostra só os 6 do meio; CNPJ mostra os 2 primeiros e os 2 últimos dígitos (o bastante para reconhecer).
export function mascararDocumento(d: string): string {
  const x = somenteDigitos(d);
  if (x.length === 11) return `***.${x.slice(3, 6)}.${x.slice(6, 9)}-**`;
  if (x.length === 14) return `${x.slice(0, 2)}.***.***/****-${x.slice(12)}`;
  return "—";
}

/** Validade digitada no envio, ou 60 dias a partir da data da análise quando em branco. */
export const validadeEfetiva = (analisadaEm: string, validadeDigitada?: string | null) =>
  validadeDigitada && validadeDigitada.trim() ? validadeDigitada : somarDias(analisadaEm, ANALISE_VALIDADE_PADRAO_DIAS);

export function estadoAnalise(a: Pick<AnaliseResumo, "resultado" | "validade_ate">, hoje = hojeBrasilia()): EstadoAnalise {
  if (a.validade_ate < hoje) return "vencida"; // passou da validade: vale a do PDF
  return a.resultado;
}

/** A mais recente (por analisada_em, depois created_at). */
export function maisRecente<T extends Pick<AnaliseResumo, "analisada_em" | "created_at">>(lista: T[]): T | null {
  return [...lista].sort((a, b) => (a.analisada_em === b.analisada_em ? b.created_at.localeCompare(a.created_at) : b.analisada_em.localeCompare(a.analisada_em)))[0] ?? null;
}

/** Selo de um contrato parcelado a partir das análises vinculadas (a mais recente governa). */
export function seloDe(vinculadas: AnaliseResumo[], hoje = hojeBrasilia()): SeloAnalise {
  const a = maisRecente(vinculadas);
  if (!a) return { estado: "sem" };
  return { estado: estadoAnalise(a, hoje), validade: a.validade_ate };
}

/** Conjunto de documentos (só dígitos) que liga uma análise a um contrato: comprador, signatários e garantidor. */
export function documentosDoContrato(dados: unknown): string[] {
  const d = (dados ?? {}) as {
    contratante?: { documento?: string };
    signatarios?: { cpf?: string }[];
    garantidor?: { cpf?: string };
  };
  const todos = [d.contratante?.documento, ...(d.signatarios ?? []).map((s) => s?.cpf), d.garantidor?.cpf]
    .map((x) => somenteDigitos(x ?? ""))
    .filter((x) => x.length === 11 || x.length === 14);
  return Array.from(new Set(todos));
}

/** Motivo (para o botão e a rota de aprovar) quando a análise é obrigatória e não está em ordem; null = liberado. */
export function motivoBloqueioAprovacao(parcelado: boolean, selo: SeloAnalise | null, obrigatoria: boolean): string | null {
  if (!obrigatoria || !parcelado) return null;
  const e = selo?.estado ?? "sem";
  if (e === "aprovada") return null;
  if (e === "sem") return "Contrato parcelado sem análise de crédito vinculada.";
  if (e === "vencida") return "A análise de crédito vinculada está vencida.";
  return "A análise de crédito vinculada foi reprovada.";
}

export const ROTULO_ESTADO_ADMIN: Record<EstadoSelo, string> = {
  aprovada: "aprovada", reprovada: "reprovada", vencida: "vencida", sem: "sem análise de crédito",
};
/** Texto do selo para o vendedor: só isto, sem validade nem PDF. */
export const ROTULO_ESTADO_VENDEDOR: Record<EstadoSelo, string> = {
  aprovada: "aprovada", reprovada: "reprovada", vencida: "vencida", sem: "pendente",
};

/** "2026-12-15" → "15/12/2026" (sem fuso: é só uma data de calendário). */
export const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Máscara progressiva de CPF (até 11 dígitos) ou CNPJ (12 a 14). */
export function mascararEntrada(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4").replace(/\/(\d{4})(\d)/, "/$1-$2");
}
