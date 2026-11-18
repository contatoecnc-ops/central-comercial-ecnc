import { cn } from "@/lib/utils";
import { diaMes, ROTULO_ESTADO_VENDEDOR, type EstadoAnalise, type SeloAnalise } from "@/lib/analise-credito/regras";

const COR: Record<string, string> = {
  aprovada: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  reprovada: "border-red-500/50 bg-red-500/10 text-red-300",
  vencida: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  sem: "border-red-500/60 bg-white/5 text-red-300 font-semibold",
  pendente: "border-white/15 bg-white/5 text-zinc-300",
};

/**
 * Selo da análise de crédito. Admin: "Análise: aprovada · vale até dd/mm" e, sem análise, o aviso vermelho.
 * Vendedor: só o texto ("Análise de crédito: aprovada / pendente / reprovada / vencida"), sem validade nem link.
 */
export function SeloAnaliseBadge({ selo, papel }: { selo: SeloAnalise | null | undefined; papel: "admin" | "vendedor" }) {
  if (!selo) return null; // contrato à vista, cartão ou financiamento: sem selo
  if (papel === "vendedor") {
    const cor = selo.estado === "sem" ? COR.pendente : COR[selo.estado];
    return (
      <span className={cn("inline-flex w-fit rounded-md border px-2 py-0.5 text-xs", cor)}>
        Análise de crédito: {ROTULO_ESTADO_VENDEDOR[selo.estado]}
      </span>
    );
  }
  if (selo.estado === "sem") {
    return <span className={cn("inline-flex w-fit rounded-md border px-2 py-0.5 text-xs", COR.sem)}>⚠ Sem análise de crédito vinculada</span>;
  }
  const e: EstadoAnalise = selo.estado;
  return (
    <span className={cn("inline-flex w-fit rounded-md border px-2 py-0.5 text-xs font-medium", COR[e])}>
      Análise: {e}
      {e === "aprovada" && selo.validade ? ` · vale até ${diaMes(selo.validade)}` : ""}
    </span>
  );
}
