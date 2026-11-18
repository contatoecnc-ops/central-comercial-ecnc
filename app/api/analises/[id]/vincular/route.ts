import { z } from "zod";
import { erro, lerCorpoJson, resposta } from "@/lib/contratos/rota";
import { logErro, UUID_RE } from "@/lib/contratos/servidor";
import { contextoAnalises, vincularManual } from "@/lib/analise-credito/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Corpo = z.strictObject({ contrato_id: z.string().regex(UUID_RE, "Contrato inválido.") });

/** Só admin: vínculo manual entre a análise e um contrato. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await contextoAnalises();
  if (!auth.ok) return erro(auth.status, auth.status === 401 ? "Não autenticado." : "Acesso negado.");
  if (auth.ctx.papel !== "admin") return erro(403, "Acesso negado.");
  if (!UUID_RE.test(params.id)) return erro(404, "Análise não encontrada.");
  const corpo = await lerCorpoJson(req, Corpo, 4 * 1024);
  if (!corpo.ok) return corpo.res;
  try {
    const r = await vincularManual(params.id, corpo.dados.contrato_id, auth.ctx.userId);
    return r === "ok" ? resposta({ ok: true }) : erro(404, "Análise ou contrato não encontrado.");
  } catch (e) {
    logErro("vincular manualmente", params.id, e);
    return erro(500, "Não foi possível vincular.");
  }
}
