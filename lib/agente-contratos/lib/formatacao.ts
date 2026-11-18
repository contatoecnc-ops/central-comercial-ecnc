const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos",
  "setecentos", "oitocentos", "novecentos"];

/** 0–999 por extenso. */
function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10), u = resto % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(" e ");
}

const ESCALAS: [string, string][] = [
  ["", ""],
  ["mil", "mil"],
  ["milhão", "milhões"],
  ["bilhão", "bilhões"],
];

/** Número inteiro por extenso (pt-BR). */
export function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const grupos: number[] = [];
  let x = n;
  while (x > 0) { grupos.push(x % 1000); x = Math.floor(x / 1000); }

  const partes: { texto: string; valor: number }[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    let texto: string;
    if (i === 1) texto = g === 1 ? "mil" : `${ate999(g)} mil`;
    else if (i >= 2) texto = `${ate999(g)} ${g === 1 ? ESCALAS[i][0] : ESCALAS[i][1]}`;
    else texto = ate999(g);
    partes.push({ texto, valor: g });
  }
  // Regra do "e": o último grupo leva "e" se for < 100 ou centena redonda.
  let out = partes[0].texto;
  for (let k = 1; k < partes.length; k++) {
    const p = partes[k];
    const usaE = k === partes.length - 1 && (p.valor < 100 || p.valor % 100 === 0);
    out += usaE ? ` e ${p.texto}` : `, ${p.texto}`;
  }
  return out;
}

/** 123456789 centavos -> "um milhão, duzentos e trinta e quatro mil, quinhentos e sessenta e sete reais e oitenta e nove centavos" */
export function valorPorExtenso(centavosTotal: number): string {
  const reais = Math.floor(centavosTotal / 100);
  const cent = centavosTotal % 100;
  const partes: string[] = [];
  if (reais > 0) {
    const ext = inteiroPorExtenso(reais);
    // "um milhão de reais", "dois milhões de reais" (quando o valor termina em milhão/bilhão exato)
    const de = reais >= 1_000_000 && reais % 1_000_000 === 0 ? " de" : "";
    partes.push(`${ext}${de} ${reais === 1 ? "real" : "reais"}`);
  }
  if (cent > 0) partes.push(`${inteiroPorExtenso(cent)} ${cent === 1 ? "centavo" : "centavos"}`);
  if (!partes.length) return "zero real";
  return partes.join(" e ");
}

export function formatarMoeda(centavos: number): string {
  const reais = Math.floor(centavos / 100);
  const cent = String(centavos % 100).padStart(2, "0");
  return `R$ ${reais.toLocaleString("pt-BR").replace(/,/g, ".")},${cent}`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
  "setembro", "outubro", "novembro", "dezembro"];

/** "2026-11-12" -> "12/11/2026" */
export function formatarData(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** "2026-11-12" -> "12 de novembro de 2026" */
export function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

/** Hoje no horário de Brasília, em AAAA-MM-DD. */
export function hojeBrasilia(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

export function diasEntre(deIso: string, ateIso: string): number {
  const p = (s: string) => { const [a, m, d] = s.split("-").map(Number); return Date.UTC(a, m - 1, d); };
  return Math.round((p(ateIso) - p(deIso)) / 86_400_000);
}

export const dataIsoValida = (s?: string) =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) &&
  new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
