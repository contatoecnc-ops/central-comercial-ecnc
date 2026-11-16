import { AppShell } from "@/components/AppShell";
import { requireProfile } from "@/lib/auth";

// O analista (somente leitura) entra aqui só nas telas listadas no middleware (ANALISTA_READ).
// O marketing entra aqui só em /admin/catalogo e /admin/manuais (o middleware barra o resto);
// toda página exclusiva do admin chama requireProfile("admin") por conta própria.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile(["admin", "marketing", "analista"]);
  return <AppShell profile={profile}>{children}</AppShell>;
}
