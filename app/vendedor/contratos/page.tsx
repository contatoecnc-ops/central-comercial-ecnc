import { PaginaKanban } from "@/components/contratos/PaginaKanban";
import { exigirPaginaContratos } from "@/lib/contratos/servidor";

export const dynamic = "force-dynamic";

export default async function ContratosVendedorPage({ searchParams }: { searchParams: { cancelados?: string } }) {
  await exigirPaginaContratos("vendedor");
  return <PaginaKanban papel="vendedor" searchParams={{ cancelados: searchParams.cancelados }} />;
}
