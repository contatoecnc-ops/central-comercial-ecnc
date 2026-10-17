import { normalizeName } from "@/lib/text";

export type Cell = number | string | boolean | Date | null;
export type Matrix = Cell[][];

/** Comparação de cabeçalhos/nomes: sem acento, sem pontuação, espaços colapsados, minúsculas. */
export function headerKey(s: unknown): string {
  return normalizeName(normalizeName(String(s ?? "")).replace(/[^a-z0-9\s%/]/g, " "));
}

/** Nome canônico (maiúsculas, sem acento, espaços colapsados) para agrupar vendedores/origens. */
export function canon(s: unknown): string {
  return normalizeName(String(s ?? "")).toUpperCase();
}

/** Número ou texto brasileiro ("R$ 1.234,56", "-1.234,56", "(1.234,56)"). Inválido/vazio → null. */
export function parseBRL(v: Cell | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1);
  }
  if (/^\d+\.\d{1,2}$/.test(s)) {
    // "1234.56": decimal com ponto
  } else if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) || /^\d+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    return null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const fromUTC = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/**
 * Data → "AAAA-MM-DD" em UTC (o fuso não desloca o dia).
 * Aceita Date (xlsx), número serial (Sheets, base 30/12/1899) e texto AAAA-MM-DD ou DD/MM/AAAA.
 */
export function parseDateUTC(v: Cell | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : fromUTC(v);
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 1 || v > 80000) return null;
    return fromUTC(new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000));
  }
  if (typeof v === "string") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
    const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v.trim());
    const [y, m, d] = iso ? [+iso[1], +iso[2], +iso[3]] : br ? [+br[3], +br[2], +br[1]] : [0, 0, 0];
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  return null;
}

/** Índice da coluna pelo cabeçalho (linha 0) ou -1. */
export function findColumn(headers: Cell[], name: string): number {
  const k = headerKey(name);
  return headers.findIndex((h) => headerKey(h) === k);
}
