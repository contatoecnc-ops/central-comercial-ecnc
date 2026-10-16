import { ptBR } from "date-fns/locale";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const TZ = "America/Sao_Paulo";

export function fmtDateTime(iso: string | Date) {
  return formatInTimeZone(iso, TZ, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function fmtDate(iso: string | Date) {
  return formatInTimeZone(iso, TZ, "dd/MM/yyyy", { locale: ptBR });
}

/** ISO → valor para <input type="datetime-local"> no fuso de São Paulo */
export function toInputValue(iso: string | Date) {
  return formatInTimeZone(iso, TZ, "yyyy-MM-dd'T'HH:mm");
}

/** valor de <input type="datetime-local"> (horário de SP) → ISO UTC */
export function fromInputValue(value: string) {
  return fromZonedTime(value, TZ).toISOString();
}
