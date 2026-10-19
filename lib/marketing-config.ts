import type { Role } from "@/types/database";

export const CHANNELS = [
  "Instagram Feed",
  "Instagram Reels",
  "Instagram Stories",
  "Facebook",
  "LinkedIn",
  "YouTube",
  "TikTok",
  "Site/Blog",
  "E-mail",
  "WhatsApp",
  "Meta Ads",
  "Google Ads",
  "Outro",
] as const;

export const CHANNEL_SHORT: Record<string, string> = {
  "Instagram Feed": "IG",
  "Instagram Reels": "Reels",
  "Instagram Stories": "Stories",
  Facebook: "FB",
  LinkedIn: "LI",
  YouTube: "YT",
  TikTok: "TT",
  "Site/Blog": "Site",
  "E-mail": "Email",
  WhatsApp: "WA",
  "Meta Ads": "Meta",
  "Google Ads": "GAds",
  Outro: "•",
};

export const FORMATS = ["Imagem", "Carrossel", "Vídeo/Reels", "Story", "Texto/Artigo", "E-mail", "Anúncio"] as const;

export type ContentStatus =
  | "ideia"
  | "em_producao"
  | "em_aprovacao"
  | "ajustes"
  | "aprovado"
  | "publicado"
  | "arquivado";

export const STATUS_ORDER: ContentStatus[] = [
  "ideia",
  "em_producao",
  "em_aprovacao",
  "ajustes",
  "aprovado",
  "publicado",
  "arquivado",
];

export const STATUS_LABEL: Record<ContentStatus, string> = {
  ideia: "Ideia",
  em_producao: "Em produção",
  em_aprovacao: "Em aprovação",
  ajustes: "Ajustes",
  aprovado: "Aprovado",
  publicado: "Publicado",
  arquivado: "Arquivado",
};

/** Classes de cor por status (fundo + texto + borda). */
export const STATUS_COLOR: Record<ContentStatus, string> = {
  ideia: "bg-white/10 text-white/80 border-white/20",
  em_producao: "bg-blue-500/15 text-blue-300 border-blue-500/40",
  em_aprovacao: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  ajustes: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  aprovado: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  publicado: "bg-teal-500/15 text-teal-300 border-teal-500/40",
  arquivado: "bg-white/5 text-white/40 border-white/10",
};

export const FILE_KINDS = ["arte", "video", "referencia", "roteiro", "final"] as const;
export type FileKindContent = (typeof FILE_KINDS)[number];
export const FILE_KIND_LABEL: Record<FileKindContent, string> = {
  arte: "Arte",
  video: "Vídeo",
  referencia: "Referência",
  roteiro: "Roteiro",
  final: "Final",
};

export interface Transition {
  to: ContentStatus;
  label: string;
  /** exige comentário (só via "Pedir ajustes", no detalhe ou em Aprovações) */
  needsComment?: boolean;
  variant?: "primary" | "outline" | "danger";
}

/** Transições permitidas ao papel — espelha a máquina de estados do trigger (o banco é quem decide). */
export function transitionsFor(role: Role, status: ContentStatus): Transition[] {
  const admin = role === "admin";
  const out: Transition[] = [];
  switch (status) {
    case "ideia":
      out.push({ to: "em_producao", label: "Iniciar produção" });
      break;
    case "em_producao":
      out.push({ to: "em_aprovacao", label: "Pedir aprovação" });
      break;
    case "em_aprovacao":
      if (admin) {
        out.push({ to: "aprovado", label: "Aprovar" });
        out.push({ to: "ajustes", label: "Pedir ajustes", needsComment: true, variant: "outline" });
      }
      out.push({ to: "em_producao", label: "Retirar da aprovação", variant: "outline" });
      break;
    case "ajustes":
      out.push({ to: "em_producao", label: "Voltar à produção", variant: "outline" });
      out.push({ to: "em_aprovacao", label: "Reenviar para aprovação" });
      break;
    case "aprovado":
      out.push({ to: "publicado", label: "Marcar como publicado" });
      out.push({ to: "em_producao", label: "Reabrir", variant: "outline" });
      break;
    case "arquivado":
      out.push({ to: "ideia", label: "Desarquivar", variant: "outline" });
      return out;
  }
  out.push({ to: "arquivado", label: "Arquivar", variant: "danger" });
  return out;
}

/** Itens aprovados e publicados ficam travados (só a data de publicação muda). */
export const isLocked = (s: ContentStatus) => s === "aprovado" || s === "publicado";
/** Onde ainda se aceitam novos arquivos (espelha content_files_guard_insert). */
export const canAddFiles = (s: ContentStatus) => s === "ideia" || s === "em_producao" || s === "ajustes";

// ── Arquivos (bucket privado "marketing") ──
export const CONTENT_BUCKET = "marketing";
export const CONTENT_MAX_BYTES = 50 * 1024 * 1024;
export const TUS_THRESHOLD = 6 * 1024 * 1024;
export const CONTENT_EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
export const CONTENT_ACCEPT = Object.keys(CONTENT_EXT_MIME)
  .map((e) => `.${e}`)
  .join(",");

export function contentExt(name: string) {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function checkContentFile(f: { name: string; size: number }): { error: string } | { mime: string } {
  const ext = contentExt(f.name);
  if (ext === "heic" || ext === "heif") {
    return { error: "Foto HEIC (iPhone) não é aceita. Converta para JPG ou PNG antes de enviar." };
  }
  const mime = CONTENT_EXT_MIME[ext];
  if (!mime) return { error: "Tipo não permitido. Use PNG, JPG, WEBP, GIF, MP4, MOV, WEBM, PDF ou DOCX." };
  if (f.size <= 0) return { error: "O arquivo está vazio." };
  if (f.size > CONTENT_MAX_BYTES) {
    return { error: 'Arquivo acima de 50 MB. Use "Adicionar link (Drive/YouTube)".' };
  }
  return { mime };
}

export const isVideoMime = (m: string | null) => !!m && m.startsWith("video/");
export const isImageMime = (m: string | null) => !!m && m.startsWith("image/");

// Prioridade e solicitações de material
export * from "@/lib/marketing-requests";
