import { aprovarContrato } from "@/lib/agente-contratos";
import { PAPEL_GESTOR } from "@/lib/contratos-config";
import { executarEmSegundoPlano } from "@/lib/contratos/background";
import { acaoContrato, repositorio } from "@/lib/contratos/rota";
import { avisarAprovadoAoVendedor } from "@/lib/contratos/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Qualquer admin ativo é gestor comercial. O pacote confere status, aprovações e documentos pendentes.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return acaoContrato(req, params.id, {
    nome: "aprovar",
    quem: "admin",
    executar: async ({ ctx }) => {
      const r = await aprovarContrato(repositorio(), params.id, { id: ctx.userId, papel: PAPEL_GESTOR });
      if (r.status === "aprovado") executarEmSegundoPlano(() => avisarAprovadoAoVendedor(r));
      return { status: r.status };
    },
  });
}
