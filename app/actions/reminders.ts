"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { reminderSchema } from "@/lib/schemas";

type Result = { error?: string };

function revalidate(sellerId?: string) {
  revalidatePath("/vendedor/dashboard");
  if (sellerId) revalidatePath(`/admin/usuarios/${sellerId}/lembretes`);
}

// Todas as ações usam o client do usuário: quem decide é o RLS (só admin escreve em seller_reminders).

export async function createReminder(sellerId: string, message: string): Promise<Result> {
  const me = await requireProfile("admin");
  const parsed = reminderSchema.safeParse({ message });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await createClient()
    .from("seller_reminders")
    .insert({ seller_id: sellerId, message: parsed.data.message, created_by: me.id });
  if (error) return { error: error.message };
  revalidate(sellerId);
  return {};
}

export async function updateReminder(id: string, sellerId: string, message: string): Promise<Result> {
  await requireProfile("admin");
  const parsed = reminderSchema.safeParse({ message });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await createClient().from("seller_reminders").update({ message: parsed.data.message }).eq("id", id);
  if (error) return { error: error.message };
  revalidate(sellerId);
  return {};
}

export async function setReminderActive(id: string, sellerId: string, active: boolean): Promise<Result> {
  await requireProfile("admin");
  const { error } = await createClient().from("seller_reminders").update({ active }).eq("id", id);
  if (error) return { error: error.message };
  revalidate(sellerId);
  return {};
}

export async function deleteReminder(id: string, sellerId: string): Promise<Result> {
  await requireProfile("admin");
  const { error } = await createClient().from("seller_reminders").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate(sellerId);
  return {};
}
