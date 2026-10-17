import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/dates";

export const fmtBRL = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Fração (0,25) → "25%". */
export const fmtPct = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("pt-BR", { style: "percent", maximumFractionDigits: 1 });

/** "2026-10" → "10/2026". */
export function fmtPeriod(p: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  return m ? `${m[2]}/${m[1]}` : p;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const monthShort = (p: string) => MONTHS[Number(p.slice(5)) - 1] ?? p;

/** "2026-10-16" → "16/10/2026" (sem fuso: é data de calendário). */
export function fmtDateISO(d: string | null | undefined) {
  return d ? d.slice(0, 10).split("-").reverse().join("/") : "—";
}

export function fmtSyncedAt(iso: string) {
  return formatInTimeZone(iso, TZ, "dd/MM 'às' HH:mm");
}
