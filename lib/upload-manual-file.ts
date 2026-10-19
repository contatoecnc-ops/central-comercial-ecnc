"use client";

import { createClient } from "@/lib/supabase/client";
import { MANUAL_BUCKET } from "@/lib/manual-files";

/**
 * Envia o arquivo direto do navegador para o bucket privado, com o login do admin (policy de insert).
 * Usa XHR em vez de supabase-js para ter progresso de envio. Nada passa por server action nem rota da Vercel.
 */
export async function uploadManualFile(
  path: string,
  file: File,
  mime: string,
  onProgress: (pct: number) => void
): Promise<{ error?: string }> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session) return { error: "Sessão expirada. Entre novamente." };

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${MANUAL_BUCKET}/${path}`;

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve({});
      } else {
        resolve({ error: "Falha ao enviar o arquivo." });
      }
    };
    xhr.onerror = () => resolve({ error: "Falha de conexão ao enviar o arquivo." });
    xhr.send(file);
  });
}

export async function removeManualObjects(paths: string[]) {
  if (paths.length === 0) return;
  try {
    await createClient().storage.from(MANUAL_BUCKET).remove(paths);
  } catch {
    // melhor esforço
  }
}
