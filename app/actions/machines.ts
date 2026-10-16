"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { machineSchema, type MachineInput } from "@/lib/schemas";

type Result = { error?: string; id?: string };

function revalidateCatalog() {
  revalidatePath("/admin/catalogo", "layout");
  revalidatePath("/vendedor/catalogo", "layout");
}

function rows(v: MachineInput) {
  return {
    name: v.name,
    category: v.category,
    tagline: v.tagline || null,
    description: v.description || null,
    thumbnail_url: v.thumbnail_url || null,
    active: v.active,
    sort_order: v.sort_order,
    specs: v.specs.filter((s) => s.label && s.value),
  };
}

async function saveMedia(machineId: string, media: MachineInput["media"]) {
  const supabase = createClient();
  const del = await supabase.from("machine_media").delete().eq("machine_id", machineId);
  if (del.error) return del.error.message;
  if (!media.length) return null;
  const ins = await supabase
    .from("machine_media")
    .insert(media.map((m, i) => ({ machine_id: machineId, type: m.type, title: m.title, url: m.url, sort_order: i })));
  return ins.error?.message ?? null;
}

export async function createMachine(input: MachineInput): Promise<Result> {
  await requireProfile("admin");
  const parsed = machineSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = createClient();
  const base = slugify(parsed.data.name) || "maquina";
  let slug = base;
  for (let i = 2; ; i++) {
    const { data } = await supabase.from("machines").select("id").eq("slug", slug).maybeSingle();
    if (!data) break;
    slug = `${base}-${i}`;
  }

  const { data, error } = await supabase
    .from("machines")
    .insert({ ...rows(parsed.data), slug })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const mediaError = await saveMedia(data.id, parsed.data.media);
  if (mediaError) return { error: mediaError };
  revalidateCatalog();
  return { id: data.id };
}

export async function updateMachine(id: string, input: MachineInput): Promise<Result> {
  await requireProfile("admin");
  const parsed = machineSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = createClient();
  const { error } = await supabase.from("machines").update(rows(parsed.data)).eq("id", id);
  if (error) return { error: error.message };
  const mediaError = await saveMedia(id, parsed.data.media);
  if (mediaError) return { error: mediaError };
  revalidateCatalog();
  return { id };
}

export async function deleteMachine(id: string): Promise<Result> {
  await requireProfile("admin");
  const supabase = createClient();
  const { error } = await supabase.from("machines").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateCatalog();
  return {};
}
