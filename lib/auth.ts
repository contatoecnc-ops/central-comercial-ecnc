import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeDoPapel } from "@/lib/roles";
import type { Profile, Role } from "@/types/database";

export async function getProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile) ?? null;
}

/** Papel somente leitura: vê os dados de gestão e nunca escreve (a regra também está no banco, migração 011). */
export const isReadOnlyRole = (role: Role) => role === "analista";

/**
 * Exige sessão ativa e, se informado, um dos papéis. Quem não tem o papel vai para o próprio dashboard.
 * Sem `role`, vale qualquer papel que ESCREVE: o analista só entra quando for citado explicitamente
 * (páginas de leitura), então toda action que chama requireProfile() sem argumento o bloqueia.
 */
export async function requireProfile(role?: Role | Role[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile || !profile.active) redirect("/login");
  const allowed = role === undefined ? null : Array.isArray(role) ? role : [role];
  // analista e financeiro só entram quando citados explicitamente (nunca em action/página "de qualquer papel que escreve")
  if ((profile.role === "analista" || profile.role === "financeiro") && !allowed?.includes(profile.role)) redirect("/acesso-negado");
  if (allowed && !allowed.includes(profile.role)) redirect(homeDoPapel(profile.role));
  return profile;
}
