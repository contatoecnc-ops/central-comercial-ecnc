import { PageHeader } from "@/components/PageHeader";
import { MachineCard } from "@/components/MachineCard";
import { CategoryFilter } from "@/components/CategoryFilter";
import { EmptyState } from "@/components/ui/card";
import { listMachines } from "@/lib/queries";
import { MACHINE_CATEGORIES } from "@/lib/schemas";

export default async function VendedorCatalogoPage({ searchParams }: { searchParams: { categoria?: string } }) {
  const category = MACHINE_CATEGORIES.find((c) => c === searchParams.categoria);
  const machines = await listMachines({ onlyActive: true });
  const grouped = MACHINE_CATEGORIES.filter((c) => !category || c === category)
    .map((c) => ({ category: c, items: machines.filter((m) => m.category === c) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader title="Catálogo" breadcrumb={[{ label: "Vendedor" }, { label: "Catálogo" }]} />
      <div className="mb-8">
        <CategoryFilter categories={[...MACHINE_CATEGORIES]} active={category} basePath="/vendedor/catalogo" />
      </div>
      {grouped.length === 0 ? (
        <EmptyState>Nenhuma máquina disponível.</EmptyState>
      ) : (
        <div className="space-y-10">
          {grouped.map((g) => (
            <section key={g.category}>
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-brand">{g.category}</h2>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((m) => (
                  <MachineCard key={m.id} machine={m} href={`/vendedor/catalogo/${m.id}`} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
