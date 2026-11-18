import { BackHomeProvider } from "@/components/BackButton";
import { homeDoPapel } from "@/lib/roles";
import { Sidebar } from "@/components/Sidebar";
import { countPendingApproval } from "@/lib/content-queries";
import { countNewRequests } from "@/lib/request-queries";
import { countContratosAguardando } from "@/lib/contratos/queries";
import { vendedorLiberado } from "@/lib/contratos/liberacao";
import type { Profile } from "@/types/database";

export async function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  // contador de aprovações pendentes na sidebar do admin
  const badges: Record<string, number> = {};
  let contratosLiberado = false;
  if (profile.role === "admin") {
    const [pending, novas, contratos] = await Promise.all([countPendingApproval(), countNewRequests(), countContratosAguardando()]);
    badges["/admin/conteudo"] = pending;
    badges["/admin/conteudo/solicitacoes"] = novas;
    badges["/admin/contratos"] = contratos;
  } else if (profile.role === "vendedor") {
    contratosLiberado = await vendedorLiberado(profile.id);
  }

  return (
    <div className="min-h-screen">
      <Sidebar role={profile.role} name={profile.full_name} badges={badges} contratosLiberado={contratosLiberado} />
      <main className="px-4 pb-12 pt-20 md:ml-64 md:px-10 md:pt-10">
        <div className="mx-auto max-w-6xl">
          <BackHomeProvider home={homeDoPapel(profile.role)}>{children}</BackHomeProvider>
        </div>
      </main>
    </div>
  );
}

