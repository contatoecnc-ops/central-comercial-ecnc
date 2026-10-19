-- Fase C: prioridade nos conteúdos e solicitações de material (vendedor → admin → marketing).
-- Idempotente. Requer as migrações 001 a 007. Execute inteira no SQL Editor do Supabase.
--
-- Decisão sobre as referências do vendedor: elas NÃO são copiadas entre buckets. Ficam no bucket
-- privado "solicitacoes" e o conteúdo criado as referencia (content_files.bucket = 'solicitacoes').
-- O marketing lê só os objetos registrados num conteúdo (nunca lista o bucket nem lê content_requests).

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Prioridade e origem nos conteúdos
-- ═════════════════════════════════════════════════════════════════════════
alter table public.content_items add column if not exists priority text not null default 'media';
alter table public.content_items drop constraint if exists content_items_priority_check;
alter table public.content_items add constraint content_items_priority_check
  check (priority in ('minima', 'media', 'urgente'));

-- brief: texto do pedido (vem da solicitação aprovada); source_label: "Solicitação de <vendedor>"
alter table public.content_items add column if not exists brief text;
alter table public.content_items add column if not exists source_label text;

create index if not exists content_items_priority_idx on public.content_items(priority);

-- referências copiadas da solicitação ficam no bucket "solicitacoes"
alter table public.content_files add column if not exists bucket text not null default 'marketing';
alter table public.content_files drop constraint if exists content_files_bucket_check;
alter table public.content_files add constraint content_files_bucket_check
  check (bucket in ('marketing', 'solicitacoes'));

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Triggers de content_items (007 revisada): priority livre em qualquer status
-- ═════════════════════════════════════════════════════════════════════════
create or replace function public.content_items_guard_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- service role / SQL Editor
  if not public.is_staff() then raise exception 'Sem permissão'; end if;
  if new.status <> 'ideia' then raise exception 'Todo conteúdo nasce como ideia'; end if;
  if not public.content_assignee_ok(new.assigned_to) then
    raise exception 'O responsável deve ser admin ou marketing ativo';
  end if;
  -- a origem "solicitação" só é gravada por approve_request
  if coalesce(current_setting('app.request_decision', true), '') <> '1' then
    new.source_label := null;
  end if;
  new.created_by := auth.uid();
  new.approved_by := null;
  new.approved_at := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end; $$;

create or replace function public.content_items_guard_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.auth_role();
  v_comment text := coalesce(nullif(current_setting('app.content_comment', true), ''), '');
  v_ok boolean := false;
  v_content_changed boolean;
begin
  if auth.uid() is null then return new; end if; -- service role / SQL Editor
  if v_role is null or v_role not in ('admin', 'marketing') then raise exception 'Sem permissão'; end if;

  if new.id is distinct from old.id or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at or new.source_label is distinct from old.source_label then
    raise exception 'Identificador, autoria e origem do conteúdo não podem ser alterados';
  end if;
  if new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at then
    raise exception 'A aprovação só muda por mudança de status';
  end if;
  if new.assigned_to is distinct from old.assigned_to and not public.content_assignee_ok(new.assigned_to) then
    raise exception 'O responsável deve ser admin ou marketing ativo';
  end if;

  new.updated_at := now();

  -- "conteúdo" = tudo menos status, scheduled_for e priority (metadados que seguem livres)
  v_content_changed :=
       new.title is distinct from old.title or new.caption is distinct from old.caption
    or new.channels is distinct from old.channels or new.format is distinct from old.format
    or new.machine_id is distinct from old.machine_id or new.campaign is distinct from old.campaign
    or new.assigned_to is distinct from old.assigned_to or new.brief is distinct from old.brief;

  if old.status in ('aprovado', 'publicado') and v_content_changed then
    raise exception 'Conteúdo aprovado ou publicado está travado: reabra para editar';
  end if;

  if new.status is not distinct from old.status then
    return new;
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

