-- Vendas reais (planilha KPI_Vendas): sales_numbers.metrics passa a guardar totais por vendedor e mês
-- (vendas, meta, maquinas, pecas, estornos, por_origem, por_semana, dados_ate). Nenhum dado de cliente ou pedido.
-- Idempotente. Requer a migração 003. Execute inteira no SQL Editor do Supabase.

begin;

-- Linhas de teste/mock do formato antigo (uma linha por vendedor e período, métricas por cabeçalho).
-- A próxima sincronização repõe o ano inteiro; limpar evita misturar formatos.
delete from public.sales_numbers where not (metrics ? 'vendas');

-- Estado da última sincronização (uma linha). Só o admin lê; só a service role escreve.
create table if not exists public.sales_sync_status (
  id int primary key default 1 check (id = 1),
  synced_at timestamptz not null default now(),
  dados_ate date,
  total_planilha numeric(16,2),
  total_resumo_l2 numeric(16,2),
  total_vinculado numeric(16,2),
  total_outros numeric(16,2),
  avisos jsonb not null default '[]'::jsonb
);

alter table public.sales_sync_status enable row level security;
revoke all on public.sales_sync_status from anon;
revoke insert, update, delete, truncate on public.sales_sync_status from authenticated;

drop policy if exists sales_status_admin_select on public.sales_sync_status;
create policy sales_status_admin_select on public.sales_sync_status for select to authenticated
  using (public.is_admin());

-- sales_numbers: reafirma as regras (admin lê tudo; vendedor só as próprias linhas; ninguém escreve exceto service role).
alter table public.sales_numbers enable row level security;
revoke insert, update, delete, truncate on public.sales_numbers from authenticated;
revoke all on public.sales_numbers from anon;

drop policy if exists sales_admin_select on public.sales_numbers;
create policy sales_admin_select on public.sales_numbers for select to authenticated
  using (public.is_admin());

drop policy if exists sales_vendedor_select on public.sales_numbers;
create policy sales_vendedor_select on public.sales_numbers for select to authenticated
  using (seller_id = auth.uid() and public.is_active_user());

-- Linhas da empresa e de nomes sem vínculo têm seller_id nulo: o vendedor nunca as enxerga.
create index if not exists sales_numbers_period_idx on public.sales_numbers(period);

notify pgrst, 'reload schema';

commit;

notify pgrst, 'reload schema';
