import { createAdminClient } from "@/lib/supabase/admin";

/** Soft launch: o vendedor só usa Contratos com perfis_contrato.contratos_liberado = true. Somente servidor. */
export async function vendedorLiberado(userId: string): Promise<boolean> {
  const { data } = await createAdminClient().from("perfis_contrato").select("contratos_liberado").eq("user_id", userId).maybeSingle();
  return data?.contratos_liberado === true;
}
