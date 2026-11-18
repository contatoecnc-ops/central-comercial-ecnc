import { SupabaseConversas } from "@/lib/agente-contratos";
import { erro, resposta } from "@/lib/contratos/rota";
import { contextoContratos } from "@/lib/contratos/servidor";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Novo contrato": encerra a conversa aberta do próprio usuário (a próxima mensagem abre outra). */
export async function POST() {
  const auth = await contextoContratos();
  if (!auth.ok) return erro(auth.status, auth.status === 401 ? "Não autenticado." : "Acesso negado.");
  const conversas = new SupabaseConversas(createAdminClient());
  const conversa = await conversas.abrirOuCriar(auth.ctx.userId, "central");
  await conversas.encerrar(conversa.id);
  return resposta({ ok: true });
}
