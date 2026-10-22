-- Testes de segurança da migração 009 (views analytics.*).
-- Rode UM BLOCO POR VEZ no SQL Editor do Supabase. Cada bloco termina em erro de propósito
-- ("OK: ..." ou "FALHA DE SEGURANÇA: ..."), o que desfaz tudo: nada fica gravado.
--
-- Pré-requisitos (todos ativos): admin, marketing e vendedor de teste. Troque os e-mails:
--   admin.teste@exemplo.com · marketing.teste@exemplo.com · vendedor.teste@exemplo.com

-- ═══ 1. admin, marketing e vendedor autenticados não leem nenhuma view analytics.v_* ═══
do $$
declare
  v record; u record; blocked boolean; falhas text := '';
begin
  for u in
    select id, email from auth.users
    where email in ('admin.teste@exemplo.com', 'marketing.teste@exemplo.com', 'vendedor.teste@exemplo.com')
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    for v in select viewname from pg_views where schemaname = 'analytics' loop
      blocked := false;
      begin
        set local role authenticated;
        execute format('select 1 from analytics.%I limit 1', v.viewname);
      exception when insufficient_privilege then
        blocked := true;
      end;
      reset role;
      if not blocked then falhas := falhas || format(' %s lê %s;', u.email, v.viewname); end if;
    end loop;
  end loop;
  if not exists (select 1 from pg_views where schemaname = 'analytics') then
    raise exception 'FALHA: nenhuma view em analytics (rode a 009)';
  end if;
  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA:%', falhas; end if;
  raise exception 'OK: authenticated (admin, marketing, vendedor) bloqueado em todas as views analytics';
end $$;

-- ═══ 2. anon não lê nenhuma view analytics.v_* ═══
do $$
declare v record; blocked boolean; falhas text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  for v in select viewname from pg_views where schemaname = 'analytics' loop
    blocked := false;
    begin
      set local role anon;
      execute format('select 1 from analytics.%I limit 1', v.viewname);
    exception when insufficient_privilege then
      blocked := true;
    end;
    reset role;
    if not blocked then falhas := falhas || ' ' || v.viewname || ';'; end if;
  end loop;
  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA: anon lê:%', falhas; end if;
  raise exception 'OK: anon bloqueado em todas as views analytics';
end $$;

-- ═══ 3. service_role lê todas as views sem erro (zero linhas é aceitável) ═══
do $$
declare v record;
begin
  for v in select viewname from pg_views where schemaname = 'analytics' loop
    begin
      set local role service_role;
      execute format('select 1 from analytics.%I limit 1', v.viewname);
    exception when others then
      reset role;
      raise exception 'FALHA FUNCIONAL: service_role não leu % (%)', v.viewname, sqlerrm;
    end;
    reset role;
  end loop;
  raise exception 'OK: service_role lê todas as views sem erro';
end $$;

-- ═══ 4. nenhuma coluna de texto livre nas views ═══
do $$
declare achadas text;
begin
  select string_agg(table_name || '.' || column_name, ', ') into achadas
  from information_schema.columns
  where table_schema = 'analytics'
    and lower(column_name) in ('title', 'description', 'body', 'caption', 'file_name', 'email', 'decision_note', 'brief',
                               'message', 'campaign', 'source_label', 'storage_path', 'external_url', 'full_name', 'phone', 'telefone',
                               'nome', 'texto', 'resumo', 'cnpj_cpf');
  if achadas is not null then raise exception 'FALHA DE SEGURANÇA: colunas de texto livre em analytics: %', achadas; end if;
  raise exception 'OK: nenhuma coluna de texto livre nas views analytics';
end $$;

-- ═══ 5. colunas de texto das views: só nomes de equipe e valores de listas fixas (conferência manual) ═══
-- Deve listar apenas: vendedor, seller_label, origem, tipo, prioridade, canal, status, mes, campanha (v_michele_dia, até 60 caracteres).
select table_name, column_name
from information_schema.columns
where table_schema = 'analytics' and data_type in ('text', 'character varying')
order by 1, 2;
