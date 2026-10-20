import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/dates";

export const MAX_DAYS = 92;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" → ms em UTC (aritmética de calendário, sem fuso). */
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (iso: string, n: number) => fromMs(toMs(iso) + n * DAY_MS);
export const daysBetween = (from: string, to: string) => Math.round((toMs(to) - toMs(from)) / DAY_MS);
export const todayBR = () => formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");

export function isValidDate(iso: string) {
  if (!ISO.test(iso)) return false;
  const ms = toMs(iso);
  return !Number.isNaN(ms) && fromMs(ms) === iso;
}

/** Semana anterior completa (segunda a domingo), em relação a hoje no fuso de São Paulo. */
export function previousWeek(today = todayBR()) {
  const dow = new Date(toMs(today)).getUTCDay(); // 0 = domingo
  const sinceMonday = (dow + 6) % 7;
  const thisMonday = addDays(today, -sinceMonday);
  return { from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) };
}

export function currentMonth(today = todayBR()) {
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export function previousMonth(today = todayBR()) {
  const first = `${today.slice(0, 7)}-01`;
  const to = addDays(first, -1);
  return { from: `${to.slice(0, 7)}-01`, to };
}

/** "YYYY-MM" anterior */
export function prevMonthKey(ym: string) {
  return addDays(`${ym}-01`, -1).slice(0, 7);
}

export type PeriodResult = { ok: true; from: string; to: string } | { ok: false; message: string };

/** Valida `from`/`to` (ambos ou nenhum). Sem parâmetros: semana anterior. */
export function resolvePeriod(from?: string | null, to?: string | null): PeriodResult {
  if (!from && !to) return { ok: true, ...previousWeek() };
  if (!from || !to) return { ok: false, message: "Informe from e to juntos (YYYY-MM-DD)" };
  if (!isValidDate(from) || !isValidDate(to)) return { ok: false, message: "Datas inválidas: use YYYY-MM-DD" };
  if (to < from) return { ok: false, message: "to não pode ser anterior a from" };
  if (daysBetween(from, to) + 1 > MAX_DAYS) return { ok: false, message: `Período máximo: ${MAX_DAYS} dias` };
  return { ok: true, from, to };
}

export const fmtBR = (iso: string) => iso.split("-").reverse().join("/");
