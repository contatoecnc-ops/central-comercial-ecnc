"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";

type Whats = { ok: true; href: string } | { ok: false; motivo: string };

const BTN = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold sm:min-h-9";

/** Botões do link de assinatura. Nada aqui é gravado nem logado; o link só vive na tela. */
export function AcoesAssinatura({ url, whatsapp }: { url: string; whatsapp: Whats }) {
  const [copiado, setCopiado] = useState(false);
  const [falhou, setFalhou] = useState(false);

  async function copiar() {
    setFalhou(false);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      try {
        const t = document.createElement("textarea");
        t.value = url;
        t.setAttribute("readonly", "");
        t.style.position = "fixed";
        t.style.opacity = "0";
        document.body.appendChild(t);
        t.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(t);
        if (!ok) throw new Error("copy");
      } catch {
        setFalhou(true);
        return;
      }
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
      <button type="button" onClick={copiar} className={`${BTN} border-border bg-white/5 hover:bg-white/10`}>
        {copiado ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
        {copiado ? "Link copiado" : "Copiar link"}
      </button>
      {whatsapp.ok ? (
        <a href={whatsapp.href} target="_blank" rel="noopener noreferrer" className={`${BTN} border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25`}>
          <MessageCircle size={16} /> Enviar pelo WhatsApp
        </a>
      ) : (
        <span className="flex flex-col">
          <button type="button" disabled aria-describedby="sem-tel" className={`${BTN} cursor-not-allowed border-border bg-white/5 opacity-50`}>
            <MessageCircle size={16} /> Enviar pelo WhatsApp
          </button>
          <span id="sem-tel" className="mt-1 text-xs text-yellow-300">{whatsapp.motivo}</span>
        </span>
      )}
      {falhou && <span className="text-xs text-red-300">Não consegui copiar — use o WhatsApp ou copie pelo navegador.</span>}
    </div>
  );
}
