import { Check, X } from "lucide-react";
import { ConfigBotao } from "@/components/contratos/ConfigBotoes";
import { SeloSandbox } from "@/components/contratos/Bits";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { zapsignAtivo } from "@/lib/agente-contratos";
import { GESTOR_ASSINATURA } from "@/lib/contratos-config";
import { exigirPaginaContratos } from "@/lib/contratos/servidor";

export const dynamic = "force-dynamic";

function Var({ nome, ok }: { nome: string; ok: boolean }) {
  return (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      {ok ? <Check size={16} className="text-emerald-400" /> : <X size={16} className="text-red-400" />}
      <code className="text-xs">{nome}</code>
      <span className="text-xs text-muted">{ok ? "configurada" : "ausente"}</span>
    </li>
  );
}

// Só mostra se cada variável existe. Nunca exibe valor de segredo.
export default async function ConfigContratosPage() {
  await exigirPaginaContratos("admin");
  const tem = (n: string) => !!process.env[n];
  const ambiente = process.env.ZAPSIGN_AMBIENTE === "producao" ? "produção" : "sandbox";

  return (
    <>
      <PageHeader
        back="/admin/contratos"
        title="Configurações de Contratos"
        breadcrumb={[{ label: "Contratos", href: "/admin/contratos" }, { label: "Configurações" }]}
        actions={<SeloSandbox />}
      />

      <div className="grid max-w-4xl gap-6">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Variáveis na Vercel</h2>
          <ul className="grid gap-x-8 sm:grid-cols-2">
            {["ANTHROPIC_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CENTRAL_URL", "TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "ZAPSIGN_API_TOKEN", "ZAPSIGN_WEBHOOK_SECRET"].map((n) => (
              <Var key={n} nome={n} ok={tem(n)} />
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Os valores nunca aparecem aqui. Para trocar, altere na Vercel e faça um novo deploy.</p>
        </Card>

        <Card className="p-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Telegram</h2>
          <p className="mb-4 text-sm text-muted">
            Registra o endereço do webhook no bot. Rode uma vez depois do deploy (e de novo se trocar a URL da Central ou o segredo).
          </p>
          <ConfigBotao rota="/api/telegram/configurar" rotulo="Configurar webhook do Telegram" sucesso="Webhook do Telegram configurado" />
        </Card>

        <Card className="p-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">ZapSign</h2>
          <dl className="mb-4 space-y-1 text-sm">
            <div className="flex gap-3">
              <dt className="w-48 text-muted">Integração</dt>
              <dd className="font-semibold">{zapsignAtivo() ? "Ligada" : "Desligada (fluxo manual: baixar o .docx)"}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-48 text-muted">Ambiente</dt>
              <dd className="font-semibold">{ambiente}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-48 text-muted">Gestor signatário</dt>
              <dd>
                {GESTOR_ASSINATURA.nome ? <span className="font-semibold">{GESTOR_ASSINATURA.nome}</span> : <span className="text-yellow-300">nome completo pendente</span>}{" "}
                <span className="text-muted">({GESTOR_ASSINATURA.email})</span>
              </dd>
            </div>
          </dl>
          <p className="mb-4 text-sm text-muted">
            Registra o webhook no ZapSign. Registre de novo ao trocar de sandbox para produção (tokens e contas são diferentes).
          </p>
          <ConfigBotao rota="/api/zapsign/configurar" rotulo="Configurar webhook do ZapSign" sucesso="Webhook do ZapSign configurado" />
        </Card>
      </div>
    </>
  );
}
