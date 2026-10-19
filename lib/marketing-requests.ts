const contentExt = (name: string) => name.slice(name.lastIndexOf(".") + 1).toLowerCase();

// ── Prioridade ──
export const PRIORITIES = ["minima", "media", "urgente"] as const;
export type ContentPriority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<ContentPriority, string> = {
  minima: "Mínima",
  media: "Média",
  urgente: "Urgente",
};
/** Etiqueta: cinza, amarelo e vermelho ECNC. */
export const PRIORITY_COLOR: Record<ContentPriority, string> = {
  minima: "bg-white/10 text-white/60 border-white/20",
  media: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40",
  urgente: "bg-[#E30613]/20 text-red-300 border-[#E30613]/60",
};
/** Cor do ponto no calendário. */
export const PRIORITY_DOT: Record<ContentPriority, string> = {
  minima: "bg-white/40",
  media: "bg-yellow-400",
  urgente: "bg-[#E30613]",
};
export const PRIORITY_RANK: Record<ContentPriority, number> = { urgente: 0, media: 1, minima: 2 };

/** Urgente primeiro; dentro da prioridade mantém a ordem recebida (data, depois criação). */
export function sortByPriority<T extends { priority: ContentPriority }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => PRIORITY_RANK[a.item.priority] - PRIORITY_RANK[b.item.priority] || a.index - b.index)
    .map((x) => x.item);
}

// ── Solicitações de material (vendedor → admin → marketing) ──
export const REQUEST_TYPES = [
  "Post/arte para redes",
  "Vídeo",
  "Material impresso (folder, catálogo)",
  "Apresentação ou proposta",
  "Foto/vídeo de máquina",
  "Outro",
] as const;

export type RequestStatus = "nova" | "aprovada" | "recusada" | "cancelada";

export const REQUEST_ANDAMENTOS = [
  "Aguardando triagem",
  "Na fila do marketing",
  "Em produção",
  "Em revisão",
  "Pronto",
  "Entregue",
  "Recusada",
  "Cancelada",
  "Encerrada",
] as const;

export const REQUEST_BUCKET = "solicitacoes";
export const REQUEST_MAX_BYTES = 10 * 1024 * 1024;
export const REQUEST_MAX_FILES = 5;
export const REQUEST_EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
export const REQUEST_ACCEPT = Object.keys(REQUEST_EXT_MIME)
  .map((e) => `.${e}`)
  .join(",");

export function checkRequestFile(f: { name: string; size: number }): { error: string } | { mime: string } {
  const ext = contentExt(f.name);
  if (ext === "heic" || ext === "heif") {
    return { error: "Foto HEIC (iPhone) não é aceita. Converta para JPG ou PNG antes de enviar." };
  }
  const mime = REQUEST_EXT_MIME[ext];
  if (!mime) return { error: "Tipo não permitido. Use PNG, JPG, WEBP, PDF, DOCX ou XLSX." };
  if (f.size <= 0) return { error: "O arquivo está vazio." };
  if (f.size > REQUEST_MAX_BYTES) return { error: "Arquivo acima de 10 MB." };
  return { mime };
}
