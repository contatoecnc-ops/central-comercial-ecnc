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

export const pct = (v: number, meta: number | null | undefined) => (meta ? v / meta : null);
