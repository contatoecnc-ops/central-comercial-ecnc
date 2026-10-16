import { notFound } from "next/navigation";
import { ExternalLink, FileText } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PhotoGallery } from "@/components/PhotoGallery";
import { VideoSection } from "@/components/VideoSection";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getMachine } from "@/lib/queries";
import { toImageUrl } from "@/lib/media";

export default async function MaquinaPage({ params }: { params: { id: string } }) {
  const { machine, media } = await getMachine(params.id);
  if (!machine.active) notFound();

  const byType = (t: string) => media.filter((m) => m.type === t);
  const photos = byType("foto").map((m) => ({ id: m.id, title: m.title, src: toImageUrl(m.url) }));
  if (photos.length === 0 && machine.thumbnail_url) {
    photos.push({ id: "thumb", title: machine.name, src: toImageUrl(machine.thumbnail_url) });
  }
  const pdfs = byType("pdf");
  const links = byType("link");

  return (
    <>
      <PageHeader
        title={machine.name}
        breadcrumb={[{ label: "Catálogo", href: "/vendedor/catalogo" }, { label: machine.name }]}
        actions={<span className="rounded-full bg-brand px-3 py-1 text-xs font-bold">{machine.category}</span>}
      />
      {machine.tagline && <p className="-mt-4 mb-8 text-lg text-muted">{machine.tagline}</p>}

      <div className="space-y-10">
        <PhotoGallery photos={photos} />

        {machine.description && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide">Descrição</h2>
            <p className="max-w-3xl whitespace-pre-wrap leading-relaxed text-white/90">{machine.description}</p>
          </section>
        )}

        {machine.specs?.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide">Especificações técnicas</h2>
            <Card className="max-w-3xl divide-y divide-border">
              {machine.specs.map((s, i) => (
                <div key={i} className="flex justify-between gap-4 px-4 py-3 text-sm">
                  <span className="text-muted">{s.label}</span>
                  <span className="text-right font-semibold">{s.value}</span>
                </div>
              ))}
            </Card>
          </section>
        )}

        <VideoSection title="Vídeos" items={byType("video")} />
        <VideoSection title="Vídeos de teste" items={byType("video_teste")} />

        {pdfs.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide">Downloads</h2>
            <Card className="max-w-3xl divide-y divide-border">
              {pdfs.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 p-4">
                  <span className="flex min-w-0 items-center gap-3 text-sm">
                    <FileText size={18} className="shrink-0 text-brand" />
                    <span className="truncate">{m.title}</span>
                  </span>
                  <ButtonLink href={m.url} target="_blank" rel="noopener noreferrer" variant="outline" size="sm">
                    Abrir no Drive
                  </ButtonLink>
                </div>
              ))}
            </Card>
          </section>
        )}

        {links.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide">Links úteis</h2>
            <ul className="space-y-2">
              {links.map((m) => (
                <li key={m.id}>
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-white hover:text-brand"
                  >
                    <ExternalLink size={14} /> {m.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
