import { z } from "zod";
import { SupabaseConversas } from "@/lib/agente-contratos";
import { CHAT_MAX_MENSAGEM } from "@/lib/contratos-config";
import { executarEmSegundoPlano } from "@/lib/contratos/background";
import { erro, lerCorpoJson, resposta } from "@/lib/contratos/rota";
import {
  avisarGestor, contextoContratos, criarAgente, logErro, montarVendedor, registrarUsoAgente, UUID_RE,
} from "@/lib/contratos/servidor";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // uma resposta pode encadear várias chamadas à API

const Corpo = z.strictObject({
  conversa_id: z.string().regex(UUID_RE).optional(),
  mensagem: z.string().trim().min(1, "Escreva uma mensagem.").max(CHAT_MAX_MENSAGEM, `A mensagem passa de ${CHAT_MAX_MENSAGEM} caracteres.`),
});

export async function POST(req: Request) {
  const auth = await contextoContratos();
  if (!auth.ok) return erro(auth.status, auth.status === 401 ? "Não autenticado." : "Acesso negado.");
  const { ctx } = auth;

  const lido = await lerCorpoJson(req, Corpo, 32 * 1024);
  if (!lido.ok) return lido.res;
  const { conversa_id, mensagem } = lido.dados;

  if (!(await registrarUsoAgente(ctx.userId)))
    return erro(429, "Você atingiu o limite de 30 mensagens por hora. Tente de novo mais tarde.");

  const conversas = new SupabaseConversas(createAdminClient());
  // A conversa é SEMPRE a aberta do próprio usuário no canal "central": o id do navegador só serve de conferência.
  const conversa = await conversas.abrirOuCriar(ctx.userId, "central");
  if (conversa_id && conversa_id !== conversa.id) return erro(409, "Esta conversa foi encerrada. Recarregue a página.");

  if (!(await conversas.travar(conversa.id, 120))) return erro(409, "Ainda estou processando sua mensagem anterior. Aguarde a resposta.");
  try {
    const vendedor = await montarVendedor(ctx.userId);
    if (!vendedor) return erro(403, "Acesso negado.");
    const r = await criarAgente().responder({ vendedor, mensagem, historico: conversa.mensagens, estado: conversa.estado });
    conversa.mensagens = r.mensagens;
    conversa.estado = r.estado;
    if (r.contrato_gerado) conversa.contrato_id = r.contrato_gerado.id;
    await conversas.salvar(conversa);
    if (r.contrato_gerado) {
      const id = r.contrato_gerado.id;
      executarEmSegundoPlano(() => avisarGestor(id)); // só envia se estiver aguardando aprovação
    }
    return resposta({ conversa_id: conversa.id, texto: r.texto, contrato_gerado: r.contrato_gerado ?? null });
  } catch (e) {
    logErro("chat", conversa.id, e);
    return erro(502, "O assistente não conseguiu responder agora. Tente de novo em instantes.");
  } finally {
    await conversas.destravar(conversa.id);
  }
}
