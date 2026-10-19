import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/ui/card";
import { ManualForm } from "@/components/ManualForm";
import { ManualAdminItem } from "@/components/ManualAdminItem";
import { listManualFiles, listManuals } from "@/lib/queries";

export default async function AdminManuaisPage() {
  const [manuals, allFiles] = await Promise.all([listManuals(), listManualFiles()]);
  const categories = Array.from(new Set(manuals.map((m) => m.category))).sort();

  return (
    <>
      <PageHeader title="Manuais de vendas" breadcrumb={[{ label: "Admin" }, { label: "Manuais" }]} />

      <Card className="mb-8 p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide">Novo manual</h2>
        <ManualForm categories={categories} />
      </Card>

      {manuals.length === 0 ? (
        <EmptyState>Nenhum manual cadastrado.</EmptyState>
      ) : (
        <Card className="divide-y divide-border">
          {manuals.map((m) => (
            <ManualAdminItem
              key={m.id}
              manual={m}
              files={allFiles.filter((f) => f.manual_id === m.id)}
              categories={categories}
            />
          ))}
        </Card>
      )}
    </>
  );
}
