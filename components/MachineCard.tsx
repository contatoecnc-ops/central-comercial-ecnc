import Link from "next/link";
import { Cpu } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Machine } from "@/types/database";

export function MachineCard({ machine, href }: { machine: Machine; href: string }) {
  return (
    <Link href={href} className="group block">
      <Card className="overflow-hidden transition-colors group-hover:border-brand/60">
        <div className="relative aspect-[4/3] bg-black">
          {machine.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={machine.thumbnail_url}
              alt={machine.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-border">
              <Cpu size={48} />
            </div>
          )}
          <span className="absolute left-3 top-3 rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold">
            {machine.category}
          </span>
        </div>
        <div className="space-y-1 p-4">
          <h3 className="font-bold">{machine.name}</h3>
          {machine.tagline && <p className="line-clamp-2 text-sm text-muted">{machine.tagline}</p>}
        </div>
      </Card>
    </Link>
  );
}
