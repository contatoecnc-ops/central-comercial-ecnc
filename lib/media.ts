function driveId(url: string) {
  return url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]+)/)?.[1] ?? null;
}

/** URL embutível (iframe) para YouTube, Vimeo e vídeos do Drive; null se não suportado. */
export function toEmbedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  const drive = driveId(url);
  if (drive) return `https://drive.google.com/file/d/${drive}/preview`;
  return null;
}

/** URL de imagem exibível; converte links do Drive em thumbnails grandes. */
export function toImageUrl(url: string): string {
  const id = driveId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : url;
}
