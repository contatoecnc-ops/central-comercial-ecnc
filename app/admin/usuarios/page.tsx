import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { UserForm } from "@/components/UserForm";
import { UserActiveToggle } from "@/components/UserActiveToggle";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/dates";
import type { Profile } from "@/types/database";

export default async function UsuariosPage() {
  const me = await requireProfile("admin");
  const supabase = createClient();
  const { data } = await supabase.from("profiles").select("*").order("full_name");
  const users = (data ?? []) as Profile[];

  return (
    <>
      <PageHeader title="Usuários" breadcrumb={[{ label: "Admin" }, { label: "Usuários" }]} />

      <Card className="mb-8 p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide">Novo usuário</h2>
        <UserForm />
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-semibold">Nome</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Perfil</th>
              <th className="px-4 py-3 font-semibold">Desde</th>
              <th className="px-4 py-3 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-semibold">
                  {u.full_name}
                  {!u.active && <span className="ml-2 text-xs font-normal text-muted">(inativo)</span>}
                </td>
                <td className="px-4 py-3 text-muted">{u.email}</td>
                <td className="px-4 py-3 capitalize">{u.role}</td>
                <td className="px-4 py-3 text-muted">{fmtDate(u.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <UserActiveToggle id={u.id} active={u.active} disabled={u.id === me.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
