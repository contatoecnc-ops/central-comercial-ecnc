import { configZapsignDoAmbiente, enviarContratoParaAssinatura, zapsignAtivo } from "@/lib/agente-contratos";
import { GESTOR_ASSINATURA } from "@/lib/contratos-config";
import { executarEmSegundoPlano } from "@/lib/contratos/background";
import { acaoContrato, erro, repositorio } from "@/lib/contratos/rota";
import { avisarEnviadoAoVendedor, montarVendedor } from "@/lib/contratos/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vendedor dono ou admin. O pacote NÃO confere o status aqui, então a Central exige "aprovado".
// Gestor no ZapSign: sempre a pessoa fixa de GESTOR_ASSINATURA, qualquer que seja o admin que aprovou.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return acaoContrato(req, params.id, {
    nome: "enviar para assinatura",
    quem: "dono_ou_admin",
    antes: (_ctx, c) => {
      if (!zapsignAtivo()) return erro(409, "O ZapSign está desligado. Baixe o .docx e marque como enviado.");
      if (c.status !== "aprovado") return erro(409, c.status === "aguardando_aprovacao" ? "Contrato ainda não foi aprovado." : `Contrato está "${c.status}".`);
      if (!GESTOR_ASSINATURA.nome.trim()) return erro(409, "Falta o nome completo do gestor signatário (lib/contratos-config.ts).");
      return null;
    },
    executar: async ({ ctx, contrato }) => {
      const v = await montarVendedor(contrato.vendedor_id);
      if (!v?.nome || !v.email) throw new Error("Falta nome ou e-mail no perfil do vendedor.");
      const r = await enviarContratoParaAssinatura(
        repositorio(), params.id, ctx.userId, configZapsignDoAmbiente(),
        { vendedor: { nome: v.nome, email: v.email }, gestor: { nome: GESTOR_ASSINATURA.nome, email: GESTOR_ASSINATURA.email } },
      );
      executarEmSegundoPlano(() => avisarEnviadoAoVendedor(r.contrato));
      return { status: r.contrato.status };
    },
  });
}