-- Arquivos: referências vindas de solicitação (bucket "solicitacoes") só entram por approve_request
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
    if new.bucket = 'solicitacoes' then
      if coalesce(current_setting('app.request_decision', true), '') <> '1' then
        raise exception 'Origem de arquivo inválida';
      end if;
    elsif new.storage_path is not null and new.storage_path not like new.content_id::text || '/%' then
      raise exception 'Caminho de arquivo inválido';
    end if;
    new.uploaded_by := coalesce(new.uploaded_by, auth.uid());
    if coalesce(current_setting('app.request_decision', true), '') <> '1' then
      new.uploaded_by := auth.uid();
    end if;
    new.created_at := now();
  end if;

  if new.version is null or new.version < 1 or new.version > v_max + 1 then
    new.version := v_max + 1;
  end if;
  return new;
end; $$;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Solicitações
-- ═════════════════════════════════════════════════════════════════════════
create table if not exists public.content_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id),
  title text not null check (length(btrim(title)) > 0 and length(title) <= 140),
  description text not null check (length(btrim(description)) > 0 and length(description) <= 4000),
  request_type text not null,             -- validado pela aplicação (lib/marketing-config.ts)
  machine_id uuid references public.machines(id) on delete set null,
  desired_by date,
  priority text not null default 'media' check (priority in ('minima', 'media', 'urgente')),
  status text not null default 'nova' check (status in ('nova', 'aprovada', 'recusada', 'cancelada')),
  decision_note text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  content_id uuid references public.content_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_requests_status_idx on public.content_requests(status);
create index if not exists content_requests_requester_idx on public.content_requests(requested_by);
create index if not exists content_requests_created_idx on public.content_requests(created_at desc);

create table if not exists public.request_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.content_requests(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);

create index if not exists request_files_request_idx on public.request_files(request_id);

create table if not exists public.request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.content_requests(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(btrim(body)) > 0 and length(body) <= 4000),
  created_at timestamptz not null default now()
);

create index if not exists request_comments_request_idx on public.request_comments(request_id, created_at);

-- Insert: só vendedor, sempre como "nova", em nome próprio
create or replace function public.content_requests_guard_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if public.auth_role() is distinct from 'vendedor' then raise exception 'Apenas vendedores criam solicitações'; end if;
  if new.requested_by is distinct from auth.uid() then raise exception 'Solicitação só pode ser criada em nome próprio'; end if;
  new.status := 'nova';
  new.decision_note := null;
  new.decided_by := null;
  new.decided_at := null;
  new.content_id := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists content_requests_guard_insert on public.content_requests;
create trigger content_requests_guard_insert before insert on public.content_requests
  for each row execute function public.content_requests_guard_insert();

-- Update: máquina de estados. Decisão e cancelamento só pelas funções abaixo (flag da transação).
create or replace function public.content_requests_guard_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.auth_role();
  v_flag text := coalesce(current_setting('app.request_decision', true), '');
begin
  if auth.uid() is null then return new; end if;
  if v_role is null then raise exception 'Sem permissão'; end if;

  if new.id is distinct from old.id or new.requested_by is distinct from old.requested_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Identificação da solicitação não pode ser alterada';
  end if;

  new.updated_at := now();

  if new.status is distinct from old.status then
    if old.status <> 'nova' then raise exception 'Solicitação já encerrada'; end if;
    if v_flag <> '1' then raise exception 'Use as ações de aprovar, recusar ou cancelar'; end if;
    return new; -- a função que ligou a flag já validou o papel e os campos
  end if;

  -- sem mudança de status: só o dono edita, e só enquanto "nova"
  if old.status <> 'nova' then raise exception 'Solicitação encerrada: não pode mais ser editada'; end if;
  if v_role <> 'vendedor' or old.requested_by <> auth.uid() then raise exception 'Sem permissão'; end if;
  if new.decision_note is distinct from old.decision_note or new.decided_by is distinct from old.decided_by
     or new.decided_at is distinct from old.decided_at or new.content_id is distinct from old.content_id then
    raise exception 'Campos de decisão não podem ser alterados';
  end if;
  return new;
end; $$;

drop trigger if exists content_requests_guard_update on public.content_requests;
create trigger content_requests_guard_update before update on public.content_requests
  for each row execute function public.content_requests_guard_update();

