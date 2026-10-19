"use client";

import { createClient } from "@/lib/supabase/client";
import { REQUEST_BUCKET } from "@/lib/marketing-config";

/**
 * Envia o anexo (até 10 MB) direto do navegador ao bucket privado "solicitacoes" com o login do vendedor.
 * XHR para ter progresso; nada passa por server action nem rota da Vercel.
 */
export async function uploadRequestFile(
  path: string,
  file: File,
  mime: string,
  onProgress: (pct: number) => void
): Promise<{ error?: string }> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session) return { error: "Sessão expirada. Entre novamente." };

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${REQUEST_BUCKET}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
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

export async function removeRequestObjects(paths: string[]) {
  if (paths.length === 0) return;
  try {
    await createClient().storage.from(REQUEST_BUCKET).remove(paths);
  } catch {
    // melhor esforço
  }
}
