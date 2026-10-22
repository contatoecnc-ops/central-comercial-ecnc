import type { MicheleStatusEfetivo, MicheleTemperatura } from "@/types/database";

export const ABANDON_HOURS = 24;
export const REFRESH_MS = 30_000;
export const PAGE_SIZE = 25;
export const KOMMO_LEAD_URL = "https://ecnc.kommo.com/leads/detail/";

export const STATUS_LABEL: Record<MicheleStatusEfetivo, string> = {
  em_andamento: "Em andamento",
  qualificado: "Qualificado",
  recusou: "Recusou consultor",
  abandonado: "Abandonado",
};

export const STATUS_CLASS: Record<MicheleStatusEfetivo, string> = {
  em_andamento: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  qualificado: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  recusou: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  abandonado: "text-zinc-400 border-zinc-500/30 bg-zinc-500/10",
};

export const TEMPERATURA_LABEL: Record<MicheleTemperatura | "sem-temperatura", string> = {
  "lead-quente": "Quente",
  "lead-morno": "Morno",
  "lead-frio": "Frio",
  "sem-temperatura": "Sem temperatura",
};

export const TEMPERATURA_CLASS: Record<MicheleTemperatura, string> = {
  "lead-quente": "text-red-400 border-red-500/30 bg-red-500/10",
  "lead-morno": "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  "lead-frio": "text-sky-400 border-sky-500/30 bg-sky-500/10",
};

export const STATUS_FILTROS = ["em_andamento", "qualificado", "recusou", "abandonado"] as const;
export const TEMPERATURA_FILTROS = ["lead-quente", "lead-morno", "lead-frio"] as const;
