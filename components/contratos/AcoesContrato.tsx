"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Download, FileSignature, Pencil, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";

type Modo = "reprovar" | "cancelar" | null;

/**
 * Botões do passo atual do contrato. As regras de verdade estão nas rotas (e no pacote);
 * aqui só se esconde o que não faz sentido e se explica por que um botão está desabilitado.
 */
export function AcoesContrato({
  id,
  status,
  papel,
  zapsignAtivo,
  temArquivo,
  docsPendentes,
  compacto = false,
}: {
  id: string;
  status: string;
  papel: "admin" | "vendedor";
  zapsignAtivo: boolean;
  temArquivo: boolean;
  docsPendentes: string[];
  compacto?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [modo, setModo] = useState<Modo>(null);
  const [motivo, setMotivo] = useState("");

  async function chamar(acao: string, corpo?: Record<string, unknown>, ok?: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/contratos/${id}/${acao}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo ?? {}),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return void toast.error(j.erro ?? "Não foi possível concluir a ação.");
      toast.success(ok ?? "Pronto");
      setModo(null);
      setMotivo("");
      router.refresh();
    } catch {
      toast.error("Sem conexão. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  const size = compacto ? "sm" : "md";
  const admin = papel === "admin";
  const botoes: React.ReactNode[] = [];

  if (temArquivo && status !== "cancelado") {
    botoes.push(
      <a
        key="baixar"
        href={`/api/contratos/${id}/arquivo`}
        className={`inline-flex items-center justify-center gap-2 rounded-md border border-border font-semibold transition-colors hover:bg-white/5 ${compacto ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm"}`}
      >
        <Download size={compacto ? 14 : 16} /> Baixar .docx
      </a>
    );
  }

  if (status === "aguardando_aprovacao" && admin) {
    const bloqueado = docsPendentes.length > 0;
    botoes.unshift(
      <Button
        key="aprovar"
        size={size}
        disabled={busy || bloqueado}
        title={bloqueado ? `Faltam documentos: ${docsPendentes.join("; ")}` : undefined}
        onClick={() => chamar("aprovar", undefined, "Contrato aprovado")}
      >
        <Check size={compacto ? 14 : 16} /> Aprovar
      </Button>,
      <Button key="reprovar" size={size} variant="outline" disabled={busy} onClick={() => setModo(modo === "reprovar" ? null : "reprovar")}>
        <X size={compacto ? 14 : 16} /> Reprovar
      </Button>
    );
  }
  if (status === "reprovado" && papel === "vendedor") {
    botoes.unshift(
      <Link
        key="corrigir"
        href={`/vendedor/contratos/chat?corrigir=${id}`}
        className={`inline-flex items-center justify-center gap-2 rounded-md bg-brand font-semibold text-white transition-colors hover:bg-brand-dark ${compacto ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm"}`}
      >
        <Pencil size={compacto ? 14 : 16} /> Corrigir
      </Link>
    );
  }
  if (status === "aprovado") {
    botoes.unshift(
      zapsignAtivo ? (
        <Button key="zap" size={size} disabled={busy} onClick={() => chamar("enviar-assinatura", undefined, "Enviado para assinatura")}>
          <FileSignature size={compacto ? 14 : 16} /> Enviar para assinatura
        </Button>
      ) : (
        <Button key="enviado" size={size} disabled={busy} onClick={() => chamar("enviado", undefined, "Marcado como enviado ao cliente")}>
          <Send size={compacto ? 14 : 16} /> Marquei como enviado
        </Button>
      )
    );
  }
  if (status === "enviado_cliente" && admin && !zapsignAtivo) {
    botoes.unshift(
      <Button
        key="assinado"
        size={size}
        disabled={busy}
        onClick={() => {
          if (window.confirm("Confirmar que todas as assinaturas foram feitas?")) void chamar("assinado", undefined, "Contrato assinado");
        }}
      >
        <Check size={compacto ? 14 : 16} /> Marcar como assinado
      </Button>
    );
  }
  if (["aguardando_aprovacao", "reprovado", "aprovado", "enviado_cliente"].includes(status)) {
    botoes.push(
      <Button key="cancelar" size={size} variant="danger" disabled={busy} onClick={() => setModo(modo === "cancelar" ? null : "cancelar")}>
        Cancelar
      </Button>
    );
  }

  if (!botoes.length) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">{botoes}</div>
      {modo && (
        <div className="space-y-2 rounded-md border border-border bg-background p-3">
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={2000}
            placeholder={modo === "reprovar" ? "Motivo da reprovação (o vendedor vai ver)" : "Motivo do cancelamento"}
            className="min-h-[72px]"
            aria-label={modo === "reprovar" ? "Motivo da reprovação" : "Motivo do cancelamento"}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={modo === "cancelar" ? "danger" : "primary"}
              disabled={busy || !motivo.trim()}
              onClick={() => chamar(modo, { motivo }, modo === "reprovar" ? "Contrato reprovado" : "Contrato cancelado")}
            >
              {modo === "reprovar" ? "Confirmar reprovação" : "Confirmar cancelamento"}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setModo(null)}>
              Voltar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
