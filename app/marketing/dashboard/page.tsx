import Link from "next/link";
import { BookOpen, Cpu, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { ContentSummary } from "@/components/ContentSummary";
import { requireProfile } from "@/lib/auth";

export default async function MarketingDashboard() {
  const profile = await requireProfile("marketing");
  const shortcuts = [
    { href: "/admin/catalogo", label: "Catálogo", hint: "Produtos, fotos e vídeos", icon: Cpu },
    { href: "/admin/manuais", label: "Manuais", hint: "Links e dicas em texto", icon: BookOpen },
    { href: "/admin/conteudo", label: "Conteúdo", hint: "Pedidos, aprovações e calendário", icon: Megaphone },
  ];
  return (
    <>
      <PageHeader title={`Olá, ${profile.full_name.split(" ")[0]}`} breadcrumb={[{ label: "Marketing" }, { label: "Dashboard" }]} />
      <div className="grid gap-4 sm:grid-cols-2">
        {shortcuts.map(({ href, label, hint, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="flex items-center gap-4 p-5 transition-colors hover:border-white/30">
              <Icon size={24} className="text-brand" />
              <div>
                <p className="font-semibold">{label}</p>
                <p className="text-sm text-muted">{hint}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
      <div className="mt-10">
        <ContentSummary role="marketing" />
      </div>
    </>
  );
}
