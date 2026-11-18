import { FormAnalise } from "@/components/analises/FormAnalise";
import { ListaEnvios } from "@/components/analises/Listas";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { listarEnvios, POR_PAGINA } from "@/lib/analise-credito/queries";

export const dynamic = "force-dynamic";

export default async function AnalisesFinanceiroPage({ searchParams }: { searchParams: { pagina?: string } }) {
  const me = await requireProfile(["financeiro", "admin"]);
  const pagina = Math.max(1, Math.min(10000, parseInt(searchParams.pagina ?? "1", 10) || 1));
  // financeiro vê só os próprios envios; admin vê todos
  const { itens, total } = await listarEnvios(me.role === "financeiro" ? me.id : null, pagina);

  return (
    <>
      <PageHeader title="Análises de crédito" breadcrumb={[{ label: me.role === "admin" ? "Admin" : "Financeiro" }, { label: "Análises de crédito" }]} back={me.role === "admin" ? "/admin/contratos" : undefined} />
      <Card className="mb-8 max-w-4xl p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide">Enviar análise</h2>
        <p className="mb-4 text-xs text-muted">O PDF é só guardado. Digite o CPF/CNPJ e o resultado: a análise se liga sozinha ao contrato quando ele for gerado.</p>
        <FormAnalise />
      </Card>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">{me.role === "admin" ? "Todos os envios" : "Meus envios"}</h2>
      <ListaEnvios itens={itens} total={total} pagina={pagina} porPagina={POR_PAGINA} mostrarAutor={me.role === "admin"} />
    </>
  );
}
