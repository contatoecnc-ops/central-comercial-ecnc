import { marcarAssinado, zapsignAtivo } from "@/lib/agente-contratos";
import { acaoContrato, erro, repositorio } from "@/lib/contratos/rota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Só admin e só com o ZapSign desligado. Com ele ligado, "assinado" vem exclusivamente do webhook.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return acaoContrato(req, params.id, {
    nome: "marcar assinado",
    quem: "admin",
    antes: () => (zapsignAtivo() ? erro(403, "Com o ZapSign ligado, a assinatura é registrada automaticamente.") : null),
    executar: async ({ ctx }) => {
      const r = await marcarAssinado(repositorio(), params.id, ctx.userId);
      return { status: r.status };
    },
  });
}
