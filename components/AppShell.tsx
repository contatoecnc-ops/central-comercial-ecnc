import { Sidebar } from "@/components/Sidebar";
import { countPendingApproval } from "@/lib/content-queries";
import { countNewRequests } from "@/lib/request-queries";
import type { Profile } from "@/types/database";

export async function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  // contador de aprovações pendentes na sidebar do admin
  const badges: Record<string, number> = {};
  if (profile.role === "admin") {
    const [pending, novas] = await Promise.all([countPendingApproval(), countNewRequests()]);
    badges["/admin/conteudo"] = pending;
    badges["/admin/conteudo/solicitacoes"] = novas;
  }

  return (
    <div className="min-h-screen">
      <Sidebar role={profile.role} name={profile.full_name} badges={badges} />
      <main className="px-4 pb-12 pt-20 md:ml-64 md:px-10 md:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
