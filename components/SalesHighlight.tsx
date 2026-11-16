import { Card } from "@/components/ui/card";
import { fmtBRL, fmtPct, fmtPeriod } from "@/lib/sales/format";
import { pct } from "@/lib/sales/view";

interface Props {
  period: string;
  /** soma de vendas dos vendedores no mês (mesmas linhas da tabela, sem outras receitas) */
  vendido: number;
  /** meta somada dos vendedores; null = nenhum vendedor com meta */
  meta: number | null;
  /** total da empresa, inclui outras receitas */
  totalEmpresa: number;
}

export function SalesHighlight({ period, vendido, meta, totalEmpresa }: Props) {
  const ratio = pct(vendido, meta);
  const w = ratio === null ? 0 : Math.min(Math.max(ratio, 0), 1) * 100;
  const falta = meta === null ? null : Math.max(meta - vendido, 0);

  return (
    <Card className="mb-6 p-5">
      <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Vendido pelos vendedores no mês · {fmtPeriod(period)}</p>
          <p className="mt-1 text-4xl font-extrabold tabular-nums sm:text-5xl">{fmtBRL(vendido)}</p>
        </div>
        <dl className="grid grid-cols-3 gap-4 text-sm sm:text-right">
          <div>
            <dt className="text-xs text-muted">Meta</dt>
            <dd className="font-semibold tabular-nums">{meta === null ? "—" : fmtBRL(meta)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">% da meta</dt>
            <dd className="font-semibold tabular-nums">{fmtPct(ratio)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Falta</dt>
            <dd className="font-semibold tabular-nums">{falta === null ? "—" : fmtBRL(falta)}</dd>
          </div>
        </dl>
      </div>
      <div
        className="mt-4 h-1 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-label="% da meta"
        aria-valuenow={Math.round(w)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${w}%` }} />
      </div>
      <p className="mt-3 text-xs text-muted">
        Total da empresa (inclui outras receitas): <strong className="tabular-nums text-white">{fmtBRL(totalEmpresa)}</strong>
      </p>
    </Card>
  );
}
