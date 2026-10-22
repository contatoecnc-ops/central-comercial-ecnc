import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/dates";
import {
  STATUS_CLASS,
  STATUS_LABEL,
  TEMPERATURA_CLASS,
  TEMPERATURA_LABEL,
} from "@/lib/michele/config";
import type { MicheleMensagem, MicheleStatusEfetivo, MicheleTemperatura } from "@/types/database";

const pill = "inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium";

export function MicheleStatusBadge({ status }: { status: MicheleStatusEfetivo }) {
  return <span className={cn(pill, STATUS_CLASS[status])}>{STATUS_LABEL[status]}</span>;
}

export function MicheleTempBadge({ temperatura }: { temperatura: MicheleTemperatura | null }) {
  if (!temperatura) return <span className="text-xs text-muted">—</span>;
  return <span className={cn(pill, TEMPERATURA_CLASS[temperatura])}>{TEMPERATURA_LABEL[temperatura]}</span>;
}

/** Telefone só com dígitos → "+55 14 99999-9999" quando tiver o formato brasileiro; senão, os dígitos. */
export function fmtTelefone(d: string) {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : d;
}

/** "há 5 min", "há 3 h", "há 2 d" */
export function fmtHa(iso: string | null, now = Date.now()) {
  if (!iso) return "—";
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.floor(min / 60)} h`;
  return `há ${Math.floor(min / 1440)} d`;
}

/** Chat: lead à direita, Michele à esquerda. Texto SEMPRE puro (nada de HTML, link automático ou Markdown). */
export function MicheleChat({ mensagens }: { mensagens: MicheleMensagem[] }) {
  if (mensagens.length === 0) return <p className="p-6 text-sm text-muted">Sem mensagens gravadas.</p>;
  return (
    <ol className="space-y-3 p-4 md:p-6">
      {mensagens.map((m) => {
        const lead = m.papel === "lead";
        return (
          <li key={m.id} className={cn("flex", lead ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-lg border px-3.5 py-2.5 md:max-w-[75%]",
                lead ? "border-brand/30 bg-brand/10" : "border-border bg-white/5"
              )}
            >
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{lead ? "Lead" : "Michele"}</p>
              <p className="whitespace-pre-wrap break-words text-sm">{m.texto}</p>
              <p className="mt-1.5 text-right text-[11px] text-muted">{fmtDateTime(m.enviada_em)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Barras horizontais em CSS. `max` é o valor que ocupa 100% da largura. */
export function Bars({
  items,
  max,
  empty = "Sem dados no período.",
}: {
  items: { label: string; value: number; hint?: string }[];
  max?: number;
  empty?: string;
}) {
  if (items.length === 0) return <p className="p-5 text-sm text-muted">{empty}</p>;
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3 p-5">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{i.label}</span>
            <span className="shrink-0 tabular-nums text-muted">
              <span className="font-semibold text-white">{i.value}</span>
              {i.hint ? ` · ${i.hint}` : ""}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(i.value > 0 ? 2 : 0, (i.value / top) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
