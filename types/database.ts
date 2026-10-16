export type Role = "admin" | "vendedor";
export type Priority = "baixa" | "media" | "alta";
export type TaskStatus = "pendente" | "em_andamento" | "concluida" | "cancelada";
export type MachineCategory = "CO2" | "Fiber" | "UV" | "Solda Laser";
export type MediaType = "foto" | "video" | "pdf" | "video_teste" | "link";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  active: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: Priority;
  status: TaskStatus;
  assigned_to: string;
  created_by: string;
  due_date: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskWithAssignee extends Task {
  assignee: Pick<Profile, "id" | "full_name"> | null;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: Pick<Profile, "id" | "full_name" | "role"> | null;
}

export interface Spec {
  label: string;
  value: string;
}

export interface Machine {
  id: string;
  name: string;
  slug: string;
  category: MachineCategory;
  tagline: string | null;
  description: string | null;
  specs: Spec[];
  thumbnail_url: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export interface MachineMedia {
  id: string;
  machine_id: string;
  type: MediaType;
  title: string;
  url: string;
  sort_order: number;
}

export interface Manual {
  id: string;
  title: string;
  category: string;
  description: string | null;
  drive_url: string;
  tags: string[];
  active: boolean;
  created_at: string;
}
