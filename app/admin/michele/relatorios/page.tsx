import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Bars } from "@/components/MicheleBits";
import { StatTileText } from "@/components/StatTileText";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { requireProfile } from "@/lib/auth";
import { addDays, fmtBR, resolvePeriod, todayBR } from "@/lib/analysis/period";
import { TEMPERATURA_LABEL } from "@/lib/michele/config";
import { getRelatorio } from "@/lib/michele/queries";
import type { MicheleRelatorio } from "@/types/database";

export const dynamic = "force-dynamic";

const PRESETS = [
  { key: "hoje", label: "Hoje", dias: 1 },
  { key: "7d", label: "7 dias", dias: 7 },
  { key: "30d", label: "30 dias", dias: 30 },
] as const;

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {hint && <p className="mb-3 text-xs text-muted">{hint}</p>}
      <Card className={hint ? "" : "mt-3"}>{children}</Card>
    </section>
  );
}

export default async function RelatoriosPage({ searchParams }: { searchParams: { periodo?: string; from?: string; to?: string } }) {
  await requireProfile("admin");
  const hoje = todayBR();
  const preset = PRESETS.find((p) => p.key === searchParams.periodo);
  const custom = !preset && (searchParams.from || searchParams.to);
  const period = preset
    ? { ok: true as const, from: addDays(hoje, -(preset.dias - 1)), to: hoje }
    : custom
      ? resolvePeriod(searchParams.from, searchParams.to)
      : { ok: true as const, from: addDays(hoje, -6), to: hoje };
  const active = preset?.key ?? (custom ? "livre" : "7d");

  let erro: string | null = period.ok ? null : period.message;
  let rel: MicheleRelatorio | null = null;
  if (period.ok) {
    try {
      rel = await getRelatorio(period.from, period.to);
    } catch {
      erro = "Não foi possível gerar o relatório. Confira se a migração 010 foi aplicada.";
    }
  }

  const f = rel?.funil;
  const etapa = (n: number) => (n >= 10 ? "10 ou mais mensagens do lead" : n === 0 ? "Sem resposta do lead" : `Parou após ${n} ${n === 1 ? "mensagem" : "mensagens"} do lead`);

  return (
    <>
      <PageHeader title="Relatórios" breadcrumb={[{ label: "Admin" }, { label: "Michele IA", href: "/admin/michele" }, { label: "Relatórios" }]} />

      <div className="mb-8 flex flex-wrap items-end gap-3">
        {PRESETS.map((p) => (
          <Link
            key={p.key}
            href={`/admin/michele/relatorios?periodo=${p.key}`}
            className={`rounded-md border px-3 py-2 text-xs font-semibold ${active === p.key ? "border-brand bg-brand/10 text-white" : "border-border text-muted hover:text-white"}`}
          >
            {p.label}
          </Link>
        ))}
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">
            De
            <Input type="date" name="from" defaultValue={period.ok ? period.from : searchParams.from} className="mt-1 w-40" />
          </label>
          <label className="text-xs text-muted">
            Até
            <Input type="date" name="to" defaultValue={period.ok ? period.to : searchParams.to} className="mt-1 w-40" />
          </label>
          <Button type="submit" variant="outline" size="md">
            Aplicar
          </Button>
        </form>
      </div>

      {erro && <EmptyState>{erro}</EmptyState>}

      {rel && f && period.ok && (
        <div className="space-y-8">
          <p className="text-sm text-muted">
            Atendimentos iniciados de {fmtBR(period.from)} a {fmtBR(period.to)} (horário de Brasília).
          </p>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTileText label="Iniciaram" value={f.iniciaram} />
            <StatTileText label="Qualificados" value={f.aceitaram} hint={`${pct(f.aceitaram, f.iniciaram)} dos que iniciaram`} />
            <StatTileText label="Recusaram o consultor" value={f.recusaram} hint={`${pct(f.recusaram, f.chegaram_ao_fim)} dos que chegaram ao fim`} />
            <StatTileText label="Abandonados" value={f.abandonados} hint={`${f.em_andamento} em andamento`} />
          </div>

          <Section title="Funil">
            <Bars
              max={Math.max(1, f.iniciaram)}
              items={[
                { label: "Iniciaram", value: f.iniciaram },
                { label: "Responderam (2+ mensagens do lead)", value: f.responderam, hint: pct(f.responderam, f.iniciaram) },
                { label: "Chegaram ao fim (qualificado ou recusou)", value: f.chegaram_ao_fim, hint: pct(f.chegaram_ao_fim, f.iniciaram) },
                { label: "Aceitaram o consultor (qualificado)", value: f.aceitaram, hint: pct(f.aceitaram, f.iniciaram) },
              ]}
            />
          </Section>

          <Section title="Abandono por etapa" hint="Atendimentos sem mensagem há mais de 24 h, pela quantidade de mensagens do lead (aproxima a pergunta em que parou).">
            <Bars items={rel.abandono_por_etapa.map((e) => ({ label: etapa(e.etapa), value: e.qtd }))} empty="Nenhum abandono no período." />
          </Section>

          <Section title="Por campanha" hint="Leads e taxa de qualificação (qualificados ÷ leads).">
            <Bars
              items={rel.por_campanha.map((c) => ({
                label: c.campanha,
                value: c.leads,
                hint: `${c.qualificados} qualificados · ${pct(c.qualificados, c.leads)}`,
              }))}
            />
          </Section>

          <div className="grid gap-8 lg:grid-cols-2">
            <Section title="Faixa de budget">
              <Bars items={rel.por_budget.map((b) => ({ label: b.faixa, value: b.qtd }))} />
            </Section>
            <Section title="Temperatura">
              <Bars
                items={rel.por_temperatura.map((t) => ({
                  label: TEMPERATURA_LABEL[t.temperatura as keyof typeof TEMPERATURA_LABEL] ?? t.temperatura,
                  value: t.qtd,
                }))}
              />
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
