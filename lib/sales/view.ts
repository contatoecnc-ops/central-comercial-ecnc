import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/dates";
import type { SalesNumber } from "@/types/database";

/** Mês de referência: o de `dados_ate` (se houver linha) ou o mais recente com dados. */
export function currentPeriodOf(rows: SalesNumber[]): string | undefined {
  const sorted = Array.from(new Set(rows.map((r) => r.period))).sort().reverse();
  const ate = rows.find((r) => r.metrics.dados_ate)?.metrics.dados_ate?.slice(0, 7);
  return ate && sorted.includes(ate) ? ate : sorted[0];
}

export function topOrigins(origins: Record<string, number>, n = 5) {
  return Object.entries(origins)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

export const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/**
 * Dias úteis (seg–sex) entre "vendas atualizadas até" (exclusive) e hoje em America/Sao_Paulo (inclusive).
 * Sexta → sáb/dom/seg = 0/0/1; terça = 2. Feriados não são considerados.
 */
export function businessDaysBehind(dadosAte: string, now: Date = new Date()): number {
  const today = formatInTimeZone(now, TZ, "yyyy-MM-dd");
  const start = Date.parse(`${dadosAte.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(start) || end <= start) return 0;
  let n = 0;
  for (let t = start + 86400000; t <= end; t += 86400000) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

/** Aviso só quando há mais de 1 dia útil de atraso. */
export function staleWarning(dadosAte: string | null | undefined, now: Date = new Date()): string | null {
  if (!dadosAte || businessDaysBehind(dadosAte, now) <= 1) return null;
  return `Planilha desatualizada: "vendas atualizadas até" é ${dadosAte.slice(0, 10).split("-").reverse().join("/")}`;
}

export const pct =(v: number, meta: number | null | undefined) => (meta ? v / meta : null);
