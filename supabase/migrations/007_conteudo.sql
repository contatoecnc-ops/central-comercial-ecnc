-- Central de conteúdo de marketing: pedidos/ideias, arquivos para aprovação, calendário.
-- Acesso só de admin e marketing (is_staff). Quem aprova é o admin.
-- Idempotente. Requer as migrações 001 a 006 (auth_role, is_staff). Execute inteira no SQL Editor do Supabase.

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Tabelas
-- ═════════════════════════════════════════════════════════════════════════
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  caption text,
  channels text[] not null default '{}',   -- validado pela aplicação (lib/marketing-config.ts)
  format text,                             -- idem
  machine_id uuid references public.machines(id) on delete set null,
  campaign text,
  status text not null default 'ideia'
    check (status in ('ideia', 'em_producao', 'em_aprovacao', 'ajustes', 'aprovado', 'publicado', 'arquivado')),
  scheduled_for timestamptz,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_items_status_idx on public.content_items(status);
create index if not exists content_items_scheduled_idx on public.content_items(scheduled_for);
create index if not exists content_items_assigned_idx on public.content_items(assigned_to);

create table if not exists public.content_files (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  storage_path text unique,
  external_url text check (external_url is null or external_url ~* '^https?://'),
  file_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or (size_bytes > 0 and size_bytes <= 52428800)),
  kind text not null check (kind in ('arte', 'video', 'referencia', 'roteiro', 'final')),
  version int not null check (version >= 1), -- definida pelo trigger (before insert)
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((storage_path is not null and external_url is null) or (storage_path is null and external_url is not null))
);

create index if not exists content_files_content_idx on public.content_files(content_id, version);

create table if not exists public.content_events (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('status_change', 'comment', 'file_added')),
  from_status text,
  to_status text,
  body text,
  created_at timestamptz not null default now()
);

