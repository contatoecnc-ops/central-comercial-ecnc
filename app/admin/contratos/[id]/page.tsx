import { DetalheContrato } from "@/components/contratos/DetalheContrato";
import { exigirPaginaContratos } from "@/lib/contratos/servidor";

export const dynamic = "force-dynamic";

export default async function ContratoAdminPage({ params }: { params: { id: string } }) {
  await exigirPaginaContratos("admin");
  return <DetalheContrato id={params.id} papel="admin" />;
}
