"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, MessageSquarePlus, SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Msg { role: "user" | "assistant"; texto: string }
interface Gerado { id: string; numero: string }

const MAX = 8000;

/** Conversa com o agente de contratos, no estilo de mensageiro. O texto é sempre exibido como texto puro. */
export function ChatContratos({
  conversaId,
  inicial,
  rascunho,
  contratoGerado,
}: {
  conversaId: string;
  inicial: Msg[];
  rascunho?: string;
  contratoGerado: Gerado | null;
}) {
  const router = useRouter();
  const [id, setId] = useState<string | undefined>(conversaId);
  const [msgs, setMsgs] = useState<Msg[]>(inicial);
  const [gerado, setGerado] = useState<Gerado | null>(contratoGerado);
  const [texto, setTexto] = useState(rascunho ?? "");
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, enviando, gerado]);

  async function enviar() {
    const mensagem = texto.trim();
    if (!mensagem || enviando) return;
    setMsgs((m) => [...m, { role: "user", texto: mensagem }]);
    setTexto("");
    setEnviando(true);
    try {
      const r = await fetch("/api/contratos/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(id ? { conversa_id: id } : {}), mensagem }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.erro ?? "Não foi possível enviar a mensagem.");
        setMsgs((m) => m.slice(0, -1));
        setTexto(mensagem);
        return;
      }
      setId(j.conversa_id);
      setMsgs((m) => [...m, { role: "assistant", texto: j.texto || "(sem resposta)" }]);
      if (j.contrato_gerado) {
        setGerado(j.contrato_gerado);
        router.refresh(); // atualiza o contador de aprovações e o quadro
      }
    } catch {
      toast.error("Sem conexão. Tente de novo.");
      setMsgs((m) => m.slice(0, -1));
      setTexto(mensagem);
    } finally {
      setEnviando(false);
    }
  }

  async function novo() {
    if (msgs.length && !window.confirm("Encerrar esta conversa e começar outro contrato?")) return;
    const r = await fetch("/api/contratos/chat/novo", { method: "POST" });
    if (!r.ok) return void toast.error("Não foi possível iniciar outro contrato.");
    setMsgs([]);
    setGerado(null);
    setId(undefined);
    setTexto("");
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-14rem)] min-h-[420px] max-w-3xl flex-col rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">Agente de Contratos</p>
        <Button size="sm" variant="outline" onClick={novo} disabled={enviando}>
          <MessageSquarePlus size={14} /> Novo contrato
        </Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {msgs.length === 0 && (
          <p className="mx-auto max-w-md pt-10 text-center text-sm text-muted">
            Me mande os dados da venda do jeito que tiver: cliente (PF ou PJ), máquina, valores e forma de pagamento. Eu confiro tudo e monto o contrato.
          </p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                m.role === "user" ? "rounded-br-sm bg-brand text-white" : "rounded-bl-sm border border-border bg-background"
              )}
            >
              {m.texto}
            </div>
          </div>
        ))}
        {enviando && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm border border-border bg-background px-3.5 py-2 text-sm text-muted">
              Digitando… (pode levar alguns segundos)
            </div>
          </div>
        )}
        {gerado && (
          <div className="mx-auto max-w-md rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-center text-sm">
            <p className="font-semibold text-emerald-300">Contrato {gerado.numero} enviado para aprovação do gestor</p>
            <Link href={`/vendedor/contratos/${gerado.id}`} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold underline hover:text-brand">
              <FileText size={12} /> Abrir contrato
            </Link>
          </div>
        )}
        <div ref={fim} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, MAX))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          rows={2}
          placeholder="Escreva os dados da venda…  (Enter envia, Shift+Enter quebra a linha)"
          aria-label="Mensagem para o agente"
          className="max-h-40 min-h-[44px] flex-1 resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-white placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <Button type="submit" disabled={enviando || !texto.trim()} aria-label="Enviar" className="h-11 w-11 shrink-0 px-0">
          <SendHorizonal size={18} />
        </Button>
      </form>
    </div>
  );
}
