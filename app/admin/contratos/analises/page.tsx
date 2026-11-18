import Link from "next/link";
import { ListaCaixa } from "@/components/analises/Listas";
import { PageHeader } from "@/components/PageHeader";
import { ButtonLink, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { exigirPaginaContratos } from "@/lib/contratos/servidor";
import { listarCaixa, POR_PAGINA } from "@/lib/analise-credito/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CaixaAnalisesPage({ searchParams }: { searchParams: { aba?: string; q?: string; pagina?: string } }) {
  await exigirPaginaContratos("admin");
  const aba = searchParams.aba === "vinculadas" ? "vinculadas" : "aguardando";
  const q = (searchParams.q ?? "").slice(0, 80);
  const pagina = Math.max(1, Math.min(10000, parseInt(searchParams.pagina ?? "1", 10) || 1));
  const { itens, total, contagem } = await listarCaixa(aba, q, pagina);
  const base = `/admin/contratos/analises?aba=${aba}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const aba1 = (a: string) => `/admin/contratos/analises?aba=${a}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <PageHeader
        back="/admin/contratos"
        title="Análises de crédito"
        breadcrumb={[{ label: "Contratos", href: "/admin/contratos" }, { label: "Análises de crédito" }]}
        actions={<ButtonLink href="/financeiro/analises" variant="outline">Enviar análise</ButtonLink>}
      />
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <div className="flex gap-1 rounded-lg border border-border p-1 text-sm font-semibold" role="tablist">
          {([["aguardando", "Aguardando contrato", contagem.aguardando], ["vinculadas", "Vinculadas", contagem.vinculadas]] as const).map(([k, rot, n]) => (
            <Link key={k} href={aba1(k)} role="tab" aria-selected={aba === k} className={cn("rounded-md px-3 py-1.5", aba === k ? "bg-brand text-white" : "text-muted hover:text-white")}>
              {rot} <span className="ml-1 text-xs opacity-80">{n}</span>
            </Link>
          ))}
        </div>
        <form method="get" className="flex items-center gap-2">
          <input type="hidden" name="aba" value={aba} />
          <Input name="q" defaultValue={q} placeholder="Buscar por nome ou CPF/CNPJ" aria-label="Buscar análise" className="h-9 w-64 text-xs" />
          <Button type="submit" size="sm" variant="outline">Buscar</Button>
        </form>
      </div>
      <ListaCaixa itens={itens} total={total} pagina={pagina} porPagina={POR_PAGINA} base={base} aba={aba} />
    </>
  );
}
