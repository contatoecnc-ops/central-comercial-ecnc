import {
  SupabaseConversas, TelegramApi, processarAtualizacaoTelegram, validarSegredoTelegram,
} from "@/lib/agente-contratos";
import { WEBHOOK_MAX_BYTES } from "@/lib/contratos-config";
import { executarEmSegundoPlano } from "@/lib/contratos/background";
import { avisarGestor, buscarVendedorPorTelegram, criarAgenteTelegram } from "@/lib/contratos/servidor";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sem sessão: a autenticação é o segredo do webhook (comparado em tempo constante). Nada do corpo vai para o log.
export async function POST(req: Request) {
  const segredo = process.env.TELEGRAM_WEBHOOK_SECRET;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!segredo || !token) return new Response("indisponivel", { status: 503 });
  if (!validarSegredoTelegram(req.headers.get("x-telegram-bot-api-secret-token"), segredo))
    return new Response("forbidden", { status: 403 });

  if (Number(req.headers.get("content-length") ?? 0) > WEBHOOK_MAX_BYTES) return new Response("grande demais", { status: 413 });
  const texto = await req.text();
  if (Buffer.byteLength(texto) > WEBHOOK_MAX_BYTES) return new Response("grande demais", { status: 413 });
  let update: unknown;
  try { update = JSON.parse(texto); } catch { return new Response("ok"); }

  // Responde 200 na hora; o agente pode levar 10–30 s e o Telegram reenvia se demorar.
  executarEmSegundoPlano(async () => {
    await processarAtualizacaoTelegram({
      update,
      api: new TelegramApi(token),
      agente: criarAgenteTelegram(),
      conversas: new SupabaseConversas(createAdminClient()),
      buscarVendedor: buscarVendedorPorTelegram, // só vendedor ativo, liberado e cadastrado
      aoGerarContrato: async ({ id }) => avisarGestor(id),
    });
  });
  return new Response("ok");
}
