import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { SyncSalesButton } from "@/components/SyncSalesButton";
import { Card, EmptyState } from "@/components/ui/card";
import { getSalesStatus, listSalesNumbers, listVendedores } from "@/lib/queries";
import { COMPANY_LABEL, formerSellerNames, nonSellerNames } from "@/lib/sales-config";
import { fmtBRL, fmtDateISO, fmtPct, fmtPeriod, fmtSyncedAt } from "@/lib/sales/format";
import { canon } from "@/lib/sales/parse";
import { getSalesSource } from "@/lib/sales/source";
import { currentPeriodOf, pct } from "@/lib/sales/view";

interface Line {
  key: string;
  name: string;
  note?: string;
  vendas: number;
  meta: number | null;
  maquinas: number;
  pecas: number;
}

const COLUMNS = [
  { key: "vendas", label: "Vendas" },
  { key: "meta", label: "Meta" },
  { key: "pct", label: "% da meta" },
  { key: "maquinas", label: "Máquinas" },
  { key: "pecas", label: "Peças" },
] as const;

export default async function AdminVendasPage({ searchParams }: { searchParams: { mes?: string; sort?: string; dir?: string } }) {
  const [rows, vendedores, status] = await Promise.all([listSalesNumbers(), listVendedores(false), getSalesStatus()]);
  const source = getSalesSource();
  const names = new Map(vendedores.map((v) => [v.id, v.full_name]));
  const former = new Set(formerSellerNames.map(canon));
  const house = new Set(nonSellerNames.map(canon));

  const periods = Array.from(new Set(rows.map((r) => r.period))).sort().reverse();
  const period = periods.includes(searchParams.mes ?? "") ? searchParams.mes! : currentPeriodOf(rows);
  const month = rows.filter((r) => r.period === period);

  const sellers: Line[] = [];
  const groups: Record<"house" | "former" | "unlinked", Line> = {
    house: { key: "house", name: "Outras receitas", vendas: 0, meta: null, maquinas: 0, pecas: 0 },
    former: { key: "former", name: "Ex-vendedor", vendas: 0, meta: null, maquinas: 0, pecas: 0 },
    unlinked: { key: "unlinked", name: "Sem vínculo", note: "confira o nome na planilha", vendas: 0, meta: null, maquinas: 0, pecas: 0 },
  };
  let company: Line | undefined;
  for (const r of month) {
    const m = r.metrics;
    if (r.seller_label === COMPANY_LABEL) {
      company = { key: "company", name: "Total da empresa", vendas: m.vendas, meta: m.meta, maquinas: m.maquinas, pecas: m.pecas };
    } else if (r.seller_id) {
      sellers.push({ key: r.id, name: names.get(r.seller_id) ?? r.seller_label, vendas: m.vendas, meta: m.meta, maquinas: m.maquinas, pecas: m.pecas });
    } else {
      const g = groups[house.has(canon(r.seller_label)) ? "house" : former.has(canon(r.seller_label)) ? "former" : "unlinked"];
      g.vendas += m.vendas;
      g.maquinas += m.maquinas;
      g.pecas += m.pecas;
    }
  }

  const sortKey = searchParams.sort ?? "name";
  const dir = searchParams.dir === "desc" ? -1 : 1;
  const value = (l: Line, k: string) => (k === "pct" ? (pct(l.vendas, l.meta) ?? -1) : k === "name" ? 0 : ((l[k as "vendas"] as number | null) ?? -1));
  sellers.sort((a, b) => (sortKey === "name" ? a.name.localeCompare(b.name, "pt-BR") : value(a, sortKey) - value(b, sortKey)) * dir);

  const extra = Object.values(groups).filter((g) => g.vendas !== 0 || g.maquinas !== 0 || g.pecas !== 0);
  const total = company ?? {
    key: "company",
    name: "Total da empresa",
    vendas: [...sellers, ...extra].reduce((s, l) => s + l.vendas, 0),
    meta: null,
    maquinas: [...sellers, ...extra].reduce((s, l) => s + l.maquinas, 0),
    pecas: [...sellers, ...extra].reduce((s, l) => s + l.pecas, 0),
  };

  const sortHref = (k: string) => {
    const qs = new URLSearchParams({ sort: k, dir: sortKey === k && dir === 1 ? "desc" : "asc" });
    if (period) qs.set("mes", period);
    return `/admin/vendas?${qs}`;
  };
  const Th = ({ k, children, right }: { k: string; children: React.ReactNode; right?: boolean }) => (
    <th className={`px-4 py-3 font-semibold ${right ? "text-right" : ""}`}>
      <Link href={sortHref(k)} className="inline-flex items-center gap-1 hover:text-white">
        {children}
        {sortKey === k && (dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </Link>
    </th>
  );
  const Row = ({ l, bold }: { l: Line; bold?: boolean }) => (
    <tr className={`border-b border-border last:border-0 ${bold ? "bg-white/[0.03] font-bold" : ""}`}>
      <td className="px-4 py-3 font-semibold">
        {l.name}
        {l.note && <span className="ml-2 text-xs font-normal text-yellow-400">({l.note})</span>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{fmtBRL(l.vendas)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{l.meta === null ? "—" : fmtBRL(l.meta)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{fmtPct(pct(l.vendas, l.meta))}</td>
      <td className="px-4 py-3 text-right tabular-nums">{fmtBRL(l.maquinas)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{fmtBRL(l.pecas)}</td>
    </tr>
  );

  const diff = status && status.total_planilha !== null && status.total_resumo_l2 !== null ? status.total_planilha - status.total_resumo_l2 : null;
  const ok = diff !== null && Math.abs(diff) <= 1;

  return (
    <>
      <PageHeader title="Vendas" breadcrumb={[{ label: "Admin" }, { label: "Vendas" }]} />

      {source === "mock" && (
        <p className="mb-4 rounded-md border border-yellow-900 bg-yellow-950/40 px-4 py-2 text-xs text-yellow-300">
          Modo de demonstração (SALES_SOURCE=mock): os números são fictícios.
        </p>
      )}
      {source === "none" ? (
        <EmptyState>
          Fonte de vendas não configurada. Defina <code>SALES_SOURCE=mock</code> para ver dados de exemplo ou configure as credenciais do Google (veja o README).
        </EmptyState>
      ) : (
        <div className="mb-6">
          <SyncSalesButton />
        </div>
      )}

      {status && (
        <Card className="mb-6 space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>
              Vendas atualizadas até <strong className="text-white">{fmtDateISO(status.dados_ate)}</strong>
            </span>
            <span>Última sincronização: {fmtSyncedAt(status.synced_at)}</span>
          </div>
          <h2 className="text-sm font-bold uppercase tracking-wide">Conferência</h2>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Total da planilha" value={fmtBRL(status.total_planilha)} />
            <Stat label="Resumo (vendas totais)" value={fmtBRL(status.total_resumo_l2)} />
            <Stat
              label="Diferença"
              value={diff === null ? "—" : fmtBRL(diff)}
              tone={diff === null ? undefined : ok ? "ok" : "bad"}
            />
            <Stat label="Soma dos vendedores" value={fmtBRL(status.total_vinculado)} />
            <Stat label="Fora dos vendedores (outras receitas, ex-vendedor, sem vínculo)" value={fmtBRL(status.total_outros)} />
          </dl>
          {status.avisos.length > 0 ? (
            <ul className="space-y-1.5 text-sm">
              {status.avisos.map((a, i) => (
                <li key={i} className={`flex gap-2 ${a.startsWith("CONFERÊNCIA") ? "font-semibold text-red-400" : "text-yellow-300"}`}>
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {a}
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle2 size={14} /> Sem avisos.
            </p>
          )}
          <p className="text-xs text-muted">
            Nomes sem vínculo: preencha o &quot;Nome na planilha&quot; em{" "}
            <Link href="/admin/usuarios" className="underline hover:text-white">
              Usuários
            </Link>{" "}
            ou ajuste as listas em lib/sales-config.ts.
          </p>
        </Card>
      )}

      {periods.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {[...periods].sort().map((p) => (
            <Link
              key={p}
              href={`/admin/vendas?mes=${encodeURIComponent(p)}`}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${p === period ? "border-brand bg-brand text-white" : "border-border text-muted hover:text-white"}`}
            >
              {fmtPeriod(p)}
            </Link>
          ))}
        </div>
      )}

      {month.length === 0 ? (
        <EmptyState>Nenhum número sincronizado ainda.</EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <Th k="name">Vendedor</Th>
                {COLUMNS.map((c) => (
                  <Th key={c.key} k={c.key} right>
                    {c.label}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sellers.map((l) => (
                <Row key={l.key} l={l} />
              ))}
              {extra.map((l) => (
                <Row key={l.key} l={l} />
              ))}
              <Row l={total} bold />
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 font-bold tabular-nums ${tone === "ok" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : ""}`}>{value}</dd>
    </div>
  );
}
