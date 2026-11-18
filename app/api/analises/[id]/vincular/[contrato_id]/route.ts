import { erro, resposta } from "@/lib/contratos/rota";
import { logErro, UUID_RE } from "@/lib/contratos/servidor";
import { contextoAnalises, desvincular } from "@/lib/analise-credito/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Só admin: remove o vínculo (e registra o evento no histórico do contrato). */
export async function DELETE(_req: Request, { params }: { params: { id: string; contrato_id: string } }) {
  const auth = await contextoAnalises();
  if (!auth.ok) return erro(auth.status, auth.status === 401 ? "Não autenticado." : "Acesso negado.");
  if (auth.ctx.papel !== "admin") return erro(403, "Acesso negado.");
  if (!UUID_RE.test(params.id) || !UUID_RE.test(params.contrato_id)) return erro(404, "Vínculo não encontrado.");
  try {
    const r = await desvincular(params.id, params.contrato_id, auth.ctx.userId);
    return r === "ok" ? resposta({ ok: true }) : erro(404, "Vínculo não encontrado.");
  } catch (e) {
    logErro("desvincular", params.id, e);
    return erro(500, "Não foi possível desvincular.");
  }
}
