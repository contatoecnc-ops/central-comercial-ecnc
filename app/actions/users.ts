"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { relinkSales } from "@/lib/sales/sync";
import { userSchema, type UserInput } from "@/lib/schemas";

type Result = { error?: string };

export async function createUser(input: UserInput): Promise<Result> {
  await requireProfile("admin");
  const parsed = userSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: v.email,
    password: v.password,
    email_confirm: true,
  });
  if (error || !data.user) return { error: error?.message ?? "Erro ao criar usuário" };

  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: data.user.id, full_name: v.full_name, email: v.email, role: v.role });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: profileError.message };
  }
  revalidatePath("/admin/usuarios");
  return {};
}

export async function setUserActive(id: string, active: boolean): Promise<Result> {
  const me = await requireProfile("admin");
  if (id === me.id) return { error: "Você não pode desativar a si mesmo" };
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ active }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/usuarios");
  return {};
}

export async function setSheetName(id: string, sheetName: string): Promise<Result> {
  await requireProfile("admin");
  const value = sheetName.trim() || null;
  // client do usuário: o RLS (admin) e o trigger profiles_guard validam a permissão
  const { error } = await createClient().from("profiles").update({ sheet_name: value }).eq("id", id);
  if (error) return { error: error.message };
  await relinkSales(); // reaplica o vínculo nas linhas já sincronizadas
  revalidatePath("/admin/usuarios");
  revalidatePath("/admin/vendas");
  revalidatePath("/vendedor/dashboard");
  return {};
}
