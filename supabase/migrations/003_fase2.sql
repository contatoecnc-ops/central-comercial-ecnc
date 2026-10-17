-- Fase 2: auditoria de segurança, lembretes do gestor, tarefas próprias do vendedor e números de vendas.
-- Idempotente: pode ser executada mais de uma vez. Execute inteira no SQL Editor do Supabase.
-- Requer as migrações 001 e 002 (ou o schema.sql) já aplicadas.

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 0. Funções auxiliares
-- ═════════════════════════════════════════════════════════════════════════

-- Usuário logado e ativo (vendedor desativado perde acesso no banco, não só na interface).
create or replace function public.is_active_user() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

-- Service role / SQL Editor chegam com auth.uid() nulo; admin é o gestor logado.
create or replace function public.is_privileged() returns boolean
language sql security definer set search_path = public stable as $$
  select auth.uid() is null or public.is_admin();
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. profiles: sheet_name + proteção de colunas sensíveis
-- ═════════════════════════════════════════════════════════════════════════
alter table public.profiles add column if not exists sheet_name text;

-- Hoje só existe a policy profiles_admin_write (vendedor não consegue dar update no perfil).
-- O trigger abaixo é defesa em profundidade: se um dia houver policy de auto-edição,
-- o vendedor continua sem poder mexer em role/active/email/sheet_name.
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_privileged() then return new; end if;
  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.active is distinct from old.active
     or new.email is distinct from old.email
     or new.sheet_name is distinct from old.sheet_name
     or new.created_at is distinct from old.created_at then
    raise exception 'Sem permissão para alterar role, active, email ou sheet_name';
  end if;
  return new;
end; $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ═════════════════════════════════════════════════════════════════════════
-- 2. tasks: tarefas próprias + guard revisado
-- ═════════════════════════════════════════════════════════════════════════

-- Update: service role passa (antes era bloqueada, pois auth.uid() nulo caía nas regras de vendedor).
--  • tarefa criada pelo admin  → vendedor só muda status (completed_at é calculado aqui);
--                                não cancela.
--  • tarefa criada pelo vendedor → vendedor edita campos, status e cancela;
--                                  assigned_to / created_by nunca mudam.
create or replace function public.tasks_guard_vendedor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_privileged() then return new; end if;

  if new.id is distinct from old.id
     or new.assigned_to is distinct from old.assigned_to
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Responsável e autoria da tarefa não podem ser alterados';
  end if;

  if old.created_by is distinct from auth.uid() then
    -- tarefa atribuída pelo gestor
    if new.title is distinct from old.title or new.description is distinct from old.description
       or new.category is distinct from old.category or new.priority is distinct from old.priority
       or new.due_date is distinct from old.due_date then
      raise exception 'Vendedor só pode alterar o status da tarefa';
    end if;
    if new.status = 'cancelada' and old.status is distinct from 'cancelada' then
      raise exception 'Vendedor não pode cancelar tarefas atribuídas pelo gestor';
    end if;
    if old.status = 'cancelada' and new.status is distinct from old.status then
      raise exception 'Tarefa cancelada pelo gestor não pode ser reaberta';
    end if;
  end if;

  -- completed_at não é confiável vindo do cliente
  if new.status = 'concluida' then
    new.completed_at := case when old.status = 'concluida' then old.completed_at else now() end;
  else
    new.completed_at := null;
  end if;
  return new;
end; $$;
drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before update on public.tasks
  for each row execute function public.tasks_guard_vendedor();

-- Insert pelo vendedor: normaliza campos controlados pelo servidor.
create or replace function public.tasks_guard_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_privileged() then return new; end if;
  new.created_at := now();
  new.updated_at := now();
  new.completed_at := case when new.status = 'concluida' then now() else null end;
  return new;
end; $$;
drop trigger if exists tasks_guard_insert on public.tasks;
create trigger tasks_guard_insert before insert on public.tasks
  for each row execute function public.tasks_guard_insert();

drop policy if exists tasks_vendedor_select on public.tasks;
create policy tasks_vendedor_select on public.tasks for select to authenticated
  using (assigned_to = auth.uid() and public.is_active_user());

drop policy if exists tasks_vendedor_insert on public.tasks;
create policy tasks_vendedor_insert on public.tasks for insert to authenticated
  with check (assigned_to = auth.uid() and created_by = auth.uid() and public.is_active_user());

drop policy if exists tasks_vendedor_update on public.tasks;
create policy tasks_vendedor_update on public.tasks for update to authenticated
  using (assigned_to = auth.uid() and public.is_active_user())
  with check (assigned_to = auth.uid() and public.is_active_user());
-- (sem policy de delete para vendedor: tarefa própria é descartada por cancelamento)

-- ═════════════════════════════════════════════════════════════════════════
-- 3. task_comments: imutáveis
-- ═════════════════════════════════════════════════════════════════════════
drop policy if exists comments_select on public.task_comments;
create policy comments_select on public.task_comments for select to authenticated
  using (
    public.is_admin()
    or (public.is_active_user()
        and exists (select 1 from public.tasks t where t.id = task_id and t.assigned_to = auth.uid()))
  );

drop policy if exists comments_insert on public.task_comments;
create policy comments_insert on public.task_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      public.is_admin()
      or (public.is_active_user()
          and exists (select 1 from public.tasks t where t.id = task_id and t.assigned_to = auth.uid()))
    )
  );

-- Sem policy de update/delete já nega; o revoke garante mesmo se alguém criar uma policy por engano.
revoke update, delete on public.task_comments from anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 4. seller_reminders: lembretes do gestor
-- ═════════════════════════════════════════════════════════════════════════
create table if not exists public.seller_reminders (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (length(trim(message)) > 0),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists seller_reminders_seller_idx on public.seller_reminders(seller_id, active, created_at desc);

drop trigger if exists seller_reminders_touch on public.seller_reminders;
create trigger seller_reminders_touch before update on public.seller_reminders
  for each row execute function public.touch_updated_at();

alter table public.seller_reminders enable row level security;
revoke all on public.seller_reminders from anon;

drop policy if exists reminders_admin_all on public.seller_reminders;
create policy reminders_admin_all on public.seller_reminders for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists reminders_vendedor_select on public.seller_reminders;
create policy reminders_vendedor_select on public.seller_reminders for select to authenticated
  using (seller_id = auth.uid() and active and public.is_active_user());

-- ═════════════════════════════════════════════════════════════════════════
-- 5. sales_numbers: números vindos da planilha (só a service role escreve)
-- ═════════════════════════════════════════════════════════════════════════
create table if not exists public.sales_numbers (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references public.profiles(id) on delete set null,
  seller_label text not null,
  period text not null,
  metrics jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);
create unique index if not exists sales_numbers_label_period_uq on public.sales_numbers(seller_label, period);
create index if not exists sales_numbers_seller_idx on public.sales_numbers(seller_id, period desc);

alter table public.sales_numbers enable row level security;
revoke all on public.sales_numbers from anon;
revoke insert, update, delete, truncate on public.sales_numbers from authenticated;

drop policy if exists sales_admin_select on public.sales_numbers;
create policy sales_admin_select on public.sales_numbers for select to authenticated
  using (public.is_admin());

drop policy if exists sales_vendedor_select on public.sales_numbers;
create policy sales_vendedor_select on public.sales_numbers for select to authenticated
  using (seller_id = auth.uid() and public.is_active_user());

notify pgrst, 'reload schema';

commit;

notify pgrst, 'reload schema';
