import { z } from "zod";

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Informe o título"),
  description: z.string().trim().optional(),
  category: z.string().trim().optional(),
  priority: z.enum(["baixa", "media", "alta"]),
  status: z.enum(["pendente", "em_andamento", "concluida", "cancelada"]),
  assigned_to: z.string().min(1, "Selecione o vendedor"),
  due_date: z.string().min(1, "Informe o prazo"), // datetime-local (horário de SP)
});
export type TaskInput = z.infer<typeof taskSchema>;

export const MACHINE_CATEGORIES = ["CO2", "Fiber", "UV", "Solda Laser"] as const;
export const MEDIA_TYPES = ["foto", "video", "pdf", "video_teste", "link"] as const;
export const mediaTypeLabels: Record<(typeof MEDIA_TYPES)[number], string> = {
  foto: "Foto",
  video: "Vídeo",
  pdf: "PDF",
  video_teste: "Vídeo de teste",
  link: "Link útil",
};

const optionalUrl = z
  .string()
  .trim()
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "URL deve começar com http:// ou https://");

export const machineSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome"),
  category: z.enum(MACHINE_CATEGORIES),
  tagline: z.string().trim().optional(),
  description: z.string().trim().optional(),
  thumbnail_url: optionalUrl.optional(),
  active: z.boolean(),
  sort_order: z.number().int(),
  specs: z.array(z.object({ label: z.string().trim(), value: z.string().trim() })),
  media: z.array(
    z.object({
      type: z.enum(MEDIA_TYPES),
      title: z.string().trim().min(1, "Título obrigatório"),
      url: z.string().trim().regex(/^https?:\/\//i, "URL inválida"),
    })
  ),
});
export type MachineInput = z.infer<typeof machineSchema>;

export const manualSchema = z.object({
  title: z.string().trim().min(1, "Informe o título"),
  category: z.string().trim().min(1, "Informe a categoria"),
  description: z.string().trim().optional(),
  drive_url: z.string().trim().regex(/^https?:\/\//i, "URL inválida"),
  tags: z.string().trim().optional(), // separadas por vírgula
  active: z.boolean(),
});
export type ManualInput = z.infer<typeof manualSchema>;

export const userSchema = z.object({
  full_name: z.string().trim().min(1, "Informe o nome"),
  email: z.string().trim().email("Email inválido"),
  password: z.string().min(8, "Mínimo de 8 caracteres"),
  role: z.enum(["admin", "vendedor"]),
});
export type UserInput = z.infer<typeof userSchema>;
