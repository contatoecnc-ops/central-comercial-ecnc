import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { DeleteButton } from "@/components/DeleteButton";
import { CopyTextButton } from "@/components/CopyTextButton";
import { AddVersionPanel, ContentForm } from "@/components/ContentForm";
import { CommentForm, ScheduleField, StatusButtons } from "@/components/ContentActions";
import { ChannelChips, ContentNav, FileGallery, StatusPill } from "@/components/ContentBits";
import { deleteContent } from "@/app/actions/content";
import { requireProfile } from "@/lib/auth";
import { countPendingApproval, getContent, listStaff, profileNames } from "@/lib/content-queries";
import { fmtDateTime, toInputValue } from "@/lib/dates";
import { STATUS_LABEL, canAddFiles, isLocked, transitionsFor, type ContentStatus } from "@/lib/marketing-config";
import { listMachines } from "@/lib/queries";

export default async function ConteudoDetalhePage({ params }: { params: { id: string } }) {
  const me = await requireProfile(["admin", "marketing"]);
  const data = await getContent(params.id);
  if (!data) notFound();
  const { item, files, events } = data;

  const [machines, staff, pending] = await Promise.all([
    listMachines(),
    listStaff(),
    me.role === "admin" ? countPendingApproval() : 0,
  ]);
  const names = await profileNames([
    ...events.flatMap((e) => (e.actor_id ? [e.actor_id] : [])),
    ...(item.approved_by ? [item.approved_by] : []),
    ...(item.assigned_to ? [item.assigned_to] : []),
  ]);
  const machine = machines.find((m) => m.id === item.machine_id);
  const locked = isLocked(item.status);
  const canDelete = me.role === "admin" || (item.created_by === me.id && (item.status === "ideia" || item.status === "arquivado"));
  const who = (id: string | null) => (id ? names.get(id) ?? "—" : "Sistema");

  return (
    <>
      <PageHeader
        title={item.title}
        breadcrumb={[{ label: "Conteúdo", href: "/admin/conteudo" }, { label: "Detalhe" }]}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill status={item.status} />
            {canDelete && (
              <DeleteButton
                action={deleteContent.bind(null, item.id)}
                confirmText={`Excluir "${item.title}" e todos os arquivos?`}
                redirectTo="/admin/conteudo/quadro"
              />
            )}
          </div>
        }
      />
      <ContentNav role={me.role} active="" pending={pending} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-muted">Canais</dt>
                <dd>{item.channels.length ? <ChannelChips channels={item.channels} /> : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Formato</dt>
                <dd>{item.format ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Produto</dt>
                <dd>{machine?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Campanha</dt>
                <dd>{item.campaign ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Responsável</dt>
                <dd>{item.assigned_to ? who(item.assigned_to) : "—"}</dd>
              </div>
              {item.approved_at && (
                <div>
                  <dt className="text-xs uppercase text-muted">Aprovado</dt>
                  <dd>
                    {who(item.approved_by)} · {fmtDateTime(item.approved_at)}
                  </dd>
                </div>
              )}
            </dl>

            <div className="space-y-1">
              <p className="text-xs uppercase text-muted">Publicação (horário de Brasília)</p>
              <ScheduleField contentId={item.id} initial={item.scheduled_for ? toInputValue(item.scheduled_for) : ""} />
            </div>

            {item.caption && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="flex justify-end">
                  <CopyTextButton text={item.caption} label="Copiar legenda" />
                </div>
                <p className="whitespace-pre-wrap text-sm">{item.caption}</p>
              </div>
            )}

            <StatusButtons contentId={item.id} transitions={transitionsFor(me.role, item.status)} />
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide">Arquivos</h2>
            <FileGallery files={files} isAdmin={me.role === "admin"} locked={locked} />
            {canAddFiles(item.status) ? (
              <div className="space-y-2 border-t border-border pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Adicionar nova versão</h3>
                <AddVersionPanel contentId={item.id} />
              </div>
            ) : (
              <p className="border-t border-border pt-3 text-xs text-muted">
                Arquivos novos só entram em ideia, produção ou ajustes (agora: {STATUS_LABEL[item.status as ContentStatus]}).
                {locked && " Reabra o conteúdo para trocar arquivos."}
              </p>
            )}
          </Card>

          <details className="rounded-lg border border-border bg-card">
            <summary className="cursor-pointer p-4 text-sm font-bold uppercase tracking-wide">Editar dados</summary>
            <div className="p-5 pt-0">
              {locked && <p className="mb-3 text-xs text-muted">Conteúdo {STATUS_LABEL[item.status].toLowerCase()}: reabra para editar.</p>}
              <ContentForm
                contentId={item.id}
                locked={locked}
                machines={machines.map((m) => ({ id: m.id, label: m.name }))}
                staff={staff.map((s) => ({ id: s.id, label: s.full_name }))}
                defaults={{
                  title: item.title,
                  caption: item.caption ?? "",
                  channels: item.channels,
                  format: item.format ?? "",
                  machine_id: item.machine_id ?? "",
                  campaign: item.campaign ?? "",
                  assigned_to: item.assigned_to ?? "",
                }}
              />
            </div>
          </details>
        </div>

        <Card className="h-fit space-y-4 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide">Linha do tempo</h2>
          <ol className="space-y-3">
            {events.length === 0 && <li className="text-sm text-muted">Sem eventos.</li>}
            {events.map((e) => (
              <li key={e.id} className="border-l-2 border-border pl-3 text-sm">
                <p className="text-xs text-muted">
                  {who(e.actor_id)} · {fmtDateTime(e.created_at)}
                </p>
                {e.event_type === "status_change" && (
                  <p>
                    {STATUS_LABEL[e.from_status as ContentStatus] ?? e.from_status} → <strong>{STATUS_LABEL[e.to_status as ContentStatus] ?? e.to_status}</strong>
                  </p>
                )}
                {e.event_type === "file_added" && <p className="text-muted">Arquivo adicionado ({e.body})</p>}
                {e.event_type === "comment" && <p className="whitespace-pre-wrap">{e.body}</p>}
                {e.event_type === "status_change" && e.body && <p className="whitespace-pre-wrap text-muted">“{e.body}”</p>}
              </li>
            ))}
          </ol>
          <CommentForm contentId={item.id} />
        </Card>
      </div>
    </>
  );
}
