import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getSalesSource } from "@/lib/sales/source";
import { syncSales } from "@/lib/sales/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function validBearer(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function isAdminSession(req: NextRequest) {
  // sessão por cookie: exige mesma origem (proteção contra CSRF)
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host")) return false;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("role, active").eq("id", user.id).single();
  return data?.role === "admin" && data.active === true;
}

async function run() {
  const source = getSalesSource();
  if (source === "none") {
    return NextResponse.json({ error: "Fonte de vendas não configurada" }, { status: 503 });
  }
  try {
    return NextResponse.json(await syncSales(source));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro na sincronização" }, { status: 500 });
  }
}

// Vercel Cron chama com GET + Authorization: Bearer ${CRON_SECRET}
export async function GET(req: NextRequest) {
  if (!validBearer(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return run();
}

export async function POST(req: NextRequest) {
  if (!validBearer(req) && !(await isAdminSession(req))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  return run();
}
