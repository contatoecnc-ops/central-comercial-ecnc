import Link from "next/link";
import { FileText, Film, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { DeleteButton } from "@/components/DeleteButton";
import { ManualImage } from "@/components/ManualImage";
import { StatusButtons } from "@/components/ContentActions";
import { deleteContentFile } from "@/app/actions/content";
import { fmtDateTime } from "@/lib/dates";
import { fmtSize } from "@/lib/manual-files";
import { signedContentUrl } from "@/lib/content-queries";
import {
  CHANNEL_SHORT,
  FILE_KIND_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  isImageMime,
  isVideoMime,
  transitionsFor,
  type ContentStatus,
} from "@/lib/marketing-config";
import type { ContentFile, ContentItem, Role } from "@/types/database";

export const fileUrl = (id: string, download = false) => `/api/conteudo/arquivo/${id}${download ? "?download=1" : ""}`;

export function StatusPill({ status, className }: { status: ContentStatus; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATUS_COLOR[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ChannelChips({ channels }: { channels: string[] }) {
  if (channels.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {channels.map((c) => (
        <span key={c} title={c} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/80">
          {CHANNEL_SHORT[c] ?? c}
        </span>
      ))}
    </span>
  );
}

const TABS = [
  { href: "/admin/conteudo", label: "Resumo" },
  { href: "/admin/conteudo/quadro", label: "Quadro" },
  { href: "/admin/conteudo/calendario", label: "Calendário" },
  { href: "/admin/conteudo/aprovacoes", label: "Aprovações", adminOnly: true },
  { href: "/admin/conteudo/novo", label: "Novo conteúdo" },
];

export function ContentNav({ role, active, pending = 0 }: { role: Role; active: string; pending?: number }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-border">
      {TABS.filter((t) => !t.adminOnly || role === "admin").map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            t.href === active ? "border-brand text-white" : "border-transparent text-muted hover:text-white"
          )}
        >
          {t.label}
          {t.adminOnly && pending > 0 && (
            <span className="ml-2 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">{pending}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** Cartão do quadro: miniatura da última versão, título, canais, data, responsável e ações sem comentário. */
export function ContentCard({
  item,
  latest,
  assignee,
  role,
}: {
  item: ContentItem;
  latest: ContentFile[];
  assignee?: string;
  role: Role;
}) {
  const thumb = latest.find((f) => f.storage_path && isImageMime(f.mime_type));
  const hasVideo = latest.some((f) => isVideoMime(f.mime_type));
  return (
    <Card className="space-y-2 p-3">
      <Link href={`/admin/conteudo/${item.id}`} className="block space-y-2">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(thumb.id)} alt="" loading="lazy" className="h-24 w-full rounded object-cover" />
        ) : (
          <div className="flex h-12 items-center justify-center rounded bg-white/5 text-muted">
            {hasVideo ? <Film size={18} /> : <FileText size={18} />}
          </div>
        )}
        <p className="text-sm font-semibold leading-snug">{item.title}</p>
        <ChannelChips channels={item.channels} />
        <p className="text-xs text-muted">
          {item.scheduled_for ? fmtDateTime(item.scheduled_for) : "Sem data"}
          {assignee ? ` · ${assignee}` : ""}
        </p>
      </Link>
      <StatusButtons contentId={item.id} transitions={transitionsFor(role, item.status)} compact />
    </Card>
  );
}

/** Arquivos agrupados por versão (a última em destaque). Vídeo usa URL assinada de 1 h gerada aqui no servidor. */
export async function FileGallery({
  files,
  isAdmin,
  locked,
}: {
  files: ContentFile[];
  isAdmin: boolean;
  locked: boolean;
}) {
  if (files.length === 0) return <p className="text-sm text-muted">Nenhum arquivo enviado.</p>;
  const versions = Array.from(new Set(files.map((f) => f.version))).sort((a, b) => b - a);
  const videoUrls = new Map<string, string | null>();
  await Promise.all(
    files
      .filter((f) => f.storage_path && isVideoMime(f.mime_type))
      .map(async (f) => videoUrls.set(f.id, await signedContentUrl(f.storage_path!, 3600)))
  );

  return (
    <div className="space-y-6">
      {versions.map((v, i) => (
        <section key={v} className={cn("space-y-3 rounded-lg border p-4", i === 0 ? "border-brand/50" : "border-border opacity-90")}>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
            Versão {v} {i === 0 && <span className="ml-1 rounded bg-brand px-1.5 py-0.5 text-[10px] text-white">atual</span>}
          </h3>
          <div className="space-y-3">
            {files
              .filter((f) => f.version === v)
              .map((f) => (
                <div key={f.id} className="space-y-2">
                  {f.storage_path && isImageMime(f.mime_type) && <ManualImage src={fileUrl(f.id)} alt={f.file_name} />}
                  {f.storage_path && isVideoMime(f.mime_type) && videoUrls.get(f.id) && (
                    <video controls preload="metadata" src={videoUrls.get(f.id)!} className="w-full rounded-lg border border-border bg-black" />
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      {f.external_url ? <Link2 size={16} className="shrink-0 text-muted" /> : <FileText size={16} className="shrink-0 text-muted" />}
                      <span className="truncate font-medium">{f.file_name}</span>
                      <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/80">{FILE_KIND_LABEL[f.kind]}</span>
                      {f.size_bytes ? <span className="shrink-0 text-xs text-muted">{fmtSize(f.size_bytes)}</span> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={fileUrl(f.id, !f.external_url)}
                        target={f.external_url ? "_blank" : undefined}
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-semibold hover:bg-white/5"
                      >
                        {f.external_url ? "Abrir link" : "Baixar"}
                      </a>
                      {isAdmin && !locked && (
                        <DeleteButton action={deleteContentFile.bind(null, f.id)} confirmText="Apagar este arquivo?" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
