import { TelegramApi } from "@/lib/agente-contratos";
import { erro, resposta } from "@/lib/contratos/rota";
import { contextoContratos, logErro, urlCentral } from "@/lib/contratos/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Só admin: registra o webhook do bot no Telegram (CENTRAL_URL + /api/telegram/webhook) com o segredo. */
export async function POST() {
  const auth = await contextoContratos();
  if (!auth.ok) return erro(auth.status, auth.status === 401 ? "Não autenticado." : "Acesso negado.");
  if (auth.ctx.papel !== "admin") return erro(403, "Acesso negado.");

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const segredo = process.env.TELEGRAM_WEBHOOK_SECRET;
  const url = urlCentral("/api/telegram/webhook");
  if (!token || !segredo || !url) return erro(409, "Faltam variáveis na Vercel: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET e CENTRAL_URL.");
  try {
    await new TelegramApi(token).configurarWebhook(url, segredo);
    return resposta({ ok: true });
  } catch (e) {
    logErro("configurar webhook do Telegram", undefined, e);
    return erro(502, "O Telegram não aceitou a configuração. Confira o token do bot e a URL da Central.");
  }
}
