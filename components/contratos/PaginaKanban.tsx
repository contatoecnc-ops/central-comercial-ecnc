import Link from "next/link";
import { KanbanContratos, ListaCancelados } from "@/components/contratos/KanbanContratos";
import { SeloSandbox } from "@/components/contratos/Bits";
import { PageHeader } from "@/components/PageHeader";
import { ButtonLink, Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { zapsignAtivo } from "@/lib/agente-contratos";
import { listarContratos, listarVendedoresContratos } from "@/lib/contratos/queries";
import { UUID_RE } from "@/lib/contratos/servidor";
import { MessageSquarePlus, Settings } from "lucide-react";

/** Kanban "Contratos": o mesmo quadro para o vendedor (só os dele, pelo RLS) e para o admin (todos, com filtro por vendedor). */
export async function PaginaKanban({
  papel,
  searchParams,
}: {
  papel: "admin" | "vendedor";
  searchParams: { vendedor?: string; cancelados?: string };
}) {
  const cancelados = searchParams.cancelados === "1";
  const vendedorId = papel === "admin" && searchParams.vendedor && UUID_RE.test(searchParams.vendedor) ? searchParams.vendedor : undefined;
  const [contratos, vendedores] = await Promise.all([
    listarContratos({ vendedorId, cancelados }),
    papel === "admin" ? listarVendedoresContratos() : Promise.resolve([]),
  ]);
  const base = `/${papel}/contratos`;
  const q = new URLSearchParams();
  if (vendedorId) q.set("vendedor", vendedorId);

  return (
    <>
      <PageHeader
        title="Contratos"
        breadcrumb={[{ label: papel === "admin" ? "Admin" : "Vendedor" }, { label: "Contratos" }]}
        actions={
          <>
            {papel === "vendedor" && (
              <ButtonLink href="/vendedor/contratos/chat">
                <MessageSquarePlus size={16} /> Novo contrato
              </ButtonLink>
            )}
            {papel === "admin" && (
              <ButtonLink href="/admin/contratos/configuracoes" variant="outline">
                <Settings size={16} /> Configurações
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SeloSandbox />
        {papel === "admin" && (
          <form method="get" className="flex items-center gap-2">
            {cancelados && <input type="hidden" name="cancelados" value="1" />}
            <Select name="vendedor" defaultValue={vendedorId ?? ""} aria-label="Filtrar por vendedor" className="h-9 w-56 text-xs">
              <option value="">Todos os vendedores</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.full_name}
                </option>
              ))}
            </Select>
            <Button type="submit" size="sm" variant="outline">
              Filtrar
            </Button>
          </form>
        )}
        <Link
          href={cancelados ? (q.toString() ? `${base}?${q}` : base) : `${base}?${new URLSearchParams({ ...Object.fromEntries(q), cancelados: "1" })}`}
          className="ml-auto text-xs font-semibold text-muted hover:text-white"
        >
          {cancelados ? "← Voltar ao quadro" : "Ver cancelados"}
        </Link>
      </div>

      {cancelados ? (
        <ListaCancelados contratos={contratos} papel={papel} />
      ) : (
        <KanbanContratos contratos={contratos} papel={papel} zapsignAtivo={zapsignAtivo()} />
      )}
    </>
  );
}
