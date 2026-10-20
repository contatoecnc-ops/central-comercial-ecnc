import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { resolvePeriod } from "@/lib/analysis/period";
import { rateLimit } from "@/lib/analysis/rate-limit";
import { buildResumo } from "@/lib/analysis/summary";
import { resumoToMarkdown } from "@/lib/analysis/markdown";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };
const MIN_TOKEN = 40;

function fail(status: number, message: string, extra?: Record<string, string>) {
  return NextResponse.json({ erro: message }, { status, headers: { ...NO_STORE, ...extra } });
}

/** Token configurado, ou null se ausente. Curto demais é erro de configuração (falha clara, não aceita nada). */
function configuredToken(): string | null {
  const t = process.env.ANALYSIS_TOKEN;
  if (!t) return null;
  if (t.length < MIN_TOKEN) throw new Error(`ANALYSIS_TOKEN deve ter ao menos ${MIN_TOKEN} caracteres`);
  return t;
}

/** Tempo constante: compara os SHA-256 (mesmo tamanho), sem vazar o comprimento do token. */
function validBearer(header: string, token: string) {
  if (!header.startsWith("Bearer ")) return false;
  const a = createHash("sha256").update(header.slice(7).trim()).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b);
}

async function sessionRole(): Promise<"none" | "admin" | "other"> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "none";
  const { data } = await supabase.from("profiles").select("role, active").eq("id", user.id).single();
  return data?.role === "admin" && data.active === true ? "admin" : "other";
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "desconhecido";
  const limit = rateLimit(ip);
  if (!limit.ok) return fail(429, "Limite de requisições excedido", { "Retry-After": String(limit.retryAfterSec) });

  // Autenticação: Bearer (agente) OU sessão de admin (navegador). Token na query string não é aceito.
  const authorization = req.headers.get("authorization");
  if (authorization) {
    let token: string | null;
    try {
      token = configuredToken();
    } catch (e) {
      console.error((e as Error).message);
      return fail(500, "Configuração inválida");
    }
    if (!token || !validBearer(authorization, token)) return fail(401, "Não autorizado");
  } else {
    const role = await sessionRole();
    if (role === "none") return fail(401, "Não autorizado");
    if (role === "other") return fail(403, "Acesso negado");
  }

  const sp = req.nextUrl.searchParams;
  const formato = sp.get("formato") ?? "json";
  if (formato !== "json" && formato !== "md") return fail(400, "formato deve ser json ou md");
  const period = resolvePeriod(sp.get("from"), sp.get("to"));
  if (!period.ok) return fail(400, period.message);

  try {
    const resumo = await buildResumo(period.from, period.to);
    if (formato === "md") {
      return new NextResponse(resumoToMarkdown(resumo), {
        headers: { ...NO_STORE, "Content-Type": "text/markdown; charset=utf-8" },
      });
    }
    return NextResponse.json(resumo, { headers: NO_STORE });
  } catch (e) {
    // sem corpo, parâmetros ou token no log
    console.error("analise: falha ao gerar o resumo", (e as Error).message);
    return fail(500, "Falha ao gerar o resumo");
  }
}
