import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { ContentNav, PriorityTag } from "@/components/ContentBits";
import { DecisionPanel, RequestCommentForm } from "@/components/RequestPanels";
import { RequestCommentList, RequestFilesList } from "@/components/RequestBits";
import { requireProfile } from "@/lib/auth";
import { countPendingApproval, listStaff, profileNames } from "@/lib/content-queries";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { countNewRequests, getRequest } from "@/lib/request-queries";
import { listMachines } from "@/lib/queries";

const STATUS_LABEL: Record<string, string> = { nova: "Aguardando triagem", aprovada: "Aprovada", recusada: "Recusada", cancelada: "Cancelada" };

export default async function SolicitacaoAdminPage({ params }: { params: { id: string } }) {
  const me = await requireProfile("admin");
  const data = await getRequest(params.id);
  if (!data) notFound();
  const { request, files, comments } = data;

  const [staff, machines, pending, novas] = await Promise.all([
    listStaff(),
    listMachines(),
    countPendingApproval(),
    countNewRequests(),
  ]);
  const names = await profileNames([request.requested_by, ...(request.decided_by ? [request.decided_by] : []), ...comments.map((c) => c.author_id)]);
  const machine = machines.find((m) => m.id === request.machine_id);

  return (
    <>
      <PageHeader
        title={request.title}
        breadcrumb={[{ label: "Solicitações", href: "/admin/conteudo/solicitacoes" }, { label: "Detalhe" }]}
        actions={
          <div className="flex items-center gap-2">
            <PriorityTag priority={request.priority} />
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold">{STATUS_LABEL[request.status]}</span>
          </div>
        }
      />
      <ContentNav role={me.role} active="/admin/conteudo/solicitacoes" pending={pending} requests={novas} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-muted">Vendedor</dt>
                <dd>{names.get(request.requested_by) ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Tipo</dt>
                <dd>{request.request_type}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Máquina</dt>
                <dd>{machine?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Preciso até</dt>
                <dd>{request.desired_by ? request.desired_by.split("-").reverse().join("/") : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Enviada em</dt>
                <dd>{fmtDate(request.created_at)}</dd>
              </div>
            </dl>
            <p className="whitespace-pre-wrap text-sm">{request.description}</p>
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide">Referências do vendedor</h2>
            <RequestFilesList files={files} base="/api/solicitacoes/arquivo" />
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide">Decisão</h2>
            {request.status === "nova" ? (
              <DecisionPanel
                requestId={request.id}
                defaults={{ title: request.title, description: request.description, priority: request.priority }}
                staff={staff.map((s) => ({ id: s.id, label: s.full_name }))}
              />
            ) : (
              <div className="space-y-2 text-sm">
                <p>
                  {STATUS_LABEL[request.status]}
                  {request.decided_by ? ` por ${names.get(request.decided_by) ?? "—"}` : ""}
                  {request.decided_at ? ` em ${fmtDateTime(request.decided_at)}` : ""}.
                </p>
                {request.decision_note && <p className="whitespace-pre-wrap text-muted">“{request.decision_note}”</p>}
                {request.content_id && (
                  <Link href={`/admin/conteudo/${request.content_id}`} className="inline-block text-brand underline">
                    Abrir o conteúdo criado
                  </Link>
                )}
              </div>
            )}
          </Card>
        </div>

        <Card className="h-fit space-y-4 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide">Conversa com o vendedor</h2>
          <RequestCommentList comments={comments} names={names} me={me.id} />
          <RequestCommentForm requestId={request.id} />
        </Card>
      </div>
    </>
  );
}
