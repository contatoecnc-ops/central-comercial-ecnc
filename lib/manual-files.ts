/** Regras de arquivos de manual (tabela de preços). Usado no cliente, na action e na rota. */

export const MANUAL_BUCKET = "manuais";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_MANUAL = 10;

/** Extensão → tipo MIME. Sem SVG e sem HTML. */
export const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
};

export const ALLOWED_MIMES = Array.from(new Set(Object.values(EXT_MIME)));
export const ACCEPT_ATTR = Object.keys(EXT_MIME)
  .map((e) => `.${e}`)
  .join(",");

export function fileExt(name: string) {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export type FileKind = "imagem" | "pdf" | "planilha";

export function kindOfMime(mime: string): FileKind {
  if (mime.startsWith("image/")) return "imagem";
  if (mime === "application/pdf") return "pdf";
  return "planilha";
}

export function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Valida um arquivo escolhido; devolve a mensagem de erro (pt-BR) ou o MIME a usar no envio. */
export function checkLocalFile(f: { name: string; size: number; type: string }): { error: string } | { mime: string } {
  const ext = fileExt(f.name);
  if (ext === "heic" || ext === "heif" || f.type === "image/heic" || f.type === "image/heif") {
    return { error: "Foto HEIC (iPhone) não é aceita. Converta para JPG ou PNG antes de enviar." };
  }
  const mime = EXT_MIME[ext];
  if (!mime) return { error: "Tipo de arquivo não permitido. Use PNG, JPG, WEBP, PDF, XLSX, XLS ou CSV." };
  // alguns navegadores informam CSV/XLS com tipos genéricos; o que nunca passa é tipo fora da lista
  if (f.type && !ALLOWED_MIMES.includes(f.type) && f.type !== "application/octet-stream") {
    return { error: "Tipo de arquivo não permitido. Use PNG, JPG, WEBP, PDF, XLSX, XLS ou CSV." };
  }
  if (f.size <= 0) return { error: "O arquivo está vazio." };
  if (f.size > MAX_FILE_BYTES) return { error: "Arquivo acima de 10 MB." };
  return { mime };
}
