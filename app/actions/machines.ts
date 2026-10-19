"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { machineSchema, type MachineInput } from "@/lib/schemas";
import { CATALOG_BUCKET, catalogPathFromUrl } from "@/lib/catalog-files";

type Result = { error?: string; id?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** Caminhos do bucket "catalogo" usados por uma máquina (foto principal e mídia). Só pastas da própria máquina. */
function catalogPaths(machineId: string, urls: (string | null | undefined)[]) {
  return urls
    .map(catalogPathFromUrl)
    .filter((p): p is string => !!p && p.startsWith(`${machineId}/`));
}

/** Apaga objetos do Storage (melhor esforço; nunca registra nomes nem caminhos). */
async function removeObjects(paths: string[]) {
  if (paths.length === 0) return;
  try {
    await createClient().storage.from(CATALOG_BUCKET).remove(paths);
  } catch {
    // melhor esforço
  }
}

async function currentUrls(machineId: string) {
  const supabase = createClient();
  const [{ data: machine }, { data: media }] = await Promise.all([
    supabase.from("machines").select("thumbnail_url").eq("id", machineId).maybeSingle(),
    supabase.from("machine_media").select("url").eq("machine_id", machineId),
  ]);
  return [machine?.thumbnail_url as string | null, ...(media ?? []).map((m) => m.url as string)];
}

export async function createMachine(input: MachineInput, machineId?: string): Promise<Result> {
  await requireProfile(["admin", "marketing"]);
  const parsed = machineSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (machineId && !UUID.test(machineId)) return { error: "Máquina inválida" };

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
    .insert({ ...(machineId ? { id: machineId } : {}), ...rows(parsed.data), slug })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const mediaError = await saveMedia(data.id, parsed.data.media);
  if (mediaError) return { error: mediaError };
  revalidateCatalog();
  return { id: data.id };
}

export async function updateMachine(id: string, input: MachineInput): Promise<Result> {
  await requireProfile(["admin", "marketing"]);
  const parsed = machineSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = createClient();
  const before = await currentUrls(id);
  const { error } = await supabase.from("machines").update(rows(parsed.data)).eq("id", id);
  if (error) return { error: error.message };
  const mediaError = await saveMedia(id, parsed.data.media);
  if (mediaError) return { error: mediaError };

  // fotos que saíram do cadastro também saem do Storage
  const kept = new Set(catalogPaths(id, [parsed.data.thumbnail_url, ...parsed.data.media.map((m) => m.url)]));
  await removeObjects(catalogPaths(id, before).filter((p) => !kept.has(p)));
  revalidateCatalog();
  return { id };
}

export async function deleteMachine(id: string): Promise<Result> {
  await requireProfile(["admin", "marketing"]);
  const supabase = createClient();
  const before = await currentUrls(id);
  const { error } = await supabase.from("machines").delete().eq("id", id);
  if (error) return { error: error.message };
  await removeObjects(catalogPaths(id, before));
  revalidateCatalog();
  return {};
}
