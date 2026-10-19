import { FileSpreadsheet, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/Markdown";
import { CopyTextButton } from "@/components/CopyTextButton";
import { ManualImage } from "@/components/ManualImage";
import { fmtDate } from "@/lib/dates";
import { fmtSize, kindOfMime } from "@/lib/manual-files";
import type { Manual, ManualFile } from "@/types/database";

export function fmtBrDate(date: string) {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

const fileUrl = (id: string, download = false) => `/api/manuais/arquivo/${id}${download ? "?download=1" : ""}`;

export function ManualView({ manual, files }: { manual: Manual; files: ManualFile[] }) {
  return (
    <div className="space-y-4">
      {manual.description && <p className="text-sm text-muted">{manual.description}</p>}

      {manual.kind === "texto" && (
        <Card className="space-y-4 p-5">
          <div className="flex justify-end">
            <CopyTextButton text={manual.content ?? ""} />
          </div>
          <Markdown source={manual.content ?? ""} />
        </Card>
      )}

      {manual.kind === "tabela_preco" && (
        <>
          <p className="text-xs text-muted">
            {manual.valid_from && <>Vigente desde {fmtBrDate(manual.valid_from)} · </>}
            Atualizada em {fmtDate(manual.updated_at).slice(0, 5)}
          </p>
          {files.length === 0 && <Card className="p-5 text-sm text-muted">Nenhum arquivo disponível.</Card>}
          {files.map((f) => {
            const kind = kindOfMime(f.mime_type);
            if (kind === "imagem") return <ManualImage key={f.id} src={fileUrl(f.id)} alt={f.file_name} />;
            const Icon = kind === "pdf" ? FileText : FileSpreadsheet;
            return (
              <Card key={f.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Icon size={22} className="shrink-0 text-brand" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{f.file_name}</p>
                    <p className="text-xs text-muted">{fmtSize(f.size_bytes)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {kind === "pdf" && (
                    <a href={fileUrl(f.id)} target="_blank" rel="noopener noreferrer">
                      <span className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-semibold text-white hover:bg-white/5">
                        Abrir
                      </span>
                    </a>
                  )}
                  <a href={fileUrl(f.id, true)}>
                    <span className="inline-flex h-8 items-center rounded-md bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-dark">
                      {kind === "pdf" ? "Baixar" : "Baixar planilha"}
                    </span>
                  </a>
                </div>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

