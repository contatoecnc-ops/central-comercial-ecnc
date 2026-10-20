/** Duração em horas → texto: abaixo de 1 h em minutos ("45 min"), senão em horas ("2,5 h"). */
export function fmtHoras(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}
