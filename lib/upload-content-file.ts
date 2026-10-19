"use client";

import { Upload } from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { CONTENT_BUCKET, TUS_THRESHOLD } from "@/lib/marketing-config";

const base = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function token() {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  return session?.access_token ?? null;
}

/**
 * Envia direto do navegador ao bucket privado "marketing".
 * Até 6 MB: POST simples (XHR, com progresso). Acima: upload resumável (TUS) em blocos de 6 MB,
 * com novas tentativas se a conexão cair. Nada passa por server action nem rota da Vercel.
 */
export async function uploadContentFile(
  path: string,
  file: File,
  mime: string,
  onProgress: (pct: number) => void
): Promise<{ error?: string }> {
  if (!(await token())) return { error: "Sessão expirada. Entre novamente." };
  return file.size <= TUS_THRESHOLD ? simpleUpload(path, file, mime, onProgress) : resumableUpload(path, file, mime, onProgress);
}

async function simpleUpload(path: string, file: File, mime: string, onProgress: (pct: number) => void) {
  const jwt = await token();
  return new Promise<{ error?: string }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base()}/storage/v1/object/${CONTENT_BUCKET}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${jwt}`);
    xhr.setRequestHeader("apikey", anon());
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

async function resumableUpload(path: string, file: File, mime: string, onProgress: (pct: number) => void) {
  return new Promise<{ error?: string }>((resolve) => {
    const upload = new Upload(file, {
      endpoint: `${base()}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: TUS_THRESHOLD,
      removeFingerprintOnSuccess: true,
      uploadDataDuringCreation: true,
      headers: { apikey: anon(), "x-upsert": "false" },
      metadata: {
        bucketName: CONTENT_BUCKET,
        objectName: path,
        contentType: mime,
        cacheControl: "3600",
      },
      // o token é relido a cada requisição: uma retomada longa não usa JWT vencido
      onBeforeRequest: async (req) => {
        const jwt = await token();
        if (jwt) req.setHeader("Authorization", `Bearer ${jwt}`);
      },
      onProgress: (sent, total) => onProgress(Math.round((sent / total) * 100)),
      onError: () => resolve({ error: "Falha ao enviar o arquivo. Tente novamente." }),
      onSuccess: () => {
        onProgress(100);
        resolve({});
      },
    });
    upload.start();
  });
}

export async function removeContentObjects(paths: string[]) {
  if (paths.length === 0) return;
  try {
    await createClient().storage.from(CONTENT_BUCKET).remove(paths);
  } catch {
    // melhor esforço
  }
}
