import { ExternalLink } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { toEmbedUrl } from "@/lib/media";
import type { MachineMedia } from "@/types/database";

export function VideoSection({ title, items }: { title: string; items: MachineMedia[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((m) => {
          const embed = toEmbedUrl(m.url);
          return (
            <div key={m.id} className="space-y-2">
              {embed ? (
                <div className="aspect-video overflow-hidden rounded-lg border border-border bg-black">
                  <iframe
                    src={embed}
                    title={m.title}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    loading="lazy"
                  />
                </div>
              ) : (
                <ButtonLink href={m.url} target="_blank" rel="noopener noreferrer" variant="outline" className="w-full">
                  <ExternalLink size={16} /> Abrir vídeo
                </ButtonLink>
              )}
              <p className="text-sm text-muted">{m.title}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
