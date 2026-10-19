-- Papel "marketing": catálogo, fotos e manuais (exceto tabela de preços, que é só leitura para ele).
-- Idempotente. Requer as migrações 001 a 005. Execute inteira no SQL Editor do Supabase.

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Papel na constraint de profiles (descobre o nome real da constraint)
-- ═════════════════════════════════════════════════════════════════════════
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'vendedor', 'marketing'));

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Funções (security definer: não recursam no RLS de profiles)
-- ═════════════════════════════════════════════════════════════════════════
-- Papel do usuário atual; nulo se não houver sessão ou se o perfil estiver desativado.
create or replace function public.auth_role() returns text
language sql security definer set search_path = public stable as $$
  select role from public.profiles where id = auth.uid() and active;
$$;

create or replace function public.is_staff() returns boolean
language sql security definer set search_path = public stable as $$
  select coalesce(public.auth_role() in ('admin', 'marketing'), false);
$$;

revoke all on function public.auth_role() from public, anon;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.auth_role() to authenticated;
grant execute on function public.is_staff() to authenticated;

-- profiles_guard (003) segue valendo: quem não é admin/service role não altera role, active, email etc.
-- Perfil: leitura só de si mesmo ou por usuário ativo (desativado não enxerga ninguém).
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_active_user());

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Tarefas, comentários, lembretes e vendas: nunca para marketing
--    (as policies de vendedor passam a exigir o papel 'vendedor', não só "ativo")
-- ═════════════════════════════════════════════════════════════════════════
drop policy if exists tasks_vendedor_select on public.tasks;
create policy tasks_vendedor_select on public.tasks for select to authenticated
  using (assigned_to = auth.uid() and public.auth_role() = 'vendedor');

drop policy if exists tasks_vendedor_insert on public.tasks;
create policy tasks_vendedor_insert on public.tasks for insert to authenticated
  with check (assigned_to = auth.uid() and created_by = auth.uid() and public.auth_role() = 'vendedor');

drop policy if exists tasks_vendedor_update on public.tasks;
create policy tasks_vendedor_update on public.tasks for update to authenticated
  using (assigned_to = auth.uid() and public.auth_role() = 'vendedor')
  with check (assigned_to = auth.uid() and public.auth_role() = 'vendedor');

drop policy if exists comments_select on public.task_comments;
create policy comments_select on public.task_comments for select to authenticated
  using (
    public.is_admin()
    or (public.auth_role() = 'vendedor'
        and exists (select 1 from public.tasks t where t.id = task_id and t.assigned_to = auth.uid()))
  );

drop policy if exists comments_insert on public.task_comments;
create policy comments_insert on public.task_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      public.is_admin()
      or (public.auth_role() = 'vendedor'
          and exists (select 1 from public.tasks t where t.id = task_id and t.assigned_to = auth.uid()))
    )
  );

drop policy if exists reminders_vendedor_select on public.seller_reminders;
create policy reminders_vendedor_select on public.seller_reminders for select to authenticated
  using (seller_id = auth.uid() and active and public.auth_role() = 'vendedor');

drop policy if exists sales_vendedor_select on public.sales_numbers;
create policy sales_vendedor_select on public.sales_numbers for select to authenticated
  using (seller_id = auth.uid() and public.auth_role() = 'vendedor');

-- ═════════════════════════════════════════════════════════════════════════
-- 4. machines e machine_media: staff escreve; leitura exige usuário ativo
-- ═════════════════════════════════════════════════════════════════════════
drop policy if exists machines_read on public.machines;
drop policy if exists machines_admin on public.machines;
drop policy if exists machines_staff_all on public.machines;
create policy machines_read on public.machines for select to authenticated
  using (public.is_active_user() and (active or public.is_staff()));
create policy machines_staff_all on public.machines for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists media_read on public.machine_media;
drop policy if exists media_admin on public.machine_media;
drop policy if exists media_staff_all on public.machine_media;
create policy media_read on public.machine_media for select to authenticated
  using (
    public.is_active_user()
    and exists (select 1 from public.machines m where m.id = machine_id and (m.active or public.is_staff()))
  );
create policy media_staff_all on public.machine_media for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ═════════════════════════════════════════════════════════════════════════
-- 5. manuals: marketing só link e texto; tabela_preco é do admin
-- ═════════════════════════════════════════════════════════════════════════
drop policy if exists manuals_read on public.manuals;
drop policy if exists manuals_admin on public.manuals;
drop policy if exists manuals_admin_all on public.manuals;
drop policy if exists manuals_marketing_insert on public.manuals;
drop policy if exists manuals_marketing_update on public.manuals;
drop policy if exists manuals_marketing_delete on public.manuals;

create policy manuals_read on public.manuals for select to authenticated
  using (public.is_active_user() and (active or public.is_staff()));
