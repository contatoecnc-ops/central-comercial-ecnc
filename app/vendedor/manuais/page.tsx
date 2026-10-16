import { FileText } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { CategoryFilter } from "@/components/CategoryFilter";
import { ButtonLink, Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { listManuals } from "@/lib/queries";

export default async function VendedorManuaisPage({
  searchParams,
}: {
  searchParams: { categoria?: string; q?: string };
}) {
  const all = await listManuals({ onlyActive: true });
  const categories = Array.from(new Set(all.map((m) => m.category))).sort();
  const q = searchParams.q?.trim().toLowerCase();

  const filtered = all.filter((m) => {
    if (searchParams.categoria && m.category !== searchParams.categoria) return false;
    if (!q) return true;
    return [m.title, m.description ?? "", m.category, ...m.tags].some((s) => s.toLowerCase().includes(q));
  });

  const groups = categories
    .map((c) => ({ category: c, items: filtered.filter((m) => m.category === c) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader title="Manuais de vendas" breadcrumb={[{ label: "Vendedor" }, { label: "Manuais" }]} />

      <form className="mb-4 flex gap-2">
        {searchParams.categoria && <input type="hidden" name="categoria" value={searchParams.categoria} />}
        <Input name="q" defaultValue={searchParams.q ?? ""} placeholder="Buscar manual..." className="max-w-sm" />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>
      <div className="mb-8">
        <CategoryFilter
          categories={categories}
          active={searchParams.categoria}
          basePath="/vendedor/manuais"
          extraParams={{ q: searchParams.q }}
        />
      </div>

      {groups.length === 0 ? (
        <EmptyState>Nenhum manual encontrado.</EmptyState>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.category}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-brand">{g.category}</h2>
              <Card className="divide-y divide-border">
                {g.items.map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <FileText size={20} className="mt-0.5 shrink-0 text-brand" />
                      <div className="min-w-0">
                        <p className="font-semibold">{m.title}</p>
                        {m.description && <p className="text-sm text-muted">{m.description}</p>}
                      </div>
                    </div>
                    <ButtonLink href={m.drive_url} target="_blank" rel="noopener noreferrer" variant="outline" size="sm">
                      Abrir
                    </ButtonLink>
                  </div>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
