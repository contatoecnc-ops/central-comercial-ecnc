import { AcoesAssinatura } from "@/components/contratos/AcoesAssinatura";
import { planejarAssinaturas, type EntradaPlano } from "@/lib/contratos/assinatura-whatsapp";
import { fmtDayMonth } from "@/lib/dates";

const ROTULO_PAPEL: Record<string, string> = {
  cliente: "Cliente (comprador)",
  garantidor: "Garantidor solidário",
  testemunha_cliente: "Testemunha do cliente",
  testemunha: "Testemunha ECNC (vendedor)",
  contratada: "Gestor ECNC (contratada)",
};

/**
 * Lista de assinaturas com "Copiar link" / "Enviar pelo WhatsApp" para o PRÓXIMO signatário pendente.
 * O que cada pessoa pode ver é decidido em planejarAssinaturas (lib/contratos/assinatura-whatsapp.ts).
 */
export function ListaAssinaturas(entrada: EntradaPlano) {
  return (
    <ol className="space-y-4">
      {planejarAssinaturas(entrada).map((p) => (
        <li key={p.indice} className="flex flex-col gap-2 border-b border-border/60 pb-4 text-sm last:border-0 last:pb-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">{p.indice + 1}</span>
            <span className="min-w-0">
              <span className="font-semibold">{p.nome}</span> <span className="text-muted">· {ROTULO_PAPEL[p.papel] ?? p.papel}</span>
            </span>
          </span>
          {p.estado === "assinou" && p.assinou_em && <span className="text-emerald-400">Assinou em {fmtDayMonth(p.assinou_em)}</span>}
          {p.estado === "vez" && !p.acoes && <span className="text-yellow-300">{p.aviso ?? "Aguardando"}</span>}
          {p.estado === "aguardando" && <span className="text-muted">{p.aviso ?? "Aguardando"}</span>}
          {p.acoes && <AcoesAssinatura url={p.acoes.url} whatsapp={p.acoes.whatsapp} />}
        </li>
      ))}
    </ol>
  );
}
