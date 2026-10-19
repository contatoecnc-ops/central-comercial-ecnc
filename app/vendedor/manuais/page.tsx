import Link from "next/link";
import { FileSpreadsheet, FileText } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { CategoryFilter } from "@/components/CategoryFilter";
import { ButtonLink, Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { fmtBrDate } from "@/components/ManualView";
import { fmtDate } from "@/lib/dates";
import { kindOfMime } from "@/lib/manual-files";
import { listManualFiles, listManuals } from "@/lib/queries";

export default async function VendedorManuaisPage({
  searchParams,
}: {
  searchParams: { categoria?: string; q?: string };
}) {
  const all = await listManuals({ onlyActive: true });
  const tables = all.filter((m) => m.kind === "tabela_preco").sort((a, b) => (b.valid_from ?? "").localeCompare(a.valid_from ?? ""));
  const files = await listManualFiles(tables.map((t) => t.id));
  const others = all.filter((m) => m.kind !== "tabela_preco");

  const categories = Array.from(new Set(others.map((m) => m.category))).sort();
  const q = searchParams.q?.trim().toLowerCase();

  const filtered = others.filter((m) => {
    if (searchParams.categoria && m.category !== searchParams.categoria) return false;
    if (!q) return true;
    return [m.title, m.description ?? "", m.category, ...m.tags].some((s) => s.toLowerCase().includes(q));
  });

  const groups = categories
    .map((c) => ({ category: c, items: filtered.filter((m) => m.category === c) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader title="Manuais de vendas" breadcrumb={[{ label: "Vendedor" }, { label: "Manuais" }]} />

      {tables.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-brand">Tabelas de preço vigentes</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {tables.map((t) => {
              const tf = files.filter((f) => f.manual_id === t.id);
              return (
                <Link key={t.id} href={`/vendedor/manuais/${t.id}`} className="block">
                  <Card className="h-full space-y-3 p-4 transition-colors hover:border-white/30">
                    <div>
                      <p className="font-semibold">{t.title}</p>
                      {t.description && <p className="text-sm text-muted">{t.description}</p>}
                      <p className="mt-1 text-xs text-muted">
                        {t.valid_from && <>Vigente desde {fmtBrDate(t.valid_from)} · </>}
                        Atualizada em {fmtDate(t.updated_at).slice(0, 5)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tf.slice(0, 4).map((f) =>
                        kindOfMime(f.mime_type) === "imagem" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={f.id}
                            src={`/api/manuais/arquivo/${f.id}`}
                            alt=""
                            loading="lazy"
                            className="h-20 w-20 rounded border border-border object-cover"
                          />
                        ) : (
                          <div
                            key={f.id}
                            className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded border border-border bg-white/5 p-2 text-muted"
                          >
                            {kindOfMime(f.mime_type) === "pdf" ? <FileText size={20} /> : <FileSpreadsheet size={20} />}
                            <span className="w-full truncate text-center text-[10px]">{f.file_name}</span>
                          </div>
                        )
                      )}
                      {tf.length > 4 && <span className="self-center text-xs text-muted">+{tf.length - 4}</span>}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <form className="mb-4 flex gap-2">
        {searchParams.categoria && <input type="hidden" name="categoria" value={searchParams.categoria} />}
        <Input name="q" defaultValue={searchParams.q ?? ""} placeholder="Buscar manual..." className="max-w-sm" />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>
      <div className="mb-8">
        <CategoryFilter
          categories={categories}
          active={searchParams.categoria}
          basePath="/vendedor/manuais"
          extraParams={{ q: searchParams.q }}
        />
      </div>

      {groups.length === 0 ? (
        tables.length === 0 || others.length > 0 ? <EmptyState>Nenhum manual encontrado.</EmptyState> : null
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.category}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-brand">{g.category}</h2>
              <Card className="divide-y divide-border">
                {g.items.map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <FileText size={20} className="mt-0.5 shrink-0 text-brand" />
                      <div className="min-w-0">
                        <p className="font-semibold">{m.title}</p>
                        {m.description && <p className="text-sm text-muted">{m.description}</p>}
                      </div>
                    </div>
                    {m.kind === "texto" ? (
                      <ButtonLink href={`/vendedor/manuais/${m.id}`} variant="outline" size="sm">
                        Ler
                      </ButtonLink>
                    ) : (
                      <ButtonLink href={m.drive_url ?? "#"} target="_blank" rel="noopener noreferrer" variant="outline" size="sm">
                        Abrir
                      </ButtonLink>
                    )}
                  </div>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
