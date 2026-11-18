import { AppShell } from "@/components/AppShell";
import { requireProfile } from "@/lib/auth";

// Área do financeiro (e do admin). Qualquer outro papel já é barrado no middleware ("Acesso negado").
export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile(["financeiro", "admin"]);
  return <AppShell profile={profile}>{children}</AppShell>;
}
