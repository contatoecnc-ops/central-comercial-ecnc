import type { SalesMetrics } from "@/lib/sales/workbook";

export type Role = "admin" | "vendedor" | "marketing";
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
  sheet_name: string | null;
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

export type ManualKind = "link" | "texto" | "tabela_preco";

export interface Manual {
  id: string;
  kind: ManualKind;
  title: string;
  category: string;
  description: string | null;
  drive_url: string | null;
  content: string | null;
  valid_from: string | null;
  tags: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ManualFile {
  id: string;
  manual_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sort_order: number;
  created_at: string;
}

export interface SellerReminder {
  id: string;
  seller_id: string;
  message: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesNumber {
  id: string;
  seller_id: string | null;
  seller_label: string;
  period: string;
  metrics: SalesMetrics;
  synced_at: string;
}

export interface SalesSyncStatus {
  id: number;
  synced_at: string;
  dados_ate: string | null;
  total_planilha: number | null;
  total_resumo_l2: number | null;
  total_vinculado: number | null;
  total_outros: number | null;
  avisos: string[];
}

export interface ContentItem {
  id: string;
  title: string;
  caption: string | null;
  channels: string[];
  format: string | null;
  machine_id: string | null;
  campaign: string | null;
  status: import("@/lib/marketing-config").ContentStatus;
  scheduled_for: string | null;
  assigned_to: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentFile {
  id: string;
  content_id: string;
  storage_path: string | null;
  external_url: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  kind: import("@/lib/marketing-config").FileKindContent;
  version: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface ContentEvent {
  id: string;
  content_id: string;
  actor_id: string | null;
  event_type: "status_change" | "comment" | "file_added";
  from_status: string | null;
  to_status: string | null;
  body: string | null;
  created_at: string;
}
