-- Migração idempotente: deixa o banco compatível com o código da Central Comercial ECNC.
-- Segura para rodar em banco vazio (após ou em vez do schema.sql) ou em banco já existente.
-- Execute inteira no SQL Editor do Supabase.

begin;

create extension if not exists "pgcrypto";

-- ───────── 1. profiles ─────────
-- Código: insert { id, full_name, email, role } (service role); update { active };
--         select id, full_name, role, active, email, created_at (+ "*").
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade
);

alter table public.profiles add column if not exists full_name  text;
alter table public.profiles add column if not exists email      text;
alter table public.profiles add column if not exists role       text;
alter table public.profiles add column if not exists active     boolean;
alter table public.profiles add column if not exists created_at timestamptz;

-- Backfill de linhas legadas antes de aplicar NOT NULL
update public.profiles p set email = u.email
  from auth.users u where u.id = p.id and p.email is null;
update public.profiles set full_name  = coalesce(nullif(trim(full_name), ''), split_part(email, '@', 1), 'Sem nome') where full_name is null or trim(full_name) = '';
update public.profiles set role       = 'vendedor' where role is null or role not in ('admin','vendedor');
update public.profiles set active     = true       where active is null;
update public.profiles set created_at = now()      where created_at is null;

alter table public.profiles alter column full_name  set not null;
alter table public.profiles alter column email      set not null;
alter table public.profiles alter column role       set not null;
alter table public.profiles alter column role       set default 'vendedor';
alter table public.profiles alter column active     set not null;
alter table public.profiles alter column active     set default true;
alter table public.profiles alter column created_at set not null;
alter table public.profiles alter column created_at set default now();

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add  constraint profiles_role_check check (role in ('admin','vendedor'));

-- FK id -> auth.users (necessária para o createUser: auth primeiro, profile depois)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- O código insere o profile manualmente em createUser(). Um trigger que também o crie
-- (template padrão do Supabase) causaria "duplicate key" e o rollback apagaria o usuário.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- ───────── 2. Demais tabelas (criação se faltarem) ─────────
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text,
  priority text not null default 'media' check (priority in ('baixa','media','alta')),
  status text not null default 'pendente' check (status in ('pendente','em_andamento','concluida','cancelada')),
  assigned_to uuid not null references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  due_date timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_assigned_idx on public.tasks(assigned_to, status);
create index if not exists tasks_due_idx on public.tasks(due_date);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task_idx on public.task_comments(task_id, created_at);

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  category text not null check (category in ('CO2','Fiber','UV','Solda Laser')),
  tagline text,
  description text,
  specs jsonb not null default '[]'::jsonb,
  thumbnail_url text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.machine_media (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  type text not null check (type in ('foto','video','pdf','video_teste','link')),
  title text not null,
  url text not null,
  sort_order int not null default 0
);
create index if not exists machine_media_machine_idx on public.machine_media(machine_id, sort_order);

create table if not exists public.manuals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  description text,
  drive_url text not null,
  tags text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────── 3. Nomes de FK usados nos embeds do PostgREST (lib/queries.ts) ─────────
-- tasks!tasks_assigned_to_fkey e task_comments!task_comments_author_id_fkey
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass
      and ((c.conrelid = 'public.tasks'::regclass and a.attname = 'assigned_to' and c.conname <> 'tasks_assigned_to_fkey')
        or (c.conrelid = 'public.task_comments'::regclass and a.attname = 'author_id' and c.conname <> 'task_comments_author_id_fkey'))
  loop
    execute format('alter table %s rename constraint %I to %I', r.tbl, r.conname,
      case r.col when 'assigned_to' then 'tasks_assigned_to_fkey' else 'task_comments_author_id_fkey' end);
  end loop;
end $$;

-- ───────── 4. Funções e triggers ─────────
create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

create or replace function public.tasks_guard_vendedor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if new.title is distinct from old.title or new.description is distinct from old.description
     or new.category is distinct from old.category or new.priority is distinct from old.priority
     or new.assigned_to is distinct from old.assigned_to or new.created_by is distinct from old.created_by
     or new.due_date is distinct from old.due_date then
    raise exception 'Vendedor só pode alterar o status da tarefa';
  end if;
  if new.status = 'cancelada' then
    raise exception 'Vendedor não pode cancelar tarefas';
  end if;
  return new;
end; $$;
drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before update on public.tasks
  for each row execute function public.tasks_guard_vendedor();

-- ───────── 5. RLS: recria todas as policies para eliminar divergências ─────────
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles','tasks','task_comments','machines','machine_media','manuals')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.profiles      enable row level security;
alter table public.tasks         enable row level security;
alter table public.task_comments enable row level security;
alter table public.machines      enable row level security;
alter table public.machine_media enable row level security;
alter table public.manuals       enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_admin_write on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy tasks_admin_all on public.tasks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy tasks_vendedor_select on public.tasks for select to authenticated
  using (assigned_to = auth.uid());
create policy tasks_vendedor_update on public.tasks for update to authenticated
  using (assigned_to = auth.uid()) with check (assigned_to = auth.uid());

create policy comments_select on public.task_comments for select to authenticated
  using (public.is_admin() or exists (select 1 from public.tasks t where t.id = task_id and t.assigned_to = auth.uid()));
create policy comments_insert on public.task_comments for insert to authenticated
  with check (author_id = auth.uid() and (public.is_admin() or exists (select 1 from public.tasks t where t.id = task_id and t.assigned_to = auth.uid())));

create policy machines_read on public.machines for select to authenticated using (active or public.is_admin());
create policy machines_admin on public.machines for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy media_read on public.machine_media for select to authenticated
  using (exists (select 1 from public.machines m where m.id = machine_id and (m.active or public.is_admin())));
create policy media_admin on public.machine_media for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy manuals_read on public.manuals for select to authenticated using (active or public.is_admin());
create policy manuals_admin on public.manuals for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Garante que o PostgREST enxergue as mudanças de schema imediatamente
notify pgrst, 'reload schema';

commit;
