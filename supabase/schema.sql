-- Central Comercial ECNC — schema Supabase
-- Execute no SQL Editor do Supabase.

create extension if not exists "pgcrypto";

-- ───────── Tabelas ─────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null default 'vendedor' check (role in ('admin','vendedor')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tasks (
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
create index tasks_assigned_idx on public.tasks(assigned_to, status);
create index tasks_due_idx on public.tasks(due_date);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments(task_id, created_at);

create table public.machines (
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

create table public.machine_media (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  type text not null check (type in ('foto','video','pdf','video_teste','link')),
  title text not null,
  url text not null,
  sort_order int not null default 0
);
create index machine_media_machine_idx on public.machine_media(machine_id, sort_order);

create table public.manuals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  description text,
  drive_url text not null,
  tags text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────── Funções auxiliares ─────────
create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- Vendedor só pode alterar o status das próprias tarefas (e não pode cancelar)
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
create trigger tasks_guard before update on public.tasks
  for each row execute function public.tasks_guard_vendedor();

-- ───────── RLS ─────────
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.machines enable row level security;
alter table public.machine_media enable row level security;
alter table public.manuals enable row level security;

-- profiles: todos autenticados leem (nomes dos autores); só admin escreve
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_admin_write on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- tasks
create policy tasks_admin_all on public.tasks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy tasks_vendedor_select on public.tasks for select to authenticated
  using (assigned_to = auth.uid());
create policy tasks_vendedor_update on public.tasks for update to authenticated
  using (assigned_to = auth.uid()) with check (assigned_to = auth.uid());

-- comentários: imutáveis (sem update/delete); insert só em tarefas acessíveis
create policy comments_select on public.task_comments for select to authenticated
  using (public.is_admin() or exists (select 1 from public.tasks t where t.id = task_id and t.assigned_to = auth.uid()));
create policy comments_insert on public.task_comments for insert to authenticated
  with check (author_id = auth.uid() and (public.is_admin() or exists (select 1 from public.tasks t where t.id = task_id and t.assigned_to = auth.uid())));

-- catálogo e manuais: leitura para todos (ativos), escrita só admin
create policy machines_read on public.machines for select to authenticated using (active or public.is_admin());
create policy machines_admin on public.machines for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy media_read on public.machine_media for select to authenticated
  using (exists (select 1 from public.machines m where m.id = machine_id and (m.active or public.is_admin())));
create policy media_admin on public.machine_media for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy manuals_read on public.manuals for select to authenticated using (active or public.is_admin());
create policy manuals_admin on public.manuals for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ───────── Primeiro admin ─────────
-- 1) Crie o usuário em Authentication > Users (email + senha, "Auto Confirm").
-- 2) Execute (troque o email):
-- insert into public.profiles (id, full_name, email, role)
-- select id, 'Administrador', email, 'admin' from auth.users where email = 'SEU_EMAIL';
