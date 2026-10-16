"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function PhotoGallery({ photos }: { photos: { id: string; title: string; src: string }[] }) {
  const [current, setCurrent] = useState(0);
  if (photos.length === 0) return null;
  const active = photos[current];

  return (
    <div className="space-y-3">
      <div className="aspect-video overflow-hidden rounded-lg border border-border bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={active.src} alt={active.title} className="h-full w-full object-contain" />
      </div>
      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setCurrent(i)}
              aria-label={p.title}
              className={cn(
                "h-16 w-24 shrink-0 overflow-hidden rounded-md border-2 bg-black transition-colors",
                i === current ? "border-brand" : "border-border hover:border-white/30"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
