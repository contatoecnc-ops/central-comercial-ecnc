import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MicheleChat, MicheleStatusBadge, MicheleTempBadge, fmtTelefone } from "@/components/MicheleBits";
import { DeleteButton } from "@/components/DeleteButton";
import { Card } from "@/components/ui/card";
import { deleteAtendimento } from "@/app/actions/michele";
import { requireProfile } from "@/lib/auth";
import { fmtDateTime } from "@/lib/dates";
import { KOMMO_LEAD_URL } from "@/lib/michele/config";
import { getConversa } from "@/lib/michele/queries";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm">{children || "—"}</dd>
    </div>
  );
}

export default async function ConversaPage({ params }: { params: { id: string } }) {
  await requireProfile("admin");
  if (!UUID.test(params.id)) notFound();
  const conversa = await getConversa(params.id);
  if (!conversa) notFound();
  const { atendimento: a, mensagens } = conversa;

  return (
    <>
      <PageHeader
        title={a.nome || "Sem nome"}
        breadcrumb={[
          { label: "Admin" },
          { label: "Michele IA", href: "/admin/michele" },
          { label: "Conversas", href: "/admin/michele/conversas" },
          { label: fmtTelefone(a.telefone) },
        ]}
        actions={
          <DeleteButton
            action={deleteAtendimento.bind(null, a.id)}
            confirmText="Excluir este atendimento e todas as mensagens? Isso não pode ser desfeito."
            redirectTo="/admin/michele/conversas"
            label="Excluir atendimento"
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <MicheleChat mensagens={mensagens} />
        </Card>

        <aside>
          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <MicheleStatusBadge status={a.status_efetivo} />
              <MicheleTempBadge temperatura={a.temperatura} />
              {a.prioridade && (
                <span className="rounded-md border border-brand/40 bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">Prioridade</span>
              )}
            </div>
            <dl className="space-y-3">
              <Item label="Score">{a.score}</Item>
              <Item label="Segmento">{a.segmento}</Item>
              <Item label="Budget">{a.budget}</Item>
              <Item label="Produto provável">{a.produto_provavel}</Item>
              <Item label="Momento de compra">{a.momento_compra}</Item>
              <Item label="Campanha">{a.campanha}</Item>
              <Item label="Origem">{a.origem}</Item>
              <Item label="Iniciada em">{fmtDateTime(a.iniciado_em)}</Item>
              <Item label="Encerrada em">{a.encerrado_em ? fmtDateTime(a.encerrado_em) : null}</Item>
            </dl>
            {a.kommo_lead_id ? (
              <a
                href={`${KOMMO_LEAD_URL}${a.kommo_lead_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
              >
                Abrir card no Kommo <ExternalLink size={14} />
              </a>
            ) : (
              <p className="text-xs text-muted">Sem card no Kommo ainda.</p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
