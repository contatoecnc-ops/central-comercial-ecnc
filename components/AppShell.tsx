import { Sidebar } from "@/components/Sidebar";
import type { Profile } from "@/types/database";

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar role={profile.role} name={profile.full_name} />
      <main className="px-4 pb-12 pt-20 md:ml-64 md:px-10 md:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
