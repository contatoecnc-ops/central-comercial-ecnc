import { cn } from "@/lib/utils";
import { NIVEL_ROTULO, sandboxZapsign } from "@/lib/contratos-config";

const NIVEL_CLS: Record<1 | 2 | 3, string> = {
  1: "border-white/15 bg-white/5 text-zinc-300",
  2: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  3: "border-brand bg-brand text-white",
};

/** Nível de atenção: Padrão (neutro), Atenção (amarelo), Atenção máxima (vermelho da marca). Motivos no hover. */
export function NivelBadge({ nivel, motivos = [] }: { nivel: 1 | 2 | 3; motivos?: string[] }) {
  return (
    <span
      title={motivos.length ? motivos.join("\n") : undefined}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold",
        NIVEL_CLS[nivel],
        motivos.length ? "cursor-help" : ""
      )}
    >
      {NIVEL_ROTULO[nivel]}
    </span>
  );
}

export const STATUS_ROTULO: Record<string, string> = {
  aguardando_aprovacao: "Aguardando aprovação",
  reprovado: "Reprovado",
  aprovado: "Pronto para enviar",
  enviado_cliente: "Com o cliente",
  assinado: "Assinado",
  cancelado: "Cancelado",
};

const STATUS_CLS: Record<string, string> = {
  aguardando_aprovacao: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  reprovado: "border-red-500/40 bg-red-500/10 text-red-300",
  aprovado: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  enviado_cliente: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  assinado: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  cancelado: "border-zinc-600/30 text-zinc-500 line-through",
};

export function StatusContratoBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium", STATUS_CLS[status])}>
      {STATUS_ROTULO[status] ?? status}
    </span>
  );
}

/** Selo bem visível enquanto o ZapSign estiver no ambiente de testes. */
export function SeloSandbox() {
  if (!sandboxZapsign()) return null;
  return (
    <span className="inline-flex items-center rounded-md border-2 border-dashed border-yellow-400 bg-yellow-400/10 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-yellow-300">
      Sandbox — sem validade
    </span>
  );
}
