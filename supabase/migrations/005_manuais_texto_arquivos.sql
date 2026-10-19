-- Manuais: tipos link / texto / tabela_preco, arquivos da tabela de preços (bucket privado "manuais").
-- Idempotente. Requer as migrações 001 e 003 (is_admin, is_active_user). Execute inteira no SQL Editor do Supabase.

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. manuals: tipo, texto, vigência e updated_at
-- ═════════════════════════════════════════════════════════════════════════
alter table public.manuals add column if not exists kind text not null default 'link';
alter table public.manuals add column if not exists content text;
alter table public.manuals add column if not exists valid_from date;
alter table public.manuals add column if not exists updated_at timestamptz not null default now();

-- texto e tabela de preços não têm link
alter table public.manuals alter column drive_url drop not null;

alter table public.manuals drop constraint if exists manuals_kind_check;
alter table public.manuals add constraint manuals_kind_check
  check (kind in ('link', 'texto', 'tabela_preco'));

alter table public.manuals drop constraint if exists manuals_kind_consistency;
alter table public.manuals add constraint manuals_kind_consistency check (
  (kind = 'link' and drive_url is not null and length(btrim(drive_url)) > 0)
  or (kind = 'texto' and content is not null and length(btrim(content)) > 0)
  or (kind = 'tabela_preco' and valid_from is not null) -- os arquivos ficam em manual_files
);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists manuals_touch on public.manuals;
create trigger manuals_touch before update on public.manuals
  for each row execute function public.touch_updated_at();

-- ═════════════════════════════════════════════════════════════════════════
-- 2. manual_files: arquivos das tabelas de preço
-- ═════════════════════════════════════════════════════════════════════════
create table if not exists public.manual_files (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null references public.manuals(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,               -- nome original: só para exibir e baixar
  mime_type text not null check (mime_type in (
    'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel', 'text/csv'
  )),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists manual_files_manual_idx on public.manual_files(manual_id, sort_order);

-- No máximo 10 arquivos por manual
create or replace function public.manual_files_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.manual_files where manual_id = new.manual_id) >= 10 then
    raise exception 'Máximo de 10 arquivos por manual';
  end if;
  return new;
end;
$$;

drop trigger if exists manual_files_limit_trg on public.manual_files;
create trigger manual_files_limit_trg before insert on public.manual_files
  for each row execute function public.manual_files_limit();

alter table public.manual_files enable row level security;
revoke all on public.manual_files from anon;

-- admin faz tudo; vendedor ativo lê só arquivos de manual ativo; ninguém mais lê; vendedor não escreve
drop policy if exists manual_files_admin on public.manual_files;
create policy manual_files_admin on public.manual_files for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists manual_files_vendedor_select on public.manual_files;
create policy manual_files_vendedor_select on public.manual_files for select to authenticated
  using (
    public.is_active_user()
    and exists (select 1 from public.manuals m where m.id = manual_id and m.active)
  );

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Storage: bucket privado "manuais"
-- ═════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'manuais', 'manuais', false, 10485760,
  array[
    'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel', 'text/csv'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Vendedor ativo lê o objeto só se ele pertencer a um manual ativo (security definer: não depende do RLS de manual_files)
create or replace function public.manual_file_readable(p_path text) returns boolean
language sql security definer set search_path = public stable as $$
  select public.is_active_user()
    and exists (
      select 1
      from public.manual_files f
      join public.manuals m on m.id = f.manual_id
      where f.storage_path = p_path and m.active
    );
$$;

revoke all on function public.manual_file_readable(text) from public, anon;
grant execute on function public.manual_file_readable(text) to authenticated;

drop policy if exists manuais_select on storage.objects;
create policy manuais_select on storage.objects for select to authenticated
  using (bucket_id = 'manuais' and (public.is_admin() or public.manual_file_readable(name)));

drop policy if exists manuais_insert on storage.objects;
create policy manuais_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'manuais' and public.is_admin());

drop policy if exists manuais_update on storage.objects;
create policy manuais_update on storage.objects for update to authenticated
  using (bucket_id = 'manuais' and public.is_admin())
  with check (bucket_id = 'manuais' and public.is_admin());

drop policy if exists manuais_delete on storage.objects;
create policy manuais_delete on storage.objects for delete to authenticated
  using (bucket_id = 'manuais' and public.is_admin());

notify pgrst, 'reload schema';

commit;

notify pgrst, 'reload schema';
