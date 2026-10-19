import { PageHeader } from "@/components/PageHeader";
import { ContentNav } from "@/components/ContentBits";
import { ContentSummary } from "@/components/ContentSummary";
import { requireProfile } from "@/lib/auth";
import { countPendingApproval } from "@/lib/content-queries";

export default async function ConteudoResumoPage() {
  const me = await requireProfile(["admin", "marketing"]);
  const pending = me.role === "admin" ? await countPendingApproval() : 0;
  return (
    <>
      <PageHeader title="Central de conteúdo" breadcrumb={[{ label: "Marketing" }, { label: "Conteúdo" }]} />
      <ContentNav role={me.role} active="/admin/conteudo" pending={pending} />
      <ContentSummary role={me.role} />
    </>
  );
}
