import { configZapsignDoAmbiente, registrarWebhookZapsign } from "@/lib/agente-contratos";
import { erro, resposta } from "@/lib/contratos/rota";
import { contextoContratos, logErro, urlCentral } from "@/lib/contratos/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Só admin: registra o webhook no ZapSign. Rodar de novo ao trocar de sandbox para produção
 * (tokens e contas são diferentes).
 */
export async function POST() {
  const auth = await contextoContratos();
  if (!auth.ok) return erro(auth.status, auth.status === 401 ? "Não autenticado." : "Acesso negado.");
  if (auth.ctx.papel !== "admin") return erro(403, "Acesso negado.");

  const segredo = process.env.ZAPSIGN_WEBHOOK_SECRET;
  const url = urlCentral("/api/zapsign/webhook");
  if (!segredo || !url || !process.env.ZAPSIGN_API_TOKEN)
    return erro(409, "Faltam variáveis na Vercel: ZAPSIGN_API_TOKEN, ZAPSIGN_WEBHOOK_SECRET e CENTRAL_URL.");
  try {
    await registrarWebhookZapsign(configZapsignDoAmbiente(), url, segredo);
    return resposta({ ok: true, ambiente: process.env.ZAPSIGN_AMBIENTE === "producao" ? "producao" : "sandbox" });
  } catch (e) {
    logErro("configurar webhook do ZapSign", undefined, e);
    return erro(502, "O ZapSign não aceitou a configuração. Confira o token e o ambiente.");
  }
}
