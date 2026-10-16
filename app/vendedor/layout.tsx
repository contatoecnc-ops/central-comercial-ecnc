import { AppShell } from "@/components/AppShell";
import { requireProfile } from "@/lib/auth";

export default async function VendedorLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile("vendedor");
  return <AppShell profile={profile}>{children}</AppShell>;
}
