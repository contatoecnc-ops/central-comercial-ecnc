import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PerfilContratoForm } from "@/components/contratos/PerfilContratoForm";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DadosContratoPage({ params }: { params: { id: string } }) {
  await requireProfile("admin");
  if (!UUID.test(params.id)) notFound();
  const supabase = createClient();
  const { data: user } = await supabase.from("profiles").select("id, full_name, role").eq("id", params.id).maybeSingle();
  if (!user || !["vendedor", "admin"].includes(user.role)) notFound();
  const { data: p } = await supabase
    .from("perfis_contrato")
    .select("cpf, celular, telegram_user_id, contratos_liberado")
    .eq("user_id", user.id)
    .maybeSingle(); // RLS: só admin lê

  return (
    <>
      <PageHeader
        back="/admin/usuarios"
        title={`Dados para contrato — ${user.full_name}`}
        breadcrumb={[{ label: "Usuários", href: "/admin/usuarios" }, { label: "Dados para contrato" }]}
      />
      <Card className="max-w-2xl p-5">
        <PerfilContratoForm
          userId={user.id}
          isVendedor={user.role === "vendedor"}
          inicial={{
            cpf: p?.cpf ?? "",
            celular: p?.celular ?? "",
            telegram_user_id: p?.telegram_user_id ?? "",
            contratos_liberado: p?.contratos_liberado ?? false,
          }}
        />
      </Card>
      <p className="mt-4 max-w-2xl text-xs text-muted">
        O nome e o e-mail do contrato vêm do perfil do usuário. Sem CPF, e-mail e celular o agente não gera o contrato e avisa o que falta.
      </p>
    </>
  );
}
