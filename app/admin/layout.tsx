import { AppShell } from "@/components/AppShell";
import { requireProfile } from "@/lib/auth";

// O marketing entra aqui só em /admin/catalogo e /admin/manuais (o middleware barra o resto);
// toda página exclusiva do admin chama requireProfile("admin") por conta própria.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile(["admin", "marketing"]);
  return <AppShell profile={profile}>{children}</AppShell>;
}
