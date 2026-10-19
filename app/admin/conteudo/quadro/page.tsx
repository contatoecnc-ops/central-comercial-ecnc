import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { ContentCard, ContentNav, StatusPill } from "@/components/ContentBits";
import { requireProfile } from "@/lib/auth";
import { countPendingApproval, latestFiles, listContent, listContentFiles, listStaff } from "@/lib/content-queries";
import { listMachines } from "@/lib/queries";
import { CHANNELS, STATUS_ORDER } from "@/lib/marketing-config";

export default async function QuadroPage({
  searchParams,
}: {
  searchParams: { canal?: string; produto?: string; campanha?: string; resp?: string; arquivados?: string };
}) {
  const me = await requireProfile(["admin", "marketing"]);
  const [all, machines, staff, pending] = await Promise.all([
    listContent(),
    listMachines(),
    listStaff(),
    me.role === "admin" ? countPendingApproval() : 0,
  ]);

  const campaigns = Array.from(new Set(all.map((i) => i.campaign).filter((c): c is string => !!c))).sort();
  const q = searchParams.campanha?.trim().toLowerCase();
  const items = all.filter((i) => {
    if (searchParams.canal && !i.channels.includes(searchParams.canal)) return false;
    if (searchParams.produto && i.machine_id !== searchParams.produto) return false;
    if (q && !(i.campaign ?? "").toLowerCase().includes(q)) return false;
    if (searchParams.resp && i.assigned_to !== searchParams.resp) return false;
    return true;
  });

  const files = await listContentFiles(items.map((i) => i.id));
  const latest = latestFiles(files);
  const names = new Map(staff.map((s) => [s.id, s.full_name]));
  const showArchived = searchParams.arquivados === "1";
  const columns = STATUS_ORDER.filter((s) => showArchived || s !== "arquivado");

  return (
    <>
      <PageHeader title="Quadro de conteúdo" breadcrumb={[{ label: "Conteúdo", href: "/admin/conteudo" }, { label: "Quadro" }]} />
      <ContentNav role={me.role} active="/admin/conteudo/quadro" pending={pending} />

      <form className="mb-6 flex flex-wrap items-end gap-2">
        <Select name="canal" defaultValue={searchParams.canal ?? ""} className="w-44" aria-label="Canal">
          <option value="">Todos os canais</option>
          {CHANNELS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select name="produto" defaultValue={searchParams.produto ?? ""} className="w-44" aria-label="Produto">
          <option value="">Todos os produtos</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Input name="campanha" list="campaigns" defaultValue={searchParams.campanha ?? ""} placeholder="Campanha" className="w-44" />
        <datalist id="campaigns">
          {campaigns.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Select name="resp" defaultValue={searchParams.resp ?? ""} className="w-44" aria-label="Responsável">
          <option value="">Todos os responsáveis</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </Select>
        <label className="flex h-10 items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="arquivados" value="1" defaultChecked={showArchived} className="accent-[#E30613]" />
          Arquivados
        </label>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((s) => {
          const col = items.filter((i) => i.status === s);
          return (
            <section key={s} className="w-64 shrink-0 space-y-3">
              <h2 className="flex items-center justify-between">
                <StatusPill status={s} />
                <span className="text-xs text-muted">{col.length}</span>
              </h2>
              {col.map((i) => (
                <ContentCard
                  key={i.id}
                  item={i}
                  latest={latest.get(i.id) ?? []}
                  assignee={i.assigned_to ? names.get(i.assigned_to) : undefined}
                  role={me.role}
                />
              ))}
              {col.length === 0 && <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted">Vazio</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}
