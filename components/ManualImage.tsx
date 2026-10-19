"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, X } from "lucide-react";

/** Imagem na largura da tela; ao tocar abre em tela cheia com zoom (botões, pinch no celular e rolagem). */
export function ManualImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function close() {
    setOpen(false);
    setZoom(1);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ampliar imagem"
        className="block w-full overflow-hidden rounded-lg border border-border bg-black"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="h-auto w-full" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/95" role="dialog" aria-modal="true" aria-label={alt}>
          <div className="absolute inset-0 overflow-auto" style={{ touchAction: "pan-x pan-y pinch-zoom" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="mx-auto block max-w-none"
              style={{ width: `${zoom * 100}%`, minWidth: "100%" }}
            />
          </div>
          <div className="fixed right-3 top-3 flex gap-2">
            <button
              type="button"
              aria-label="Diminuir zoom"
              onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
              className="rounded-full bg-black/70 p-2 text-white hover:bg-white/20"
            >
              <Minus size={18} />
            </button>
            <button
              type="button"
              aria-label="Aumentar zoom"
              onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
              className="rounded-full bg-black/70 p-2 text-white hover:bg-white/20"
            >
              <Plus size={18} />
            </button>
            <button
              type="button"
              aria-label="Fechar"
              onClick={close}
              className="rounded-full bg-black/70 p-2 text-white hover:bg-white/20"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
