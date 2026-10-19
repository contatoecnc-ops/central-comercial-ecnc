import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/ui/card";
import { ManualImage } from "@/components/ManualImage";
import { CopyTextButton } from "@/components/CopyTextButton";
import { StatusButtons } from "@/components/ContentActions";
import { ChannelChips, ContentNav, fileUrl } from "@/components/ContentBits";
import { requireProfile } from "@/lib/auth";
import {
  countPendingApproval,
  latestFiles,
  listContent,
  listContentFiles,
  profileNames,
  signedContentUrl,
} from "@/lib/content-queries";
import { fmtDateTime } from "@/lib/dates";
import { isImageMime, isVideoMime, transitionsFor, type Transition } from "@/lib/marketing-config";
import type { ContentFile, ContentItem } from "@/types/database";

async function ApprovalCard({
  item: i,
  files,
  assignee,
  transitions,
}: {
  item: ContentItem;
  files: ContentFile[];
  assignee?: string;
  transitions: Transition[];
}) {
  const videos = await Promise.all(
    files
      .filter((f) => f.storage_path && isVideoMime(f.mime_type))
      .map(async (f) => ({ id: f.id, url: await signedContentUrl(f.storage_path!, 3600) }))
  );
  return (
              <Card key={i.id} className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/admin/conteudo/${i.id}`} className="text-lg font-bold hover:text-brand">
                      {i.title}
                    </Link>
                    <p className="text-xs text-muted">
                      {i.scheduled_for ? fmtDateTime(i.scheduled_for) : "Sem data"}
                      {i.assigned_to && assignee ? ` · ${assignee}` : ""}
                    </p>
                  </div>
                  <ChannelChips channels={i.channels} />
                </div>

                <div className="space-y-3">
                  {files.filter((f) => f.storage_path && isImageMime(f.mime_type)).map((f) => (
                    <ManualImage key={f.id} src={fileUrl(f.id)} alt={f.file_name} />
                  ))}
                  {videos.map((v) =>
                    v.url ? <video key={v.id} controls preload="metadata" src={v.url} className="w-full rounded-lg border border-border bg-black" /> : null
                  )}
                  {files.filter((f) => !(f.storage_path && (isImageMime(f.mime_type) || isVideoMime(f.mime_type)))).map((f) => (
                    <a
                      key={f.id}
                      href={fileUrl(f.id, !f.external_url)}
                      target={f.external_url ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      className="block text-sm text-brand underline"
                    >
                      {f.file_name}
                    </a>
                  ))}
                </div>

                {i.caption && (
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <div className="flex justify-end">
                      <CopyTextButton text={i.caption} label="Copiar legenda" />
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{i.caption}</p>
                  </div>
                )}

                <StatusButtons contentId={i.id} transitions={transitions} commentPlaceholder="Comentário (obrigatório para pedir ajustes)" />
              </Card>
);
}

export default async function AprovacoesPage() {
  const me = await requireProfile("admin");
  const [items, pending] = await Promise.all([listContent({ status: ["em_aprovacao"] }), countPendingApproval()]);
  const latest = latestFiles(await listContentFiles(items.map((i) => i.id)));
  const names = await profileNames(items.flatMap((i) => (i.assigned_to ? [i.assigned_to] : [])));
  const decide = (status: (typeof items)[number]["status"]) =>
    transitionsFor(me.role, status).filter((t) => t.to === "aprovado" || t.to === "ajustes");

  return (
    <>
      <PageHeader title="Aprovações" breadcrumb={[{ label: "Conteúdo", href: "/admin/conteudo" }, { label: "Aprovações" }]} />
      <ContentNav role={me.role} active="/admin/conteudo/aprovacoes" pending={pending} />

      {items.length === 0 ? (
        <EmptyState>Nada aguardando aprovação.</EmptyState>
      ) : (
        <div className="space-y-8">
          {items.map((i) => (
            <ApprovalCard
              key={i.id}
              item={i}
              files={latest.get(i.id) ?? []}
              assignee={i.assigned_to ? names.get(i.assigned_to) : undefined}
              transitions={decide(i.status)}
            />
          ))}
        </div>
      )}
    </>
  );
}
