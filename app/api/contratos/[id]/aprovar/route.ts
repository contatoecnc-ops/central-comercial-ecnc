import { aprovarContrato } from "@/lib/agente-contratos";
import { ANALISE_CREDITO_OBRIGATORIA, PAPEL_GESTOR } from "@/lib/contratos-config";
import { executarEmSegundoPlano } from "@/lib/contratos/background";
import { acaoContrato, erro, repositorio } from "@/lib/contratos/rota";
import { avisarAprovadoAoVendedor } from "@/lib/contratos/servidor";
import { contratoParcelado, motivoBloqueioAprovacao } from "@/lib/analise-credito/regras";
import { selosDeContratos } from "@/lib/analise-credito/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Qualquer admin ativo é gestor comercial. O pacote confere status, aprovações e documentos pendentes;
// a análise de crédito é conferida AQUI, antes de chamar o pacote (só recusa quando ANALISE_CREDITO_OBRIGATORIA = true).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return acaoContrato(req, params.id, {
    nome: "aprovar",
    quem: "admin",
    antes: async (_ctx, c) => {
      if (!ANALISE_CREDITO_OBRIGATORIA) return null;
      const pagamento = (c.dados as { pagamento?: { parcelas?: number } } | undefined)?.pagamento;
      const parcelado = contratoParcelado(c.condicao_pagamento, pagamento);
      if (!parcelado) return null; // à vista, cartão e financiamento não são afetados
      const selo = (await selosDeContratos([{ id: c.id, condicao_pagamento: c.condicao_pagamento, parcelas: pagamento?.parcelas }])).get(c.id) ?? null;
      const motivo = motivoBloqueioAprovacao(parcelado, selo, true);
      return motivo ? erro(409, motivo) : null;
    },
    executar: async ({ ctx }) => {
      const r = await aprovarContrato(repositorio(), params.id, { id: ctx.userId, papel: PAPEL_GESTOR });
      if (r.status === "aprovado") executarEmSegundoPlano(() => avisarAprovadoAoVendedor(r));
      return { status: r.status };
    },
  });
}