create policy manuals_admin_all on public.manuals for all to authenticated
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
create policy manuals_marketing_insert on public.manuals for insert to authenticated
  with check (public.auth_role() = 'marketing' and kind <> 'tabela_preco');
create policy manuals_marketing_update on public.manuals for update to authenticated
  using (public.auth_role() = 'marketing' and kind <> 'tabela_preco')
  with check (public.auth_role() = 'marketing' and kind <> 'tabela_preco');
create policy manuals_marketing_delete on public.manuals for delete to authenticated
  using (public.auth_role() = 'marketing' and kind <> 'tabela_preco');

-- manual_files: admin tudo; marketing lê tudo e escreve só em manual que não é tabela_preco; vendedor como antes
drop policy if exists manual_files_admin on public.manual_files;
drop policy if exists manual_files_staff_select on public.manual_files;
drop policy if exists manual_files_marketing_insert on public.manual_files;
drop policy if exists manual_files_marketing_update on public.manual_files;
drop policy if exists manual_files_marketing_delete on public.manual_files;

create policy manual_files_admin on public.manual_files for all to authenticated
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
create policy manual_files_staff_select on public.manual_files for select to authenticated
  using (public.is_staff());
create policy manual_files_marketing_insert on public.manual_files for insert to authenticated
  with check (
    public.auth_role() = 'marketing'
    and exists (select 1 from public.manuals m where m.id = manual_id and m.kind <> 'tabela_preco')
  );
create policy manual_files_marketing_update on public.manual_files for update to authenticated
  using (
    public.auth_role() = 'marketing'
    and exists (select 1 from public.manuals m where m.id = manual_id and m.kind <> 'tabela_preco')
  )
  with check (
    public.auth_role() = 'marketing'
    and exists (select 1 from public.manuals m where m.id = manual_id and m.kind <> 'tabela_preco')
  );
create policy manual_files_marketing_delete on public.manual_files for delete to authenticated
  using (
    public.auth_role() = 'marketing'
    and exists (select 1 from public.manuals m where m.id = manual_id and m.kind <> 'tabela_preco')
  );
-- (manual_files_vendedor_select, da 005, continua: vendedor ativo lê arquivos de manual ativo)

-- ═════════════════════════════════════════════════════════════════════════
-- 6. Storage "manuais": staff envia e apaga, mas o marketing não mexe em pasta de tabela de preços
-- ═════════════════════════════════════════════════════════════════════════
-- A pasta do objeto é o id do manual ({manual_id}/{uuid}.{ext}).
create or replace function public.manual_object_in_price_table(p_name text) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.manuals m
    where m.kind = 'tabela_preco' and p_name like m.id::text || '/%'
  );
$$;

revoke all on function public.manual_object_in_price_table(text) from public, anon;
grant execute on function public.manual_object_in_price_table(text) to authenticated;

drop policy if exists manuais_select on storage.objects;
create policy manuais_select on storage.objects for select to authenticated
  using (bucket_id = 'manuais' and (public.is_staff() or public.manual_file_readable(name)));

drop policy if exists manuais_insert on storage.objects;
create policy manuais_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'manuais'
    and (public.auth_role() = 'admin'
         or (public.auth_role() = 'marketing' and not public.manual_object_in_price_table(name)))
  );

drop policy if exists manuais_update on storage.objects;
create policy manuais_update on storage.objects for update to authenticated
  using (
    bucket_id = 'manuais'
    and (public.auth_role() = 'admin'
         or (public.auth_role() = 'marketing' and not public.manual_object_in_price_table(name)))
  )
  with check (
    bucket_id = 'manuais'
    and (public.auth_role() = 'admin'
         or (public.auth_role() = 'marketing' and not public.manual_object_in_price_table(name)))
  );

drop policy if exists manuais_delete on storage.objects;
create policy manuais_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'manuais'
    and (public.auth_role() = 'admin'
         or (public.auth_role() = 'marketing' and not public.manual_object_in_price_table(name)))
  );

-- ═════════════════════════════════════════════════════════════════════════
-- 7. Storage "catalogo": fotos de produto (bucket público, escrita só da equipe)
-- ═════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogo', 'catalogo', true, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists catalogo_insert on storage.objects;
create policy catalogo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'catalogo' and public.is_staff());

drop policy if exists catalogo_update on storage.objects;
create policy catalogo_update on storage.objects for update to authenticated
  using (bucket_id = 'catalogo' and public.is_staff())
  with check (bucket_id = 'catalogo' and public.is_staff());

drop policy if exists catalogo_delete on storage.objects;
create policy catalogo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'catalogo' and public.is_staff());
-- Leitura: URL pública do bucket (sem policy de select, a API de listagem fica fechada).

notify pgrst, 'reload schema';

commit;

notify pgrst, 'reload schema';
