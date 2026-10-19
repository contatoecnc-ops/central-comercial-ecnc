import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { PriorityTag } from "@/components/ContentBits";
import { RequestForm } from "@/components/RequestForm";
import { CancelRequestButton, RequestCommentForm } from "@/components/RequestPanels";
import { AndamentoPill, ProgressSteps, RequestCommentList, RequestFilesList } from "@/components/RequestBits";
import { requireProfile } from "@/lib/auth";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { fmtSize } from "@/lib/manual-files";
import { profileNames } from "@/lib/content-queries";
import { getRequest, listDeliveryFiles, myProgress } from "@/lib/request-queries";
import { listMachines } from "@/lib/queries";

export default async function SolicitacaoDetalhePage({ params }: { params: { id: string } }) {
  const me = await requireProfile("vendedor");
  const data = await getRequest(params.id);
  if (!data) notFound();
  const { request, files, comments } = data;

  const [progress, machines] = await Promise.all([myProgress(), listMachines({ onlyActive: true })]);
  const state = progress.get(request.id);
  const andamento = state?.progress ?? "Aguardando triagem";
  const delivery = state?.has_delivery && request.content_id ? await listDeliveryFiles(request.content_id) : [];
  const names = await profileNames(comments.map((c) => c.author_id));
  const editable = request.status === "nova";
  const machine = machines.find((m) => m.id === request.machine_id);

  return (
    <>
      <PageHeader
        title={request.title}
        breadcrumb={[{ label: "Solicitações", href: "/vendedor/solicitacoes" }, { label: "Detalhe" }]}
        actions={
          <div className="flex items-center gap-2">
            <PriorityTag priority={request.priority} />
            <AndamentoPill label={andamento} />
            {editable && <CancelRequestButton requestId={request.id} />}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <ProgressSteps label={andamento} />
            {request.status === "recusada" && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">
                <p className="text-xs font-bold uppercase text-red-300">Motivo da recusa</p>
                <p className="whitespace-pre-wrap">{request.decision_note}</p>
              </div>
            )}
            {request.status === "aprovada" && request.decision_note && (
              <div className="rounded-md border border-border p-3 text-sm">
                <p className="text-xs font-bold uppercase text-muted">Observação do admin</p>
                <p className="whitespace-pre-wrap">{request.decision_note}</p>
              </div>
            )}
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
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

          {delivery.length > 0 && (
            <Card className="space-y-3 border-emerald-500/40 p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide">Material pronto</h2>
              <ul className="space-y-2">
                {delivery.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {f.file_name} {f.size_bytes ? <span className="text-xs text-muted">· {fmtSize(f.size_bytes)}</span> : null}
                    </span>
                    <a
                      href={`/api/solicitacoes/entrega/${f.id}`}
                      className="inline-flex h-8 items-center gap-2 rounded-md bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-dark"
                    >
                      <Download size={14} /> Baixar material
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="space-y-3 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide">Anexos</h2>
            <RequestFilesList files={files} base="/api/solicitacoes/arquivo" />
          </Card>

          {editable && (
            <details className="rounded-lg border border-border bg-card">
              <summary className="cursor-pointer p-4 text-sm font-bold uppercase tracking-wide">Editar solicitação</summary>
              <div className="p-5 pt-0">
                <RequestForm
                  requestId={request.id}
                  existingFiles={files}
                  machines={machines.map((m) => ({ id: m.id, name: m.name }))}
                  defaults={{
                    title: request.title,
                    description: request.description,
                    request_type: request.request_type,
                    machine_id: request.machine_id ?? "",
                    desired_by: request.desired_by ?? "",
                    priority: request.priority,
                  }}
                />
              </div>
            </details>
          )}
        </div>

        <Card className="h-fit space-y-4 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide">Conversa com o admin</h2>
          <RequestCommentList comments={comments} names={names} me={me.id} />
          <RequestCommentForm requestId={request.id} />
          {request.decided_at && <p className="text-xs text-muted">Decidida em {fmtDateTime(request.decided_at)}</p>}
        </Card>
      </div>
    </>
  );
}