create index if not exists content_events_content_idx on public.content_events(content_id, created_at);

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Triggers de content_items
-- ═════════════════════════════════════════════════════════════════════════
create or replace function public.content_assignee_ok(p_id uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select p_id is null or exists (
    select 1 from public.profiles where id = p_id and role in ('admin', 'marketing') and active
  );
$$;

-- Insert pelo cliente: nasce como ideia, sem aprovação, com autoria do usuário logado
create or replace function public.content_items_guard_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- service role / SQL Editor
  if not public.is_staff() then raise exception 'Sem permissão'; end if;
  if new.status <> 'ideia' then raise exception 'Todo conteúdo nasce como ideia'; end if;
  if not public.content_assignee_ok(new.assigned_to) then
    raise exception 'O responsável deve ser admin ou marketing ativo';
  end if;
  new.created_by := auth.uid();
  new.approved_by := null;
  new.approved_at := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists content_items_guard_insert on public.content_items;
create trigger content_items_guard_insert before insert on public.content_items
  for each row execute function public.content_items_guard_insert();

-- Update: máquina de estados, travas e campos controlados pelo servidor
create or replace function public.content_items_guard_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.auth_role();
  v_comment text := coalesce(nullif(current_setting('app.content_comment', true), ''), '');
  v_ok boolean := false;
begin
  if auth.uid() is null then return new; end if; -- service role / SQL Editor
  if v_role is null or v_role not in ('admin', 'marketing') then raise exception 'Sem permissão'; end if;

  if new.id is distinct from old.id or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Identificador e autoria do conteúdo não podem ser alterados';
  end if;
  if new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at then
    raise exception 'A aprovação só muda por mudança de status';
  end if;
  if new.assigned_to is distinct from old.assigned_to and not public.content_assignee_ok(new.assigned_to) then
    raise exception 'O responsável deve ser admin ou marketing ativo';
  end if;

  new.updated_at := now();

  if new.status is not distinct from old.status then
    -- aprovado e publicado: só scheduled_for muda
    if old.status in ('aprovado', 'publicado') and (
         new.title is distinct from old.title or new.caption is distinct from old.caption
         or new.channels is distinct from old.channels or new.format is distinct from old.format
         or new.machine_id is distinct from old.machine_id or new.campaign is distinct from old.campaign
         or new.assigned_to is distinct from old.assigned_to) then
      raise exception 'Conteúdo aprovado ou publicado está travado: reabra para editar';
    end if;
    return new;
  end if;

  -- mudança de status: nada além de scheduled_for pode mudar junto em aprovado/publicado
  if old.status in ('aprovado', 'publicado') and (
       new.title is distinct from old.title or new.caption is distinct from old.caption
       or new.channels is distinct from old.channels or new.format is distinct from old.format
       or new.machine_id is distinct from old.machine_id or new.campaign is distinct from old.campaign
       or new.assigned_to is distinct from old.assigned_to) then
    raise exception 'Conteúdo aprovado ou publicado está travado: reabra para editar';
  end if;

  if old.status = 'ideia' and new.status = 'em_producao' then
    v_ok := true;
  elsif old.status = 'em_producao' and new.status = 'em_aprovacao' then
    v_ok := true;
  elsif old.status = 'em_aprovacao' and new.status = 'aprovado' then
    if v_role <> 'admin' then raise exception 'Só o admin aprova conteúdo'; end if;
    new.approved_by := auth.uid();
    new.approved_at := now();
    v_ok := true;
  elsif old.status = 'em_aprovacao' and new.status = 'ajustes' then
    if v_role <> 'admin' then raise exception 'Só o admin pede ajustes'; end if;
    if length(btrim(v_comment)) = 0 then raise exception 'Informe o comentário dos ajustes'; end if;
    v_ok := true;
  elsif old.status = 'em_aprovacao' and new.status = 'em_producao' then
    v_ok := true;
  elsif old.status = 'ajustes' and new.status in ('em_producao', 'em_aprovacao') then
    v_ok := true;
  elsif old.status = 'aprovado' and new.status = 'publicado' then
    v_ok := true;
  elsif old.status = 'aprovado' and new.status = 'em_producao' then
    new.approved_by := null;
    new.approved_at := null;
    v_ok := true;
  elsif new.status = 'arquivado' and old.status <> 'arquivado' then
    v_ok := true;
  elsif old.status = 'arquivado' and new.status = 'ideia' then
    v_ok := true;
  end if;

  if not v_ok then
    raise exception 'Transição de status não permitida: % → %', old.status, new.status;
  end if;

  if new.status = 'em_aprovacao'
     and not exists (select 1 from public.content_files where content_id = new.id) then
    raise exception 'Envie ao menos 1 arquivo ou link antes de pedir aprovação';
  end if;

  return new;
end; $$;

drop trigger if exists content_items_guard_update on public.content_items;
create trigger content_items_guard_update before update on public.content_items
  for each row execute function public.content_items_guard_update();

-- Evento de status gravado por trigger (o cliente nunca grava status_change)
create or replace function public.content_items_log_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_comment text := nullif(btrim(coalesce(current_setting('app.content_comment', true), '')), '');
begin
  if new.status is distinct from old.status then
    insert into public.content_events (content_id, actor_id, event_type, from_status, to_status, body)
    values (new.id, auth.uid(), 'status_change', old.status, new.status, v_comment);
    perform set_config('app.content_comment', '', true);
  end if;
  return null;
end; $$;

drop trigger if exists content_items_log_status on public.content_items;
create trigger content_items_log_status after update on public.content_items
  for each row execute function public.content_items_log_status();

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Triggers de content_files
-- ═════════════════════════════════════════════════════════════════════════
create or replace function public.content_files_guard_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_max int;
begin
  select status into v_status from public.content_items where id = new.content_id;
  if v_status is null then raise exception 'Conteúdo não encontrado'; end if;
  select coalesce(max(version), 0) into v_max from public.content_files where content_id = new.content_id;

  if auth.uid() is not null then
    if v_status not in ('ideia', 'em_producao', 'ajustes') then
      raise exception 'Arquivos só podem ser adicionados em ideia, produção ou ajustes';
    end if;
    if new.storage_path is not null and new.storage_path not like new.content_id::text || '/%' then
      raise exception 'Caminho de arquivo inválido';
    end if;
    new.uploaded_by := auth.uid();
    new.created_at := now();
  end if;

  -- a versão sobe sozinha: sem valor = próxima; um lote usa a mesma versão (no máximo a seguinte)
  if new.version is null or new.version < 1 or new.version > v_max + 1 then
    new.version := v_max + 1;
  end if;
  return new;
end; $$;

drop trigger if exists content_files_guard_insert on public.content_files;
create trigger content_files_guard_insert before insert on public.content_files
  for each row execute function public.content_files_guard_insert();

create or replace function public.content_files_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.content_events (content_id, actor_id, event_type, body)
  values (new.content_id, auth.uid(), 'file_added', new.kind || ' v' || new.version);
  return null;
end; $$;

drop trigger if exists content_files_log on public.content_files;
create trigger content_files_log after insert on public.content_files
  for each row execute function public.content_files_log();

-- ═════════════════════════════════════════════════════════════════════════
-- 4. RLS
-- ═════════════════════════════════════════════════════════════════════════
alter table public.content_items enable row level security;
alter table public.content_files enable row level security;
alter table public.content_events enable row level security;
revoke all on public.content_items, public.content_files, public.content_events from anon;
revoke update, delete, truncate on public.content_events from authenticated;
revoke update, truncate on public.content_files from authenticated;

-- content_items
drop policy if exists content_items_select on public.content_items;
create policy content_items_select on public.content_items for select to authenticated
  using (public.is_staff());

drop policy if exists content_items_insert on public.content_items;
create policy content_items_insert on public.content_items for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid() and status = 'ideia');

