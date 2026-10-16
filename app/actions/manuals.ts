"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { manualSchema, type ManualInput } from "@/lib/schemas";

type Result = { error?: string };

function row(v: ManualInput) {
  return {
    title: v.title,
    category: v.category,
    description: v.description || null,
    drive_url: v.drive_url,
    tags: (v.tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    active: v.active,
  };
}

function revalidateManuals() {
  revalidatePath("/admin/manuais");
  revalidatePath("/vendedor/manuais");
}

export async function saveManual(id: string | null, input: ManualInput): Promise<Result> {
  await requireProfile("admin");
  const parsed = manualSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = createClient();
  const { error } = id
    ? await supabase.from("manuals").update(row(parsed.data)).eq("id", id)
    : await supabase.from("manuals").insert(row(parsed.data));
  if (error) return { error: error.message };
  revalidateManuals();
  return {};
}

export async function deleteManual(id: string): Promise<Result> {
  await requireProfile("admin");
  const supabase = createClient();
  const { error } = await supabase.from("manuals").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateManuals();
  return {};
}
