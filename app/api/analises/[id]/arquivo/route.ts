import { NextResponse } from "next/server";
import { URL_ASSINADA_SEGUNDOS } from "@/lib/contratos-config";
import { erro } from "@/lib/contratos/rota";
import { logErro, UUID_RE } from "@/lib/contratos/servidor";
import { contextoAnalises } from "@/lib/analise-credito/servidor";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Só admin. URL assinada de 60 s (redirecionamento), gerada depois da checagem. A URL nunca vai para o log. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await contextoAnalises();
  if (!auth.ok) return erro(auth.status, auth.status === 401 ? "Não autenticado." : "Acesso negado.");
  if (auth.ctx.papel !== "admin") return erro(403, "Acesso negado.");
  if (!UUID_RE.test(params.id)) return erro(404, "Análise não encontrada.");

  const db = createAdminClient();
  const { data: a } = await db.from("analises_credito").select("id, arquivo_path, arquivo_nome").eq("id", params.id).maybeSingle();
  if (!a) return erro(404, "Análise não encontrada.");
  const { data, error } = await db.storage.from("analises-credito").createSignedUrl(a.arquivo_path, URL_ASSINADA_SEGUNDOS, { download: a.arquivo_nome || "analise-de-credito.pdf" });
  if (error || !data?.signedUrl) {
    logErro("url assinada da análise", a.id, error ?? new Error("sem url"));
    return erro(500, "Não foi possível gerar o link do arquivo.");
  }
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "Cache-Control": "no-store" } });
}
