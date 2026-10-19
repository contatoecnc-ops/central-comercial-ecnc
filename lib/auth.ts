import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/types/database";

export async function getProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile) ?? null;
}

/** Exige sessão ativa e, se informado, um dos papéis. Quem não tem o papel vai para o próprio dashboard. */
export async function requireProfile(role?: Role | Role[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile || !profile.active) redirect("/login");
  const allowed = role === undefined ? null : Array.isArray(role) ? role : [role];
  if (allowed && !allowed.includes(profile.role)) redirect(`/${profile.role}/dashboard`);
  return profile;
}
