import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_BODY_BYTES, ingestSchema, toRpcPayload } from "@/lib/michele/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

const NO_STORE = { "Cache-Control": "no-store" };
const MIN_SECRET = 40;

// Este endpoint recebe dados de leads: nada do corpo, do secret nem de erros do banco vai para o log (só status e códigos).
function reply(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function secretOk(received: string | null): boolean {
  const secret = process.env.MICHELE_INGEST_SECRET;
  if (!secret) return false;
  if (secret.length < MIN_SECRET) {
    console.error(`michele/ingest: MICHELE_INGEST_SECRET deve ter ao menos ${MIN_SECRET} caracteres (endpoint desativado)`);
    return false;
  }
  if (!received) return false;
  // SHA-256 dos dois lados: mesmo tamanho para timingSafeEqual, sem vazar o comprimento do secret
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

/** Lê o corpo até o limite; null se passar de MAX_BODY_BYTES (mesmo sem Content-Length). */
async function readBody(req: NextRequest): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get("x-ingest-secret"))) return reply(401, { erro: "Não autorizado" });

  const raw = await readBody(req);
  if (raw === null) return reply(413, { erro: "Corpo grande demais" });

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return reply(400, { erro: "JSON inválido" });
  }

  const parsed = ingestSchema.safeParse(json);
  if (!parsed.success) {
    // só o nome do campo, nunca o valor enviado
    const path = parsed.error.issues[0]?.path.join(".") || "corpo";
    return reply(400, { erro: `Payload inválido: ${path}` });
  }

  try {
    const { data, error } = await createAdminClient().rpc("michele_ingest", { p_payload: toRpcPayload(parsed.data) });
    if (error || !data) {
      console.error("michele/ingest: falha no banco", error?.code ?? "sem_codigo");
      return reply(500, { erro: "Falha ao gravar" });
    }
    return reply(200, { ok: true, atendimento_id: data });
  } catch {
    console.error("michele/ingest: erro inesperado");
    return reply(500, { erro: "Falha ao gravar" });
  }
}
