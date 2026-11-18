import { PaginaKanban } from "@/components/contratos/PaginaKanban";
import { exigirPaginaContratos } from "@/lib/contratos/servidor";

export const dynamic = "force-dynamic";

export default async function ContratosAdminPage({ searchParams }: { searchParams: { vendedor?: string; cancelados?: string } }) {
  await exigirPaginaContratos("admin");
  return <PaginaKanban papel="admin" searchParams={searchParams} />;
}
