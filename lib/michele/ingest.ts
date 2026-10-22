import { z } from "zod";

export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_MESSAGES = 50;
export const MAX_TEXT = 8000;
const DAY_MS = 86_400_000;

/** Data ISO válida e que não esteja mais de 1 dia no futuro. */
const isoDate = z
  .string()
  .max(40)
  .refine((s) => {
    const ms = Date.parse(s);
    return !Number.isNaN(ms) && ms <= Date.now() + DAY_MS;
  });

const text = (max: number) => z.string().max(max).nullish();

const mensagem = z.object({
  ordem: z.number().int().min(0).max(1_000_000),
  papel: z.enum(["lead", "michele"]),
  texto: z.string().min(1).max(MAX_TEXT),
  enviada_em: isoDate.nullish(),
});

export const ingestSchema = z.object({
  sessao_id: z.string().trim().min(1).max(200),
  telefone: z
    .string()
    .max(40)
    .transform((s) => s.replace(/\D/g, ""))
    .refine((s) => s.length >= 8 && s.length <= 15),
  nome: text(200),
  origem: z.enum(["whatsapp", "instagram"]).nullish(),
  campanha: text(120),
  iniciado_em: isoDate.nullish(),
  status: z.enum(["em_andamento", "qualificado", "recusou"]).nullish(),
  score: z.number().int().min(0).max(1000).nullish(),
  temperatura: z.enum(["lead-quente", "lead-morno", "lead-frio"]).nullish(),
  prioridade: z.boolean().nullish(),
  segmento: text(500),
  budget: text(500),
  cnpj_cpf: text(40),
  momento_compra: text(500),
  produto_provavel: text(500),
  resumo: z.record(z.string(), z.unknown()).nullish(),
  kommo_lead_id: z
    .union([z.number().int().positive(), z.string().regex(/^\d{1,15}$/).transform(Number)])
    .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER))
    .nullish(),
  mensagens: z.array(mensagem).max(MAX_MESSAGES).nullish(),
});

export type IngestPayload = z.infer<typeof ingestSchema>;

/** CPF (11 dígitos) → só os 6 do meio; CNPJ (14) completo; já mascarado mantém; outro formato descarta. */
export function maskDoc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/^\*\*\*\.\d{3}\.\d{3}-\*\*$/.test(raw)) return raw;
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return d;
  return null;
}

/** Objeto enviado à função michele_ingest: chaves explícitas, vazio vira null. */
export function toRpcPayload(p: IngestPayload) {
  const n = <T,>(v: T | null | undefined) => (v === undefined || v === "" ? null : v);
  return {
    sessao_id: p.sessao_id,
    telefone: p.telefone,
    nome: n(p.nome),
    origem: n(p.origem),
    campanha: n(p.campanha),
    iniciado_em: n(p.iniciado_em),
    status: n(p.status),
    score: n(p.score),
    temperatura: n(p.temperatura),
    prioridade: n(p.prioridade),
    segmento: n(p.segmento),
    budget: n(p.budget),
    cnpj_cpf: maskDoc(p.cnpj_cpf),
    momento_compra: n(p.momento_compra),
    produto_provavel: n(p.produto_provavel),
    resumo: n(p.resumo),
    kommo_lead_id: n(p.kommo_lead_id),
    mensagens: (p.mensagens ?? []).map((m) => ({ ...m, enviada_em: n(m.enviada_em) })),
  };
}
