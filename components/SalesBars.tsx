import { fmtBRL, monthShort } from "@/lib/sales/format";

export interface BarPoint {
  period: string;
  vendas: number;
  meta: number | null;
}

/** Barras de vendas por mês com marcador da meta (SVG simples, sem biblioteca). */
export function SalesBars({ points }: { points: BarPoint[] }) {
  const W = 100 / Math.max(points.length, 1);
  const max = Math.max(1, ...points.flatMap((p) => [p.vendas, p.meta ?? 0]));
  const H = 120;
  const y = (v: number) => H - (Math.max(v, 0) / max) * H;

  return (
    <div>
      <svg viewBox={`0 0 100 ${H + 16}`} preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label="Vendas dos últimos meses comparadas à meta">
        {points.map((p, i) => {
          const x = i * W + W * 0.2;
          const w = W * 0.6;
          const hit = p.meta ? p.vendas >= p.meta : false;
          return (
            <g key={p.period}>
              <title>{`${monthShort(p.period)}: ${fmtBRL(p.vendas)}${p.meta ? ` · meta ${fmtBRL(p.meta)}` : ""}`}</title>
              <rect x={x} y={y(p.vendas)} width={w} height={Math.max(H - y(p.vendas), 0.5)} rx={0.8} className={hit ? "fill-emerald-500" : "fill-brand"} />
              {p.meta ? <line x1={i * W + W * 0.1} x2={i * W + W * 0.9} y1={y(p.meta)} y2={y(p.meta)} className="stroke-white" strokeWidth={0.8} strokeDasharray="2 1.5" vectorEffect="non-scaling-stroke" /> : null}
            </g>
          );
        })}
      </svg>
      <div className="flex">
        {points.map((p) => (
          <span key={p.period} className="flex-1 text-center text-[11px] uppercase text-muted">
            {monthShort(p.period)}
          </span>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted">Linha tracejada = meta do mês</p>
    </div>
  );
}
