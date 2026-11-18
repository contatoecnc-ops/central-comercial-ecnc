"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { cpfValido, somenteDigitos } from "@/lib/agente-contratos/lib/documentos";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string };

const perfilSchema = z.object({
  cpf: z.string().trim().max(20),
  celular: z.string().trim().max(25),
  telegram_user_id: z.string().trim().max(25),
  contratos_liberado: z.boolean(),
});
export type PerfilContratoInput = z.infer<typeof perfilSchema>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "Dados para contrato" (só admin). Escreve com o client do usuário: quem decide é o RLS de perfis_contrato (só admin).
 * CPF validado aqui, no servidor.
 */
export async function salvarPerfilContrato(userId: string, input: PerfilContratoInput): Promise<Result> {
  await requireProfile("admin");
  if (!UUID.test(userId)) return { error: "Usuário inválido" };
  const parsed = perfilSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos" };

  const cpf = somenteDigitos(parsed.data.cpf);
  const celular = somenteDigitos(parsed.data.celular);
  const telegram = somenteDigitos(parsed.data.telegram_user_id);
  if (cpf && !cpfValido(cpf)) return { error: "CPF inválido" };
  if (celular && (celular.length < 10 || celular.length > 13)) return { error: "Celular inválido (DDD + número)" };
  if (parsed.data.telegram_user_id.trim() && !/^\d{3,20}$/.test(telegram)) return { error: "ID do Telegram deve conter só números" };

  const supabase = createClient();
  const { data: alvo } = await supabase.from("profiles").select("id, role").eq("id", userId).maybeSingle();
  if (!alvo || !["vendedor", "admin"].includes(alvo.role)) return { error: "Só vendedores e admins têm dados para contrato" };

  const { error } = await supabase.from("perfis_contrato").upsert(
    {
      user_id: userId,
      cpf: cpf || null,
      celular: celular || null,
      telegram_user_id: telegram || null,
      // admin sempre tem acesso; a liberação vale para vendedor
      contratos_liberado: alvo.role === "vendedor" ? parsed.data.contratos_liberado : false,
    },
    { onConflict: "user_id" }
  );
  if (error) {
    if (error.code === "23505") return { error: "Este ID do Telegram já está cadastrado em outro usuário" };
    return { error: "Não foi possível salvar" };
  }
  revalidatePath(`/admin/usuarios/${userId}/contrato`);
  revalidatePath("/vendedor/dashboard");
  return {};
}
