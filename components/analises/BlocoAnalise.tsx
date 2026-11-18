import { Download } from "lucide-react";
import { BotaoDesvincular } from "@/components/analises/AcoesAnalise";
import { EstadoBadge } from "@/components/analises/Listas";
import { Card } from "@/components/ui/card";
import { dataBR } from "@/lib/analise-credito/regras";
import type { AnaliseDoContrato } from "@/lib/analise-credito/queries";
import { fmtDateTime } from "@/lib/dates";

/** Bloco "Análise de crédito" do detalhe do contrato (só admin; o vendedor nunca recebe este bloco). */
export function BlocoAnalise({ contratoId, analises, parcelado }: { contratoId: string; analises: AnaliseDoContrato[]; parcelado: boolean }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide">Análise de crédito</h2>
      {analises.length === 0 ? (
        <div className="space-y-3 text-sm">
          <p className={parcelado ? "font-semibold text-red-300" : "text-muted"}>
            {parcelado ? "Sem análise de crédito vinculada a este contrato parcelado." : "Nenhuma análise vinculada (contrato sem saldo parcelado em boleto)."}
          </p>
          <p className="text-xs text-muted">Se o financeiro já enviou, ela liga sozinha quando o CPF/CNPJ coincidir; ou vincule manualmente pela caixa de entrada.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {analises.map((a, i) => (
            <li key={a.id} className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <EstadoBadge a={a} />
                {i === 0 && analises.length > 1 && <span className="text-xs text-muted">(a mais recente, é a que vale)</span>}
                <span className="text-muted">
                  Análise de {dataBR(a.analisada_em)} · {a.estado === "vencida" ? "vencida em" : "vale até"} {dataBR(a.validade_ate)}
                </span>
              </div>
              <p className="text-xs text-muted">
                Enviada por {a.enviado_por_nome} em {fmtDateTime(a.created_at)} · vínculo {a.origem === "automatico" ? "automático (mesmo CPF/CNPJ)" : "manual"} em {fmtDateTime(a.vinculada_em)}
              </p>
              <div className="flex flex-wrap gap-2">
                <a href={`/api/analises/${a.id}/arquivo`} className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold hover:bg-white/5">
                  <Download size={14} /> Abrir PDF
                </a>
                <BotaoDesvincular analiseId={a.id} contratoId={contratoId} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 border-t border-border pt-4 text-xs text-muted">
        Para vincular outra análise a este contrato, use a{" "}
        <a href="/admin/contratos/analises" className="font-semibold underline hover:text-brand">caixa de entrada de análises</a>.
      </div>
    </Card>
  );
}

