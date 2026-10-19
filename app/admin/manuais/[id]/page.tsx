import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ManualView } from "@/components/ManualView";
import { getManual, listManualFiles } from "@/lib/queries";

export default async function AdminManualPage({ params }: { params: { id: string } }) {
  const manual = await getManual(params.id);
  if (!manual || manual.kind === "link") notFound();
  const files = manual.kind === "tabela_preco" ? await listManualFiles([manual.id]) : [];

  return (
    <>
      <PageHeader
        title={manual.title}
        breadcrumb={[{ label: "Manuais", href: "/admin/manuais" }, { label: manual.category }]}
      />
      <ManualView manual={manual} files={files} />
    </>
  );
}
