-- Papel "analista": leitura de tudo que é de gestão, nenhuma escrita (nem direta, nem indireta).
-- Idempotente. Requer as migrações 001 a 010 (auth_role, is_staff, is_active_user). Execute inteira no SQL Editor.
--
-- O que o analista LÊ: tarefas e comentários, vendas (sales_numbers e sales_sync_status), catálogo, manuais (e arquivos),
--   solicitações (e anexos/comentários), central de conteúdo (itens, arquivos, eventos) e os arquivos dos buckets
--   manuais, marketing e solicitacoes (só leitura, por URL assinada).
-- O que NÃO lê: Michele IA (michele_atendimentos, michele_mensagens, v_michele_atendimentos, michele_relatorio),
--   lembretes de vendedores (seller_reminders), schema analytics (só a service role; o endpoint /api/analise/resumo
--   autentica a sessão e consulta com a service role).
-- Como NÃO escreve:
--   1) nenhuma policy permissiva de insert/update/delete cita o analista (is_staff() continua sendo só admin e marketing);
--   2) policies RESTRITIVAS de insert/update/delete em toda tabela do schema public e em storage.objects negam o analista
--      mesmo que alguém crie, no futuro, uma policy permissiva ampla demais (restritiva = E lógico com as permissivas);
--   3) TRUNCATE, REFERENCES e TRIGGER são revogados de anon/authenticated em todas as tabelas do schema public;
--   4) as funções security definer foram revisadas (ver tests/011_analista_testes.sql, bloco de auditoria): todas as que
--      escrevem exigem o papel dentro da função (admin, vendedor ou service role) ou são security invoker (RLS do chamador).
-- Tabelas criadas depois desta migração: rode de novo a seção 4 (ou a migração inteira) para cobri-las.

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
  check (role in ('admin', 'vendedor', 'marketing', 'analista'));

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Função auxiliar (is_staff() NÃO muda: continua só admin e marketing, ou seja, quem escreve)
-- ═════════════════════════════════════════════════════════════════════════
create or replace function public.is_analista() returns boolean
language sql security definer set search_path = public stable as $$
  select coalesce(public.auth_role() = 'analista', false);
$$;

revoke all on function public.is_analista() from public, anon;
grant execute on function public.is_analista() to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Leitura (SELECT) do analista
--    profiles, machines, machine_media, manuals e manual_files já são lidos por qualquer usuário ativo (is_active_user),
--    mas só o que está ativo; o analista vê também o inativo, como o admin.
-- ═════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'tasks', 'task_comments',
    'sales_numbers', 'sales_sync_status',
    'machines', 'machine_media',
    'manuals', 'manual_files',
    'content_requests', 'request_files', 'request_comments',
    'content_items', 'content_files', 'content_events'
  ]
  loop
    execute format('drop policy if exists analista_select on public.%I', t);
    execute format(
      'create policy analista_select on public.%I for select to authenticated using (public.is_analista())', t);
  end loop;
end $$;

-- Arquivos: leitura por URL assinada (a rota do app gera a URL com a sessão do usuário)
drop policy if exists analista_storage_select on storage.objects;
create policy analista_storage_select on storage.objects for select to authenticated
  using (bucket_id in ('manuais', 'marketing', 'solicitacoes') and public.is_analista());

-- ═════════════════════════════════════════════════════════════════════════
-- 4. Escrita: negada ao analista por policies RESTRITIVAS (public.* e storage.objects)
-- ═════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  for t in
    select format('%I.%I', n.nspname, c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and c.relrowsecurity
      and (n.nspname = 'public' or (n.nspname = 'storage' and c.relname = 'objects'))
  loop
    execute format('drop policy if exists analista_no_insert on %s', t);
    execute format('drop policy if exists analista_no_update on %s', t);
    execute format('drop policy if exists analista_no_delete on %s', t);
    execute format(
      'create policy analista_no_insert on %s as restrictive for insert to authenticated
         with check (public.auth_role() is distinct from ''analista'')', t);
    execute format(
      'create policy analista_no_update on %s as restrictive for update to authenticated
         using (public.auth_role() is distinct from ''analista'')
         with check (public.auth_role() is distinct from ''analista'')', t);
    execute format(
      'create policy analista_no_delete on %s as restrictive for delete to authenticated
         using (public.auth_role() is distinct from ''analista'')', t);
  end loop;
end $$;

-- Tabela do schema public sem RLS fica aberta a qualquer usuário logado: avisa (não altera)
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    raise warning 'Tabela public.% está sem RLS: ative o RLS antes de liberar o papel analista', t;
  end loop;
end $$;

-- ═════════════════════════════════════════════════════════════════════════
-- 5. TRUNCATE/REFERENCES/TRIGGER não passam por RLS: ninguém logado (nem anônimo) precisa deles
-- ═════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  for t in
    select format('%I.%I', n.nspname, c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('revoke truncate, references, trigger on %s from anon, authenticated', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;

notify pgrst, 'reload schema';
