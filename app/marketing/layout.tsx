import { AppShell } from "@/components/AppShell";
import { requireProfile } from "@/lib/auth";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile("marketing");
  return <AppShell profile={profile}>{children}</AppShell>;
}
