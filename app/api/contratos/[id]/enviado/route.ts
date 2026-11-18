import { marcarEnviado, zapsignAtivo } from "@/lib/agente-contratos";
import { acaoContrato, erro, repositorio } from "@/lib/contratos/rota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Fluxo manual (baixar o .docx e enviar por fora). Com o ZapSign ligado o envio é "Enviar para assinatura".
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return acaoContrato(req, params.id, {
    nome: "marcar enviado",
    quem: "dono_ou_admin",
    antes: () => (zapsignAtivo() ? erro(409, "Com o ZapSign ligado, use \"Enviar para assinatura\".") : null),
    executar: async ({ ctx }) => {
      const r = await marcarEnviado(repositorio(), params.id, ctx.userId);
      return { status: r.status };
    },
  });
}
