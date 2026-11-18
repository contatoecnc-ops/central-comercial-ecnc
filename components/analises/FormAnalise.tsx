"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { dataBR, documentoValido, hojeBrasilia, mascararEntrada, somenteDigitos, validadeEfetiva } from "@/lib/analise-credito/regras";

const MAX = 10 * 1024 * 1024;

/** Envio da análise pelo financeiro. O PDF só é guardado: nada é lido dele, o resultado é o que se digita aqui. */
export function FormAnalise() {
  const router = useRouter();
  const arquivo = useRef<HTMLInputElement>(null);
  const hoje = hojeBrasilia();
  const [docs, setDocs] = useState<string[]>([""]);
  const [nome, setNome] = useState("");
  const [resultado, setResultado] = useState("");
  const [analisadaEm, setAnalisadaEm] = useState(hoje);
  const [validade, setValidade] = useState("");
  const [busy, setBusy] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});

  const atualiza = (i: number, v: string) => setDocs((d) => d.map((x, k) => (k === i ? mascararEntrada(v) : x)));
  const validadeFinal = analisadaEm ? validadeEfetiva(analisadaEm, validade) : "";

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    const preenchidos = docs.map(somenteDigitos).filter(Boolean);
    if (!preenchidos.length) er.docs = "Informe ao menos um CPF ou CNPJ.";
    else if (!preenchidos.every(documentoValido)) er.docs = "CPF ou CNPJ inválido (confira os dígitos).";
    if (!nome.trim()) er.nome = "Informe o nome do cliente.";
    if (!resultado) er.resultado = "Informe o resultado.";
    if (!analisadaEm) er.data = "Informe a data da análise.";
    else if (analisadaEm > hoje) er.data = "A data não pode ser futura.";
    if (validade && analisadaEm && validade < analisadaEm) er.validade = "A validade não pode ser anterior à análise.";
    const f = arquivo.current?.files?.[0];
    if (!f) er.arquivo = "Anexe o PDF da análise.";
    else if (f.size > MAX) er.arquivo = "O arquivo passa de 10 MB.";
    setErros(er);
    if (Object.keys(er).length || !f) return;

    const fd = new FormData();
    for (const d of preenchidos) fd.append("documentos", d);
    fd.set("cliente_nome", nome.trim());
    fd.set("resultado", resultado);
    fd.set("analisada_em", analisadaEm);
    if (validade) fd.set("validade_ate", validade);
    fd.set("arquivo", f);
    setBusy(true);
    try {
      const r = await fetch("/api/analises", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return void toast.error(j.erro ?? "Não foi possível enviar.");
      toast.success(j.vinculada ? "Análise enviada e ligada a um contrato" : "Análise enviada. Fica aguardando o contrato.");
      setDocs([""]); setNome(""); setResultado(""); setAnalisadaEm(hoje); setValidade("");
      if (arquivo.current) arquivo.current.value = "";
      router.refresh();
    } catch {
      toast.error("Sem conexão. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="PDF da análise" error={erros.arquivo} hint="Somente PDF, até 10 MB." className="sm:col-span-2">
        <input
          ref={arquivo}
          type="file"
          accept="application/pdf"
          className="block w-full rounded-md border border-border bg-background text-sm text-muted file:mr-3 file:h-10 file:cursor-pointer file:border-0 file:bg-white/10 file:px-4 file:text-sm file:font-semibold file:text-white"
        />
      </Field>

      <Field label="CPF / CNPJ do cliente" error={erros.docs} hint="Pode informar até 3 (ex.: CNPJ da empresa e CPF do sócio garantidor)." className="sm:col-span-2">
        <div className="space-y-2">
          {docs.map((d, i) => (
            <div key={i} className="flex gap-2">
              <Input value={d} onChange={(e) => atualiza(i, e.target.value)} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00 ou 00.000.000/0000-00" aria-label={`Documento ${i + 1}`} />
              {docs.length > 1 && (
                <Button type="button" variant="ghost" size="sm" className="h-10" onClick={() => setDocs((l) => l.filter((_, k) => k !== i))} aria-label={`Remover documento ${i + 1}`}>
                  <X size={16} />
                </Button>
              )}
            </div>
          ))}
          {docs.length < 3 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setDocs((l) => [...l, ""])}>
              <Plus size={14} /> Adicionar documento
            </Button>
          )}
        </div>
      </Field>

      <Field label="Nome do cliente" error={erros.nome}>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} autoComplete="off" />
      </Field>
      <Field label="Resultado" error={erros.resultado}>
        <Select value={resultado} onChange={(e) => setResultado(e.target.value)}>
          <option value="">Selecione…</option>
          <option value="aprovada">Aprovada</option>
          <option value="reprovada">Reprovada</option>
        </Select>
      </Field>
      <Field label="Data da análise" error={erros.data}>
        <Input type="date" value={analisadaEm} max={hoje} onChange={(e) => setAnalisadaEm(e.target.value)} />
      </Field>
      <Field
        label="Validade (conforme o PDF)"
        error={erros.validade}
        hint={validadeFinal ? (validade ? undefined : `Em branco: vale até ${dataBR(validadeFinal)} (60 dias após a análise).`) : undefined}
      >
        <Input type="date" value={validade} min={analisadaEm || undefined} onChange={(e) => setValidade(e.target.value)} />
      </Field>

      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Enviando…" : "Enviar análise"}
        </Button>
      </div>
    </form>
  );
}
