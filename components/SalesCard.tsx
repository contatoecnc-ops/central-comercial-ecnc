import { Card } from "@/components/ui/card";
import { SalesBars } from "@/components/SalesBars";
import { fmtBRL, fmtDateISO, fmtPct, fmtPeriod } from "@/lib/sales/format";
import { currentPeriodOf, pct, titleCase, topOrigins } from "@/lib/sales/view";
import type { SalesNumber } from "@/types/database";

function Progress({ value }: { value: number | null }) {
  const w = value === null ? 0 : Math.min(Math.max(value, 0), 1) * 100;
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(w)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${value !== null && value >= 1 ? "bg-emerald-500" : "bg-brand"}`} style={{ width: `${w}%` }} />
    </div>
  );
}

/** "Meus números". `rows` já vem filtrado pelo RLS (só as linhas do próprio vendedor). */
export function SalesCard({ rows }: { rows: SalesNumber[] }) {
  const period = currentPeriodOf(rows);
  const current = rows.find((r) => r.period === period);

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Meus números</h2>
      {!current || !period ? (
        <Card className="border-dashed p-6 text-sm text-muted">Seus números ainda não foram sincronizados.</Card>
      ) : (
        <Card className="space-y-6 p-5">
          <Totals rows={rows} period={period} current={current} />
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Últimos 6 meses</h3>
              <SalesBars
                points={rows
                  .filter((r) => r.period <= period)
                  .sort((a, b) => a.period.localeCompare(b.period))
                  .slice(-6)
                  .map((r) => ({ period: r.period, vendas: r.metrics.vendas, meta: r.metrics.meta }))}
              />
            </div>
            <div className="space-y-5">
              <MixBar current={current} />
              <Origins origins={current.metrics.por_origem} />
            </div>
          </div>
          <p className="text-xs text-muted">Vendas atualizadas até {fmtDateISO(current.metrics.dados_ate)}</p>
        </Card>
      )}
    </section>
  );
}

function Totals({ rows, period, current }: { rows: SalesNumber[]; period: string; current: SalesNumber }) {
  const year = period.slice(0, 4);
  const yearRows = rows.filter((r) => r.period.startsWith(year));
  const yearSales = yearRows.reduce((s, r) => s + r.metrics.vendas, 0);
  const hasMeta = yearRows.some((r) => r.metrics.meta !== null);
  const yearMeta = hasMeta ? yearRows.reduce((s, r) => s + (r.metrics.meta ?? 0), 0) : null;
  const m = current.metrics;

  const block = (title: string, vendas: number, meta: number | null) => (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums">{fmtBRL(vendas)}</p>
      {meta === null ? (
        <p className="mt-1 text-xs text-muted">Meta não configurada</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">
            Meta {fmtBRL(meta)} · <strong className="text-white">{fmtPct(pct(vendas, meta))}</strong>
          </p>
          <Progress value={pct(vendas, meta)} />
        </>
      )}
    </div>
  );

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {block(`Mês ${fmtPeriod(period)}`, m.vendas, m.meta)}
      {block(`Ano ${year}`, yearSales, yearMeta)}
    </div>
  );
}

function MixBar({ current }: { current: SalesNumber }) {
  const { maquinas, pecas } = current.metrics;
  const total = maquinas + pecas;
  const mw = total > 0 ? (maquinas / total) * 100 : 0;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Máquinas x Peças (mês)</h3>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/10">
        <div className="bg-brand" style={{ width: `${mw}%` }} />
        <div className="bg-sky-500" style={{ width: total > 0 ? `${100 - mw}%` : 0 }} />
      </div>
      <p className="mt-2 flex justify-between text-xs tabular-nums text-muted">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand" />
          Máquinas {fmtBRL(maquinas)}
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500" />
          Peças {fmtBRL(pecas)}
        </span>
      </p>
    </div>
  );
}

function Origins({ origins }: { origins: Record<string, number> }) {
  const top = topOrigins(origins);
  const max = top[0]?.[1] ?? 1;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Origem das vendas (mês)</h3>
      {top.length === 0 ? (
        <p className="text-xs text-muted">Sem vendas no mês.</p>
      ) : (
        <ul className="space-y-2">
          {top.map(([name, v]) => (
            <li key={name} className="text-xs">
              <div className="flex justify-between">
                <span>{titleCase(name)}</span>
                <span className="tabular-nums text-muted">{fmtBRL(v)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/10">
                <div className="h-full rounded-full bg-brand/80" style={{ width: `${(v / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