-- Arquivos da solicitação: dono, enquanto "nova", até 5, na pasta da própria solicitação
create or replace function public.request_files_guard_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.content_requests;
begin
  if auth.uid() is null then return new; end if;
  select * into r from public.content_requests where id = new.request_id;
  if r.id is null or r.requested_by <> auth.uid() or public.auth_role() is distinct from 'vendedor' then
    raise exception 'Sem permissão';
  end if;
  if r.status <> 'nova' then raise exception 'Solicitação encerrada: não aceita novos anexos'; end if;
  if new.storage_path not like new.request_id::text || '/%' then raise exception 'Caminho de arquivo inválido'; end if;
  if (select count(*) from public.request_files where request_id = new.request_id) >= 5 then
    raise exception 'Máximo de 5 arquivos por solicitação';
  end if;
  new.created_at := now();
  return new;
end; $$;

drop trigger if exists request_files_guard_insert on public.request_files;
create trigger request_files_guard_insert before insert on public.request_files
  for each row execute function public.request_files_guard_insert();

-- ═════════════════════════════════════════════════════════════════════════
-- 4. Funções de decisão (security definer; exigem o papel dentro da própria função)
-- ═════════════════════════════════════════════════════════════════════════
create or replace function public.approve_request(
  p_request_id uuid, p_title text, p_description text, p_priority text,
  p_assigned_to uuid, p_scheduled_for timestamptz, p_note text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r public.content_requests;
  v_content uuid := gen_random_uuid();
  v_name text;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if public.auth_role() is distinct from 'admin' then raise exception 'Apenas o admin aprova solicitações'; end if;
  if p_priority not in ('minima', 'media', 'urgente') then raise exception 'Prioridade inválida'; end if;
  if v_title is null or length(v_title) > 200 then raise exception 'Informe o título'; end if;
  if v_desc is null or length(v_desc) > 4000 then raise exception 'Informe a descrição'; end if;
  if not public.content_assignee_ok(p_assigned_to) then raise exception 'O responsável deve ser admin ou marketing ativo'; end if;

  select * into r from public.content_requests where id = p_request_id for update;
  if r.id is null then raise exception 'Solicitação não encontrada'; end if;
  if r.status <> 'nova' then raise exception 'Solicitação já decidida'; end if;

  select full_name into v_name from public.profiles where id = r.requested_by;

  perform set_config('app.request_decision', '1', true);

  insert into public.content_items
    (id, title, channels, priority, assigned_to, created_by, machine_id, scheduled_for, brief, source_label, status)
  values
    (v_content, v_title, '{}', p_priority, p_assigned_to, auth.uid(), r.machine_id, p_scheduled_for, v_desc,
     'Solicitação de ' || coalesce(v_name, 'vendedor'), 'ideia');

  -- referências do vendedor: o conteúdo aponta para os objetos do bucket "solicitacoes"
  insert into public.content_files
    (content_id, bucket, storage_path, file_name, mime_type, size_bytes, kind, version, uploaded_by)
  select v_content, 'solicitacoes', f.storage_path, f.file_name, f.mime_type, f.size_bytes, 'referencia', 1, r.requested_by
  from public.request_files f where f.request_id = r.id;

  update public.content_requests
     set status = 'aprovada', decided_by = auth.uid(), decided_at = now(),
         content_id = v_content, decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = r.id;

  perform set_config('app.request_decision', '', true);
  return v_content;
end; $$;

create or replace function public.reject_request(p_request_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.content_requests;
begin
  if public.auth_role() is distinct from 'admin' then raise exception 'Apenas o admin recusa solicitações'; end if;
  if p_note is null or length(btrim(p_note)) = 0 then raise exception 'Informe o motivo da recusa'; end if;
  select * into r from public.content_requests where id = p_request_id for update;
  if r.id is null then raise exception 'Solicitação não encontrada'; end if;
  if r.status <> 'nova' then raise exception 'Solicitação já decidida'; end if;

  perform set_config('app.request_decision', '1', true);
  update public.content_requests
     set status = 'recusada', decided_by = auth.uid(), decided_at = now(), decision_note = btrim(p_note)
   where id = r.id;
  perform set_config('app.request_decision', '', true);
end; $$;

-- Cancelamento pelo dono: apaga os anexos (linhas) e devolve os caminhos para a aplicação apagar os objetos
create or replace function public.cancel_request(p_request_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  r public.content_requests;
  v_paths text[];
begin
  if public.auth_role() is distinct from 'vendedor' then raise exception 'Sem permissão'; end if;
  select * into r from public.content_requests where id = p_request_id for update;
  if r.id is null or r.requested_by <> auth.uid() then raise exception 'Solicitação não encontrada'; end if;
  if r.status <> 'nova' then raise exception 'Só é possível cancelar enquanto aguarda triagem'; end if;

  select coalesce(array_agg(storage_path), '{}') into v_paths from public.request_files where request_id = r.id;
  delete from public.request_files where request_id = r.id;

  perform set_config('app.request_decision', '1', true);
  update public.content_requests set status = 'cancelada' where id = r.id;
  perform set_config('app.request_decision', '', true);
  return v_paths;
end; $$;

-- Andamento simplificado das solicitações do próprio vendedor (sem abrir content_items)
create or replace function public.my_requests_progress()
returns table (request_id uuid, progress text, has_delivery boolean)
language sql security definer set search_path = public stable as $$
  select r.id,
         case r.status
           when 'nova' then 'Aguardando triagem'
           when 'recusada' then 'Recusada'
           when 'cancelada' then 'Cancelada'
           else case c.status
             when 'ideia' then 'Na fila do marketing'
             when 'em_producao' then 'Em produção'
             when 'ajustes' then 'Em produção'
             when 'em_aprovacao' then 'Em revisão'
             when 'aprovado' then 'Pronto'
             when 'publicado' then 'Entregue'
             when 'arquivado' then 'Encerrada'
             else 'Na fila do marketing'
           end
         end,
         coalesce(c.status in ('aprovado', 'publicado')
                  and exists (select 1 from public.content_files f where f.content_id = c.id and f.kind = 'final'), false)
  from public.content_requests r
  left join public.content_items c on c.id = r.content_id
  where r.requested_by = auth.uid() and public.auth_role() = 'vendedor';
$$;

revoke all on function public.approve_request(uuid, text, text, text, uuid, timestamptz, text) from public, anon;
revoke all on function public.reject_request(uuid, text) from public, anon;
revoke all on function public.cancel_request(uuid) from public, anon;
revoke all on function public.my_requests_progress() from public, anon;
grant execute on function public.approve_request(uuid, text, text, text, uuid, timestamptz, text) to authenticated;
grant execute on function public.reject_request(uuid, text) to authenticated;
grant execute on function public.cancel_request(uuid) to authenticated;
grant execute on function public.my_requests_progress() to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 5. RLS
-- ═════════════════════════════════════════════════════════════════════════
alter table public.content_requests enable row level security;
alter table public.request_files enable row level security;
alter table public.request_comments enable row level security;
revoke all on public.content_requests, public.request_files, public.request_comments from anon;
revoke delete, truncate on public.content_requests from authenticated;
revoke update, delete, truncate on public.request_comments from authenticated;
revoke update, truncate on public.request_files from authenticated;

-- dono (vendedor ativo) ou admin
create or replace function public.can_see_request(p_request_id uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.content_requests r
    where r.id = p_request_id
      and (public.auth_role() = 'admin' or (public.auth_role() = 'vendedor' and r.requested_by = auth.uid()))
  );
$$;
revoke all on function public.can_see_request(uuid) from public, anon;
grant execute on function public.can_see_request(uuid) to authenticated;

drop policy if exists requests_select on public.content_requests;
create policy requests_select on public.content_requests for select to authenticated
  using (public.auth_role() = 'admin' or (public.auth_role() = 'vendedor' and requested_by = auth.uid()));

drop policy if exists requests_insert on public.content_requests;
create policy requests_insert on public.content_requests for insert to authenticated
  with check (public.auth_role() = 'vendedor' and requested_by = auth.uid() and status = 'nova');

drop policy if exists requests_update on public.content_requests;
create policy requests_update on public.content_requests for update to authenticated
  using (public.auth_role() = 'vendedor' and requested_by = auth.uid() and status = 'nova')
  with check (public.auth_role() = 'vendedor' and requested_by = auth.uid());

drop policy if exists request_files_select on public.request_files;
create policy request_files_select on public.request_files for select to authenticated
  using (public.can_see_request(request_id));

drop policy if exists request_files_insert on public.request_files;
create policy request_files_insert on public.request_files for insert to authenticated
  with check (
    public.auth_role() = 'vendedor'
    and exists (select 1 from public.content_requests r
                where r.id = request_id and r.requested_by = auth.uid() and r.status = 'nova')
  );

drop policy if exists request_files_delete on public.request_files;
create policy request_files_delete on public.request_files for delete to authenticated
  using (
    public.auth_role() = 'vendedor'
    and exists (select 1 from public.content_requests r
                where r.id = request_id and r.requested_by = auth.uid() and r.status = 'nova')
  );

drop policy if exists request_comments_select on public.request_comments;
create policy request_comments_select on public.request_comments for select to authenticated
  using (public.can_see_request(request_id));

drop policy if exists request_comments_insert on public.request_comments;
create policy request_comments_insert on public.request_comments for insert to authenticated
  with check (author_id = auth.uid() and public.can_see_request(request_id));

-- ═════════════════════════════════════════════════════════════════════════
-- 6. Entrega ao vendedor: arquivos "final" de conteúdo aprovado/publicado da própria solicitação
-- ═════════════════════════════════════════════════════════════════════════
create or replace function public.vendor_can_read_delivery(p_content_id uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select public.auth_role() = 'vendedor' and exists (
    select 1
    from public.content_requests r
    join public.content_items c on c.id = r.content_id
    where r.content_id = p_content_id
      and r.requested_by = auth.uid()
      and r.status = 'aprovada'
      and c.status in ('aprovado', 'publicado')
  );
$$;
revoke all on function public.vendor_can_read_delivery(uuid) from public, anon;
grant execute on function public.vendor_can_read_delivery(uuid) to authenticated;

drop policy if exists content_files_vendor_final on public.content_files;
create policy content_files_vendor_final on public.content_files for select to authenticated
  using (kind = 'final' and bucket = 'marketing' and public.vendor_can_read_delivery(content_id));

create or replace function public.vendor_can_read_delivery_object(p_name text) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.content_files f
    where f.storage_path = p_name and f.bucket = 'marketing' and f.kind = 'final'
      and public.vendor_can_read_delivery(f.content_id)
  );
$$;
revoke all on function public.vendor_can_read_delivery_object(text) from public, anon;
grant execute on function public.vendor_can_read_delivery_object(text) to authenticated;

drop policy if exists marketing_vendor_delivery_select on storage.objects;
create policy marketing_vendor_delivery_select on storage.objects for select to authenticated
  using (bucket_id = 'marketing' and public.vendor_can_read_delivery_object(name));

-- ═════════════════════════════════════════════════════════════════════════
-- 7. Storage: bucket privado "solicitacoes" (10 MB)
-- ═════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'solicitacoes', 'solicitacoes', false, 10485760,
  array[
    'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- pasta {request_id}/ de uma solicitação do vendedor logado
create or replace function public.request_folder_owner(p_name text, p_only_new boolean) returns boolean
language sql security definer set search_path = public stable as $$
  select public.auth_role() = 'vendedor' and exists (
    select 1 from public.content_requests r
    where p_name like r.id::text || '/%'
      and r.requested_by = auth.uid()
      and (not p_only_new or r.status = 'nova')
  );
$$;
revoke all on function public.request_folder_owner(text, boolean) from public, anon;
grant execute on function public.request_folder_owner(text, boolean) to authenticated;

-- objeto de solicitação já usado como referência num conteúdo (o marketing lê só esses)
create or replace function public.request_object_in_content(p_name text) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.content_files where bucket = 'solicitacoes' and storage_path = p_name);
$$;
revoke all on function public.request_object_in_content(text) from public, anon;
grant execute on function public.request_object_in_content(text) to authenticated;

drop policy if exists solicitacoes_select on storage.objects;
create policy solicitacoes_select on storage.objects for select to authenticated
  using (
    bucket_id = 'solicitacoes'
    and (public.auth_role() = 'admin'
         or public.request_folder_owner(name, false)
         or (public.auth_role() = 'marketing' and public.request_object_in_content(name)))
  );

drop policy if exists solicitacoes_insert on storage.objects;
create policy solicitacoes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'solicitacoes' and public.request_folder_owner(name, true));

drop policy if exists solicitacoes_delete on storage.objects;
create policy solicitacoes_delete on storage.objects for delete to authenticated
  using (bucket_id = 'solicitacoes' and public.request_folder_owner(name, true));
-- (sem update: nada é sobrescrito; cancel_request apaga as linhas e a aplicação apaga os objetos pela service role)

notify pgrst, 'reload schema';

commit;

notify pgrst, 'reload schema';
