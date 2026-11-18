import { z } from "zod";
import { reprovarContrato } from "@/lib/agente-contratos";
import { PAPEL_GESTOR } from "@/lib/contratos-config";
import { executarEmSegundoPlano } from "@/lib/contratos/background";
import { acaoContrato, repositorio } from "@/lib/contratos/rota";
import { avisarReprovadoAoVendedor } from "@/lib/contratos/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Corpo = z.strictObject({ motivo: z.string().trim().min(1, "Informe o motivo da reprovação.").max(2000) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return acaoContrato(req, params.id, {
    nome: "reprovar",
    quem: "admin",
    corpo: Corpo,
    executar: async ({ ctx, corpo }) => {
      const r = await reprovarContrato(repositorio(), params.id, { id: ctx.userId, papel: PAPEL_GESTOR }, corpo.motivo);
      executarEmSegundoPlano(() => avisarReprovadoAoVendedor(r));
      return { status: r.status };
    },
  });
}
