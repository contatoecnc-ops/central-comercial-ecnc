"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ClipboardCopy, X } from "lucide-react";
import type { GrupoGuia } from "@/lib/contratos-campos";
import { cn } from "@/lib/utils";

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // alternativa para contextos sem a API (ex.: página sem HTTPS)
    try {
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Guia "Dados que o agente vai precisar". Tudo local: nada daqui é enviado ao servidor. */
export function GuiaCampos({ grupos, roteiro, compacto = false }: { grupos: GrupoGuia[]; roteiro: string; compacto?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copiarRoteiro() {
    if (await copiar(roteiro)) {
      setCopiado(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiado(false), 2000);
    } else {
      toast.error("Não foi possível copiar. Seu navegador bloqueou o acesso à área de transferência.");
    }
  }

  return (
    <div className="text-left">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">Dados que o agente vai precisar</h2>
          <p className="text-xs text-muted">
            <span aria-hidden className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-brand align-middle" />
            grupo obrigatório · <span className="text-muted/60">texto cinza = opcional</span>. Pode mandar tudo de uma vez, na ordem que quiser.
          </p>
        </div>
        <button
          type="button"
          onClick={copiarRoteiro}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          {copiado ? <Check size={14} className="text-emerald-400" /> : <ClipboardCopy size={14} />}
          {copiado ? "Copiado" : "Copiar roteiro"}
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {copiado ? "Roteiro copiado para a área de transferência" : ""}
        </span>
      </div>

      <div className={cn("grid items-start gap-3", compacto ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
        {grupos.map((g) => (
          <section key={g.id} aria-labelledby={`guia-${g.id}`} className="rounded-lg border border-border bg-background p-3">
            <h3 id={`guia-${g.id}`} className={cn("mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide", !g.obrigatorio && "text-muted")}>
              {g.obrigatorio ? (
                <>
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  <span className="sr-only">Obrigatório: </span>
                </>
              ) : (
                <span className="sr-only">Opcional: </span>
              )}
              {g.titulo}
              {!g.obrigatorio && <span aria-hidden className="text-[10px] font-normal normal-case">(opcional)</span>}
            </h3>
            {g.nota && <p className="mb-2 text-[11px] leading-snug text-muted">{g.nota}</p>}
            <ul className="space-y-1 text-xs leading-snug">
              {g.itens.map((i, k) => (
                <li key={k} className={cn(i.opcional && "text-muted/60")}>
                  {i.rotulo}
                  {i.opcional && <span className="sr-only"> (opcional)</span>}
                  {i.opcoes && <span className="text-muted"> — {i.opcoes.join(" · ")}</span>}
                  {i.exemplo && <span className="text-muted/70"> · ex.: {i.exemplo}</span>}
                  {i.dica && <span className="block text-[11px] text-muted/70">{i.dica}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Painel lateral com o guia (botão "Ver campos"). Esc fecha; o foco fica preso no painel e volta ao botão ao fechar. */
export function PainelGuia({ aberto, aoFechar, grupos, roteiro }: { aberto: boolean; aoFechar: () => void; grupos: GrupoGuia[]; roteiro: string }) {
  const painel = useRef<HTMLDivElement>(null);
  const fechar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    fechar.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") return void aoFechar();
      if (e.key !== "Tab" || !painel.current) return;
      const f = Array.from(painel.current.querySelectorAll<HTMLElement>("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])"));
      if (!f.length) return;
      const primeiro = f[0];
      const ultimo = f[f.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      anterior?.focus();
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/70" onClick={aoFechar} aria-hidden />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-label="Dados que o agente vai precisar"
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Ver campos</p>
          <button
            ref={fechar}
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="rounded-md p-1.5 text-muted hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <GuiaCampos grupos={grupos} roteiro={roteiro} compacto />
        </div>
      </div>
    </div>
  );
}
