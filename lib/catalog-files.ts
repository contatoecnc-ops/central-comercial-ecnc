import { checkLocalFile, kindOfMime } from "@/lib/manual-files";

export const CATALOG_BUCKET = "catalogo";

/** Valida foto de produto escolhida; devolve mensagem de erro (pt-BR) ou o MIME. Só PNG, JPG e WEBP até 10 MB. */
export function checkCatalogImage(f: { name: string; size: number; type: string }): { error: string } | { mime: string } {
  const res = checkLocalFile(f);
  if ("error" in res) return res;
  if (kindOfMime(res.mime) !== "imagem") return { error: "Envie uma imagem PNG, JPG ou WEBP." };
  return res;
}

/** Caminho no bucket quando a URL aponta para um objeto do bucket público "catalogo"; senão null. */
export function catalogPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const marker = `/storage/v1/object/public/${CATALOG_BUCKET}/`;
  if (!base || !url.startsWith(base) || !url.includes(marker)) return null;
  const path = decodeURIComponent(url.split(marker)[1].split("?")[0]);
  return path || null;
}
