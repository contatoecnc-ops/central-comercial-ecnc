import { z } from "zod";
import { cancelarContrato } from "@/lib/agente-contratos";
import { acaoContrato, repositorio } from "@/lib/contratos/rota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Corpo = z.strictObject({ motivo: z.string().trim().min(1, "Informe o motivo do cancelamento.").max(2000) });

// Vendedor dono ou admin. O pacote barra contrato já assinado ou cancelado.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return acaoContrato(req, params.id, {
    nome: "cancelar",
    quem: "dono_ou_admin",
    corpo: Corpo,
    executar: async ({ ctx, corpo }) => {
      const r = await cancelarContrato(repositorio(), params.id, ctx.userId, corpo.motivo);
      return { status: r.status };
    },
  });
}