drop policy if exists content_items_update on public.content_items;
create policy content_items_update on public.content_items for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- admin apaga qualquer um; marketing só ideia/arquivado criado por ele
drop policy if exists content_items_delete on public.content_items;
create policy content_items_delete on public.content_items for delete to authenticated
  using (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'marketing' and created_by = auth.uid() and status in ('ideia', 'arquivado'))
  );

-- content_files: staff lê e adiciona; só o admin apaga (e não em aprovado/publicado)
drop policy if exists content_files_select on public.content_files;
create policy content_files_select on public.content_files for select to authenticated
  using (public.is_staff());

drop policy if exists content_files_insert on public.content_files;
create policy content_files_insert on public.content_files for insert to authenticated
  with check (public.is_staff() and uploaded_by = auth.uid());

drop policy if exists content_files_delete on public.content_files;
create policy content_files_delete on public.content_files for delete to authenticated
  using (
    public.auth_role() = 'admin'
    and exists (select 1 from public.content_items c
                where c.id = content_id and c.status not in ('aprovado', 'publicado'))
  );

-- content_events: imutável; o cliente só insere comentário próprio
drop policy if exists content_events_select on public.content_events;
create policy content_events_select on public.content_events for select to authenticated
  using (public.is_staff());

drop policy if exists content_events_insert on public.content_events;
create policy content_events_insert on public.content_events for insert to authenticated
  with check (
    public.is_staff()
    and event_type = 'comment'
    and actor_id = auth.uid()
    and from_status is null and to_status is null
    and body is not null and length(btrim(body)) > 0
  );

-- ═════════════════════════════════════════════════════════════════════════
-- 5. Funções de status (security invoker: rodam com o RLS do usuário, como complete_task)
-- ═════════════════════════════════════════════════════════════════════════
create or replace function public.set_content_status(p_content_id uuid, p_to text, p_comment text default null)
returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_updated int;
begin
  perform set_config('app.content_comment', coalesce(btrim(p_comment), ''), true);
  update public.content_items set status = p_to where id = p_content_id;
  get diagnostics v_updated = row_count;
  perform set_config('app.content_comment', '', true);
  if v_updated = 0 then
    raise exception 'Conteúdo não encontrado ou sem permissão';
  end if;
end; $$;

create or replace function public.approve_content(p_content_id uuid, p_comment text default null)
returns void
language plpgsql security invoker set search_path = public as $$
begin
  if (select status from public.content_items where id = p_content_id) is distinct from 'em_aprovacao' then
    raise exception 'O conteúdo não está aguardando aprovação';
  end if;
  perform public.set_content_status(p_content_id, 'aprovado', p_comment);
end; $$;

create or replace function public.request_changes(p_content_id uuid, p_comment text)
returns void
language plpgsql security invoker set search_path = public as $$
begin
  if p_comment is null or length(btrim(p_comment)) = 0 then
    raise exception 'Informe o comentário dos ajustes';
  end if;
  if (select status from public.content_items where id = p_content_id) is distinct from 'em_aprovacao' then
    raise exception 'O conteúdo não está aguardando aprovação';
  end if;
  perform public.set_content_status(p_content_id, 'ajustes', p_comment);
end; $$;

revoke all on function public.set_content_status(uuid, text, text) from public, anon;
revoke all on function public.approve_content(uuid, text) from public, anon;
revoke all on function public.request_changes(uuid, text) from public, anon;
grant execute on function public.set_content_status(uuid, text, text) to authenticated;
grant execute on function public.approve_content(uuid, text) to authenticated;
grant execute on function public.request_changes(uuid, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 6. Storage: bucket privado "marketing" (50 MB)
-- ═════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketing', 'marketing', false, 52428800,
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- objeto já registrado em content_files (não pode ser apagado direto pelo marketing)
create or replace function public.content_object_registered(p_name text) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.content_files where storage_path = p_name);
$$;

revoke all on function public.content_object_registered(text) from public, anon;
grant execute on function public.content_object_registered(text) to authenticated;

drop policy if exists marketing_select on storage.objects;
create policy marketing_select on storage.objects for select to authenticated
  using (bucket_id = 'marketing' and public.is_staff());

drop policy if exists marketing_insert on storage.objects;
create policy marketing_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'marketing' and public.is_staff());

-- sem update (nada é sobrescrito); delete: admin, ou staff em objeto ainda não registrado (limpeza de upload que falhou)
drop policy if exists marketing_update on storage.objects;

drop policy if exists marketing_delete on storage.objects;
create policy marketing_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'marketing'
    and (public.auth_role() = 'admin'
         or (public.auth_role() = 'marketing' and not public.content_object_registered(name)))
  );

notify pgrst, 'reload schema';

commit;

notify pgrst, 'reload schema';
