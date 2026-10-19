import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/dates";
import { fmtSize } from "@/lib/manual-files";
import type { RequestComment, RequestFile } from "@/types/database";

const ANDAMENTO_COLOR: Record<string, string> = {
  "Aguardando triagem": "bg-amber-500/15 text-amber-300 border-amber-500/40",
  "Na fila do marketing": "bg-sky-500/15 text-sky-300 border-sky-500/40",
  "Em produção": "bg-blue-500/15 text-blue-300 border-blue-500/40",
  "Em revisão": "bg-violet-500/15 text-violet-300 border-violet-500/40",
  Pronto: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  Entregue: "bg-teal-500/15 text-teal-300 border-teal-500/40",
  Recusada: "bg-red-500/15 text-red-300 border-red-500/40",
  Cancelada: "bg-white/5 text-white/40 border-white/10",
  Encerrada: "bg-white/5 text-white/40 border-white/10",
};

export function AndamentoPill({ label }: { label: string }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", ANDAMENTO_COLOR[label] ?? ANDAMENTO_COLOR.Encerrada)}>
      {label}
    </span>
  );
}

/** Andamento do vendedor em passos simples (sem expor nada do conteúdo interno). */
const STEPS = ["Aguardando triagem", "Na fila do marketing", "Em produção", "Em revisão", "Pronto", "Entregue"];
const STEP_OF: Record<string, number> = { "Aguardando triagem": 0, "Na fila do marketing": 1, "Em produção": 2, "Em revisão": 3, Pronto: 4, Entregue: 5 };

export function ProgressSteps({ label }: { label: string }) {
  const at = STEP_OF[label];
  if (at === undefined) return null;
  return (
    <ol className="flex flex-wrap gap-1 text-[11px]">
      {STEPS.map((s, i) => (
        <li key={s} className={cn("rounded-full border px-2 py-0.5", i <= at ? "border-brand bg-brand/20 text-white" : "border-border text-muted")}>
          {s}
        </li>
      ))}
    </ol>
  );
}

export function RequestFilesList({ files, base }: { files: RequestFile[]; base: string }) {
  if (files.length === 0) return <p className="text-sm text-muted">Sem anexos.</p>;
  return (
    <ul className="space-y-2">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-3 rounded-md border border-border p-2 text-sm">
          <FileText size={16} className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate">{f.file_name}</span>
          <span className="text-xs text-muted">{fmtSize(f.size_bytes)}</span>
          <a
            href={`${base}/${f.id}?download=1`}
            className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-semibold hover:bg-white/5"
          >
            Baixar
          </a>
        </li>
      ))}
    </ul>
  );
}

export function RequestCommentList({
  comments,
  names,
  me,
}: {
  comments: RequestComment[];
  names: Map<string, string>;
  me: string;
}) {
  if (comments.length === 0) return <p className="text-sm text-muted">Sem comentários.</p>;
  return (
    <ul className="space-y-3">
      {comments.map((c) => (
        <li key={c.id} className={cn("rounded-md p-3 text-sm", c.author_id === me ? "bg-brand/10" : "bg-white/5")}>
          <p className="mb-1 text-xs text-muted">
            {names.get(c.author_id) ?? "—"} · {fmtDateTime(c.created_at)}
          </p>
          <p className="whitespace-pre-wrap">{c.body}</p>
        </li>
      ))}
    </ul>
  );
}
