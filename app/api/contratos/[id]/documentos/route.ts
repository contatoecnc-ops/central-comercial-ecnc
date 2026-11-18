import { randomBytes } from "node:crypto";
import { z } from "zod";
import { marcarDocumento } from "@/lib/agente-contratos";
import { UPLOAD_MAX_BYTES } from "@/lib/contratos-config";
import { acaoContrato, repositorio } from "@/lib/contratos/rota";
import { slugify } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CampoJson = z.strictObject({ nome: z.string().trim().min(1).max(200), recebido: z.boolean() });

/** Confere o tipo pelo CONTEÚDO (assinatura dos primeiros bytes), não pela extensão nem pelo tipo declarado. */
function tipoPeloConteudo(b: Buffer): { ext: "pdf" | "jpg" | "png"; mime: string } | null {
  if (b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-") return { ext: "pdf", mime: "application/pdf" };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { ext: "png", mime: "image/png" };
  return null;
}

// Checklist de documentos do contrato (admin). Aceita JSON { nome, recebido } ou multipart com "arquivo" opcional.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return acaoContrato(req, params.id, {
    nome: "documento",
    quem: "admin",
    executar: async ({ ctx, contrato }) => {
      let nome: string;
      let recebido: boolean;
      let arquivo: File | null = null;

      if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
        if (Number(req.headers.get("content-length") ?? 0) > UPLOAD_MAX_BYTES + 64 * 1024) throw new Error("O arquivo passa de 10 MB.");
        const form = await req.formData();
        for (const k of Array.from(form.keys())) if (!["nome", "recebido", "arquivo"].includes(k)) throw new Error("Campo não permitido.");
        const campos = CampoJson.safeParse({ nome: form.get("nome"), recebido: form.get("recebido") === "true" });
        if (!campos.success) throw new Error("Informe o documento.");
        ({ nome, recebido } = campos.data);
        const f = form.get("arquivo");
        if (f instanceof File && f.size > 0) arquivo = f;
      } else {
        const texto = await req.text();
        if (Buffer.byteLength(texto) > 16 * 1024) throw new Error("Requisição grande demais.");
        let json: unknown;
        try { json = JSON.parse(texto); } catch { throw new Error("JSON inválido."); }
        const campos = CampoJson.safeParse(json);
        if (!campos.success) throw new Error("Dados inválidos.");
        ({ nome, recebido } = campos.data);
      }

      // Confere antes de gastar upload: o pacote repete essas checagens.
      if (contrato.status !== "aguardando_aprovacao") throw new Error(`Contrato está "${contrato.status}"`);
      if (!contrato.documentos.some((d) => d.nome === nome)) throw new Error(`Documento "${nome}" não é exigido neste contrato.`);

      let caminho: string | undefined;
      if (arquivo) {
        if (arquivo.size > UPLOAD_MAX_BYTES) throw new Error("O arquivo passa de 10 MB.");
        const bytes = Buffer.from(await arquivo.arrayBuffer());
        const tipo = tipoPeloConteudo(bytes);
        if (!tipo) throw new Error("Envie um arquivo PDF, JPG ou PNG.");
        // caminho montado aqui, nunca vindo do cliente
        caminho = `${contrato.numero}/docs/${Date.now()}-${slugify(nome).slice(0, 40) || "documento"}-${randomBytes(3).toString("hex")}.${tipo.ext}`;
        const { error } = await createAdminClient().storage.from("contratos").upload(caminho, bytes, { contentType: tipo.mime, upsert: false });
        if (error) throw new Error("Falha ao salvar o arquivo.");
      }
      const r = await marcarDocumento(repositorio(), params.id, nome, recebido, ctx.userId, caminho);
      return { documentos: r.documentos.map((d) => ({ nome: d.nome, recebido: d.recebido })) };
    },
  });
}
