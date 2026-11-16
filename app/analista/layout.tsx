import { AppShell } from "@/components/AppShell";
import { requireProfile } from "@/lib/auth";

export default async function AnalistaLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile("analista");
  return <AppShell profile={profile}>{children}</AppShell>;
}
