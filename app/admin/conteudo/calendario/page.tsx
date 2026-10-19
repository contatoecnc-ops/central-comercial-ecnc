import Link from "next/link";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ChannelChips, ContentNav } from "@/components/ContentBits";
import { requireProfile } from "@/lib/auth";
import { countPendingApproval, listContent } from "@/lib/content-queries";
import { TZ } from "@/lib/dates";
import { PRIORITIES, PRIORITY_DOT, PRIORITY_LABEL, STATUS_COLOR } from "@/lib/marketing-config";
import { cn } from "@/lib/utils";

const KEY = "yyyy-MM-dd";
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const utcStart = (d: Date) => fromZonedTime(`${format(d, KEY)}T00:00:00`, TZ).toISOString();

export default async function CalendarioPage({ searchParams }: { searchParams: { data?: string; vista?: string; prioridade?: string } }) {
  const me = await requireProfile(["admin", "marketing"]);
  const todayKey = formatInTimeZone(new Date(), TZ, KEY);
  const week = searchParams.vista === "semana";
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.data ?? "") ? parse(searchParams.data!) : parse(todayKey);

  const first = week ? startOfWeek(ref) : startOfWeek(startOfMonth(ref));
  const last = week ? addDays(first, 6) : addDays(startOfWeek(endOfMonth(ref)), 6);
  const days = eachDayOfInterval({ start: first, end: last });

  const [items, pending] = await Promise.all([
    listContent({ from: utcStart(first), to: utcStart(addDays(last, 1)) }),
    me.role === "admin" ? countPendingApproval() : 0,
  ]);
  const byDay = new Map<string, typeof items>();
  for (const i of items) {
    if (searchParams.prioridade && i.priority !== searchParams.prioridade) continue;
    const key = formatInTimeZone(i.scheduled_for!, TZ, KEY);
    byDay.set(key, [...(byDay.get(key) ?? []), i]);
  }

  const prev = week ? addWeeks(ref, -1) : addMonths(ref, -1);
  const next = week ? addWeeks(ref, 1) : addMonths(ref, 1);
  const filtro = searchParams.prioridade ? `&prioridade=${searchParams.prioridade}` : "";
  const href = (d: Date, vista = week ? "semana" : "mes") => `/admin/conteudo/calendario?vista=${vista}&data=${format(d, KEY)}${filtro}`;
  const title = week
    ? `${format(first, "dd/MM", { locale: ptBR })} a ${format(last, "dd/MM/yyyy", { locale: ptBR })}`
    : format(ref, "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <>
      <PageHeader title="Calendário de publicações" breadcrumb={[{ label: "Conteúdo", href: "/admin/conteudo" }, { label: "Calendário" }]} />
      <ContentNav role={me.role} active="/admin/conteudo/calendario" pending={pending} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={href(prev)} aria-label="Anterior" className="rounded-md border border-border p-2 hover:bg-white/5">
            <ChevronLeft size={16} />
          </Link>
          <h2 className="min-w-[10rem] text-center text-sm font-bold capitalize">{title}</h2>
          <Link href={href(next)} aria-label="Próximo" className="rounded-md border border-border p-2 hover:bg-white/5">
            <ChevronRight size={16} />
          </Link>
          <Link href={href(parse(todayKey))} className="rounded-md border border-border px-3 py-2 text-xs hover:bg-white/5">
            Hoje
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="mr-1 text-muted">Prioridade:</span>
          {[{ v: "", l: "Todas" }, ...PRIORITIES.map((p) => ({ v: p, l: PRIORITY_LABEL[p] }))].map((o) => (
            <Link
              key={o.v}
              href={`/admin/conteudo/calendario?vista=${week ? "semana" : "mes"}&data=${format(ref, KEY)}${o.v ? `&prioridade=${o.v}` : ""}`}
              className={cn("rounded-md border px-2 py-1.5", (searchParams.prioridade ?? "") === o.v ? "border-brand text-white" : "border-border text-muted")}
            >
              {o.l}
            </Link>
          ))}
        </div>
        <div className="flex gap-1 text-xs">
          <Link href={href(ref, "mes")} className={cn("rounded-md border px-3 py-1.5", !week ? "border-brand text-white" : "border-border text-muted")}>
            Mês
          </Link>
          <Link href={href(ref, "semana")} className={cn("rounded-md border px-3 py-1.5", week ? "border-brand text-white" : "border-border text-muted")}>
            Semana
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7 gap-px rounded-lg border border-border bg-border">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
            <div key={d} className="bg-card p-2 text-center text-xs font-semibold uppercase text-muted">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const key = format(d, KEY);
            const list = byDay.get(key) ?? [];
            const outside = !week && d.getMonth() !== ref.getMonth();
            return (
              <div key={key} className={cn("bg-background p-1.5", week ? "min-h-[220px]" : "min-h-[110px]", outside && "opacity-40")}>
                <p className={cn("mb-1 text-xs", key === todayKey ? "font-bold text-brand" : "text-muted")}>{format(d, "d")}</p>
                <div className="space-y-1">
                  {list.map((i) => (
                    <Link
                      key={i.id}
                      href={`/admin/conteudo/${i.id}`}
                      className={cn("block rounded border px-1.5 py-1 text-[11px] leading-tight hover:brightness-125", STATUS_COLOR[i.status])}
                    >
                      <span className="block truncate font-semibold">
                        <span className={cn("mr-1 inline-block h-2 w-2 rounded-full align-middle", PRIORITY_DOT[i.priority])} title={PRIORITY_LABEL[i.priority]} />
                        {formatInTimeZone(i.scheduled_for!, TZ, "HH:mm")} {i.title}
                      </span>
                      <ChannelChips channels={i.channels} />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
