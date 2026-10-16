import { AppShell } from "@/components/AppShell";
import { requireProfile } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile("admin");
  return <AppShell profile={profile}>{children}</AppShell>;
}
