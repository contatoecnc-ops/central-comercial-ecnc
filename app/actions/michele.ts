"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Exclusão de dados do titular: apaga o atendimento e as mensagens (cascade). Não há policy de escrita, então usa a service role após checar o admin. */
export async function deleteAtendimento(id: string): Promise<{ error?: string }> {
  await requireProfile("admin");
  if (!UUID.test(id)) return { error: "Atendimento inválido" };
  const { error } = await createAdminClient().from("michele_atendimentos").delete().eq("id", id);
  if (error) {
    console.error("michele: falha ao excluir atendimento", error.code ?? "sem_codigo");
    return { error: "Não foi possível excluir o atendimento" };
  }
  revalidatePath("/admin/michele", "layout");
  return {};
}
