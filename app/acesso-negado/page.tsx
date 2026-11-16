import Link from "next/link";
import { getProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AcessoNegadoPage() {
  const profile = await getProfile();
  const home = profile?.active ? `/${profile.role}/dashboard` : "/login";
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-extrabold">Acesso negado</h1>
        <p className="mt-3 text-sm text-muted">Seu perfil não tem permissão para abrir esta página ou executar esta ação.</p>
        <Link href={home} className="mt-6 inline-block rounded-md border border-border px-4 py-2 text-sm font-semibold hover:text-brand">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
