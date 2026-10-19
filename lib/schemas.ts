import { z } from "zod";
import { CHANNELS, FORMATS } from "@/lib/marketing-config";

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

/** Tarefa criada pelo próprio vendedor: sem campo de vendedor (sempre ele mesmo). */
export const ownTaskSchema = taskSchema.omit({ assigned_to: true });
export type OwnTaskInput = z.infer<typeof ownTaskSchema>;

export const reminderSchema = z.object({
  message: z.string().trim().min(1, "Escreva o lembrete").max(1000, "Máximo de 1000 caracteres"),
});

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

export const manualSchema = z
  .object({
    kind: z.enum(["link", "texto", "tabela_preco"]),
    title: z.string().trim().min(1, "Informe o título"),
    category: z.string().trim().min(1, "Informe a categoria"),
    description: z.string().trim().optional(),
    drive_url: z.string().trim().optional(),
    content: z.string().max(20000, "Texto muito longo (máx. 20.000 caracteres)").optional(),
    valid_from: z.string().optional(), // yyyy-MM-dd
    tags: z.string().trim().optional(), // separadas por vírgula
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "link" && !/^https?:\/\//i.test(v.drive_url ?? "")) {
      ctx.addIssue({ code: "custom", path: ["drive_url"], message: "URL inválida" });
    }
    if (v.kind === "texto" && !v.content?.trim()) {
      ctx.addIssue({ code: "custom", path: ["content"], message: "Escreva o texto da dica" });
    }
    if (v.kind === "tabela_preco" && !/^\d{4}-\d{2}-\d{2}$/.test(v.valid_from ?? "")) {
      ctx.addIssue({ code: "custom", path: ["valid_from"], message: "Informe a data de vigência" });
    }
  });
export type ManualInput = z.infer<typeof manualSchema>;

export const userSchema = z.object({
  full_name: z.string().trim().min(1, "Informe o nome"),
  email: z.string().trim().email("Email inválido"),
  password: z.string().min(8, "Mínimo de 8 caracteres"),
  role: z.enum(["admin", "vendedor", "marketing"]),
});
export type UserInput = z.infer<typeof userSchema>;

export const contentSchema = z.object({
  title: z.string().trim().min(1, "Informe o título").max(200, "Título muito longo"),
  caption: z.string().max(10000, "Legenda muito longa").optional(),
  channels: z.array(z.string()).refine((c) => c.every((x) => (CHANNELS as readonly string[]).includes(x)), "Canal inválido"),
  format: z.string().refine((v) => v === "" || (FORMATS as readonly string[]).includes(v), "Formato inválido").optional(),
  machine_id: z.string().refine((v) => v === "" || /^[0-9a-f-]{36}$/i.test(v), "Produto inválido").optional(),
  campaign: z.string().trim().max(120, "Campanha muito longa").optional(),
  scheduled_for: z.string().optional(), // datetime-local (horário de São Paulo) ou vazio
  assigned_to: z.string().refine((v) => v === "" || /^[0-9a-f-]{36}$/i.test(v), "Responsável inválido").optional(),
});
export type ContentInput = z.infer<typeof contentSchema>;
