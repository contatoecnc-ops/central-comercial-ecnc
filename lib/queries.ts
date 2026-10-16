import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  Machine,
  MachineMedia,
  Manual,
  Profile,
  TaskComment,
  TaskWithAssignee,
} from "@/types/database";

const TASK_SELECT = "*, assignee:profiles!tasks_assigned_to_fkey(id, full_name)";

export async function listTasks(filter?: { assignedTo?: string; status?: string }) {
  const supabase = createClient();
  let q = supabase.from("tasks").select(TASK_SELECT);
  if (filter?.assignedTo) q = q.eq("assigned_to", filter.assignedTo);
  if (filter?.status) q = q.eq("status", filter.status);
  const { data } = await q.order("due_date", { ascending: true });
  return (data ?? []) as unknown as TaskWithAssignee[];
}

export async function getTaskWithComments(id: string) {
  const supabase = createClient();
  const { data: task } = await supabase.from("tasks").select(TASK_SELECT).eq("id", id).maybeSingle();
  if (!task) notFound();
  const { data: comments } = await supabase
    .from("task_comments")
    .select("*, author:profiles!task_comments_author_id_fkey(id, full_name, role)")
    .eq("task_id", id)
    .order("created_at", { ascending: true });
  return {
    task: task as unknown as TaskWithAssignee,
    comments: (comments ?? []) as unknown as TaskComment[],
  };
}

export async function listVendedores(onlyActive = true) {
  const supabase = createClient();
  let q = supabase.from("profiles").select("id, full_name").eq("role", "vendedor");
  if (onlyActive) q = q.eq("active", true);
  const { data } = await q.order("full_name");
  return (data ?? []) as Pick<Profile, "id" | "full_name">[];
}

export async function listMachines(opts?: { onlyActive?: boolean; category?: string }) {
  const supabase = createClient();
  let q = supabase.from("machines").select("*");
  if (opts?.onlyActive) q = q.eq("active", true);
  if (opts?.category) q = q.eq("category", opts.category);
  const { data } = await q.order("sort_order").order("name");
  return (data ?? []) as Machine[];
}

export async function getMachine(id: string) {
  const supabase = createClient();
  const { data: machine } = await supabase.from("machines").select("*").eq("id", id).maybeSingle();
  if (!machine) notFound();
  const { data: media } = await supabase
    .from("machine_media")
    .select("*")
    .eq("machine_id", id)
    .order("sort_order");
  return { machine: machine as Machine, media: (media ?? []) as MachineMedia[] };
}

export async function listManuals(opts?: { onlyActive?: boolean }) {
  const supabase = createClient();
  let q = supabase.from("manuals").select("*");
  if (opts?.onlyActive) q = q.eq("active", true);
  const { data } = await q.order("category").order("title");
  return (data ?? []) as Manual[];
}
