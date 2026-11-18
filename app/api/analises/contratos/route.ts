import { erro, resposta } from "@/lib/contratos/rota";
import { logErro } from "@/lib/contratos/servidor";
import { contextoAnalises } from "@/lib/analise-credito/servidor";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Só admin: busca de contratos (por número ou cliente) para o botão "Vincular a contrato". Até 15 resultados. */
export async function GET(req: Request) {
  const auth = await contextoAnalises();
  if (!auth.ok) return erro(auth.status, auth.status === 401 ? "Não autenticado." : "Acesso negado.");
  if (auth.ctx.papel !== "admin") return erro(403, "Acesso negado.");
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60).replace(/[%_,()\\]/g, " ");
  let consulta = createAdminClient().from("contratos").select("id, numero, cliente_razao_social, status")
    .in("status", ["aguardando_aprovacao", "reprovado", "aprovado", "enviado_cliente"]).order("created_at", { ascending: false }).limit(15);
  if (q) consulta = consulta.or(`numero.ilike.%${q}%,cliente_razao_social.ilike.%${q}%`);
  const { data, error } = await consulta;
  if (error) {
    logErro("buscar contratos para vincular", undefined, error);
    return erro(500, "Não foi possível buscar.");
  }
  return resposta({ itens: data ?? [] });
}
