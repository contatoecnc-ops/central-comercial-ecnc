import { DetalheContrato } from "@/components/contratos/DetalheContrato";
import { exigirPaginaContratos } from "@/lib/contratos/servidor";

export const dynamic = "force-dynamic";

export default async function ContratoVendedorPage({ params }: { params: { id: string } }) {
  const profile = await exigirPaginaContratos("vendedor");
  return <DetalheContrato id={params.id} papel="vendedor" userId={profile.id} />;
}
