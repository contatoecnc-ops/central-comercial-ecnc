-- Testes de segurança da migração 013 (análise de crédito + papel financeiro).
-- Rode UM BLOCO POR VEZ no SQL Editor do Supabase. Cada bloco termina em erro de propósito
-- ("OK: ..." ou "FALHA DE SEGURANÇA: ..."), o que desfaz tudo: nada fica gravado (os dados de teste são criados dentro
-- do próprio bloco e somem junto).
--
-- Pré-requisitos (Authentication > Users > Add user, todos ativos, com o papel indicado em public.profiles):
--   admin.teste@exemplo.com        admin
--   financeiro.teste@exemplo.com   financeiro
--   vendedor.a.teste@exemplo.com   vendedor
--   marketing.teste@exemplo.com    marketing
--   analista.teste@exemplo.com     analista
-- Troque os e-mails de placeholder se os usuários de teste tiverem outros. NUNCA grave e-mails reais neste arquivo.
-- Quanto mais dados reais houver nas tabelas, mais conclusivos ficam os testes de leitura; tabela vazia aparece como
-- "sem dados" na mensagem final (não é falha).

-- ═══ 1. admin lê as duas tabelas; financeiro, vendedor, marketing, analista e anônimo não leem nada ═══
do $$
declare
  v_adm uuid; v_fin uuid; v_ven uuid; v_mkt uuid; v_ana uuid; c_id uuid; a_id uuid;
  papel text; t text; n int; falhas text := '';
begin
  select id into v_adm from auth.users where email = 'admin.teste@exemplo.com';
  select id into v_fin from auth.users where email = 'financeiro.teste@exemplo.com';
  select id into v_ven from auth.users where email = 'vendedor.a.teste@exemplo.com';
  select id into v_mkt from auth.users where email = 'marketing.teste@exemplo.com';
  select id into v_ana from auth.users where email = 'analista.teste@exemplo.com';
  if v_adm is null or v_fin is null or v_ven is null or v_mkt is null or v_ana is null then
    raise exception 'Faltam usuários de teste (admin, financeiro, vendedor A, marketing, analista)';
  end if;
  if not exists (select 1 from public.profiles where id = v_fin and role = 'financeiro' and active) then
    raise exception 'O usuário financeiro de teste precisa ter role financeiro e estar ativo (rode a 013 e veja o checklist)';
  end if;

  insert into public.contratos (numero, vendedor_id, vendedor_nome, cliente_razao_social, cliente_tipo_pessoa, cliente_documento,
                                valor_total_centavos, condicao_pagamento, dados, variaveis, modelo_id)
    values ('TESTE-AC', v_ven, 'Vendedor', 'Cliente Teste', 'PJ', '11222333000181', 100, 'entrada_boleto_nf', '{}', '{}', 'contrato-fiber')
    returning id into c_id;
  insert into public.analises_credito (documentos, cliente_nome, resultado, analisada_em, validade_ate, arquivo_path, enviado_por)
    values (array['11222333000181'], 'Cliente Teste', 'aprovada', current_date, current_date + 60, 'teste/x.pdf', v_fin)
    returning id into a_id;
  insert into public.contratos_analises (contrato_id, analise_id, origem) values (c_id, a_id, 'automatico');

  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.analises_credito where id = a_id;
  if n <> 1 then falhas := falhas || ' admin não lê analises_credito;'; end if;
  select count(*) into n from public.contratos_analises where analise_id = a_id;
  if n <> 1 then falhas := falhas || ' admin não lê contratos_analises;'; end if;
  reset role;

  foreach papel in array array['financeiro', 'vendedor', 'marketing', 'analista'] loop
    perform set_config('request.jwt.claims', json_build_object('sub',
      case papel when 'financeiro' then v_fin when 'vendedor' then v_ven when 'marketing' then v_mkt else v_ana end,
      'role', 'authenticated')::text, true);
    set local role authenticated;
    foreach t in array array['analises_credito', 'contratos_analises'] loop
      execute format('select count(*) from public.%I', t) into n;
      if n <> 0 then falhas := falhas || format(' %s lê %s linha(s) de %s;', papel, n, t); end if;
    end loop;
    reset role;
  end loop;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  foreach t in array array['analises_credito', 'contratos_analises'] loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      if n <> 0 then falhas := falhas || format(' anon lê %s linha(s) de %s;', n, t); end if;
    exception when insufficient_privilege then null; end;
  end loop;
  reset role;

  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA:%', falhas; end if;
  raise exception 'OK: só o admin lê analises_credito e contratos_analises';
end $$;

-- ═══ 2. nenhum papel de usuário (inclusive financeiro) escreve nas duas tabelas nem no bucket analises-credito ═══
do $$
declare
  v_adm uuid; v_fin uuid; v_ven uuid; v_mkt uuid; v_ana uuid; c_id uuid; a_id uuid;
  papel text; t text; op text; v_sql text; v_aff int; v_col text;
  falhas text := ''; inconc text := ''; bloqueios int := 0;
begin
  select id into v_adm from auth.users where email = 'admin.teste@exemplo.com';
  select id into v_fin from auth.users where email = 'financeiro.teste@exemplo.com';
  select id into v_ven from auth.users where email = 'vendedor.a.teste@exemplo.com';
  select id into v_mkt from auth.users where email = 'marketing.teste@exemplo.com';
  select id into v_ana from auth.users where email = 'analista.teste@exemplo.com';
  if v_adm is null or v_fin is null or v_ven is null or v_mkt is null or v_ana is null then raise exception 'Faltam usuários de teste'; end if;

  insert into public.contratos (numero, vendedor_id, vendedor_nome, cliente_razao_social, cliente_tipo_pessoa, cliente_documento,
                                valor_total_centavos, condicao_pagamento, dados, variaveis, modelo_id)
    values ('TESTE-AC', v_ven, 'Vendedor', 'Cliente Teste', 'PJ', '11222333000181', 100, 'entrada_boleto_nf', '{}', '{}', 'contrato-fiber')
    returning id into c_id;
  insert into public.analises_credito (documentos, cliente_nome, resultado, analisada_em, validade_ate, arquivo_path, enviado_por)
    values (array['11222333000181'], 'Cliente Teste', 'aprovada', current_date, current_date + 60, 'teste/x.pdf', v_fin)
    returning id into a_id;
  insert into public.contratos_analises (contrato_id, analise_id, origem) values (c_id, a_id, 'automatico');
  insert into storage.objects (bucket_id, name, owner) values ('analises-credito', 'teste/x.pdf', v_fin);

  foreach papel in array array['financeiro', 'admin', 'vendedor', 'marketing', 'analista', 'anon'] loop
    perform set_config('request.jwt.claims',
      case when papel = 'anon' then json_build_object('role', 'anon')::text
        else json_build_object('sub', case papel when 'financeiro' then v_fin when 'admin' then v_adm when 'vendedor' then v_ven
                                                 when 'marketing' then v_mkt else v_ana end, 'role', 'authenticated')::text end, true);
    foreach t in array array['public.analises_credito', 'public.contratos_analises', 'storage.objects'] loop
      select attname into v_col from pg_attribute where attrelid = t::regclass and attnum > 0 and not attisdropped order by attnum limit 1;
      foreach op in array array['insert', 'update', 'delete'] loop
        v_sql := case op
          when 'insert' then case t when 'storage.objects'
            then format('insert into storage.objects (bucket_id, name, owner) values (''analises-credito'', ''teste/%s.pdf'', null)', papel)
            else format('insert into %s select * from %s limit 1', t, t) end
          when 'update' then format('update %s set %I = %I%s', t, v_col, v_col, case t when 'storage.objects' then ' where bucket_id = ''analises-credito''' else '' end)
          else format('delete from %s%s', t, case t when 'storage.objects' then ' where bucket_id = ''analises-credito''' else '' end) end;
        begin
          if papel = 'anon' then set local role anon; else set local role authenticated; end if;
          execute v_sql;
          get diagnostics v_aff = row_count;
          reset role;
          if v_aff > 0 then falhas := falhas || format(' %s.%s.%s (%s linha(s));', papel, t, op, v_aff);
          else bloqueios := bloqueios + 1; end if;
        exception when others then
          reset role;
          if sqlstate in ('42501', 'P0001') then bloqueios := bloqueios + 1;
          else inconc := inconc || format(' %s.%s.%s[%s]', papel, t, op, sqlstate); end if;
        end;
      end loop;
    end loop;
  end loop;

  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA: escrita permitida:%', falhas; end if;
  raise exception 'OK: nenhum papel escreve nas tabelas novas nem no bucket (% tentativas bloqueadas). Inconclusivo:%', bloqueios, coalesce(nullif(inconc, ''), ' nenhum');
end $$;

-- ═══ 3. financeiro não lê contratos, conversas, vendas, tarefas, catálogo, manuais, conteúdo nem Michele; lê só o próprio perfil ═══
do $$
declare
  v_fin uuid; v_adm uuid; t text; n int; n_priv int; falhas text := ''; sem_dados text := '';
  tabs text[] := array[
    'contratos', 'contratos_eventos', 'contratos_conversas', 'perfis_contrato',
    'tasks', 'task_comments', 'seller_reminders', 'sales_numbers', 'sales_sync_status',
    'machines', 'machine_media', 'manuals', 'manual_files',
    'content_requests', 'request_files', 'request_comments', 'content_items', 'content_files', 'content_events',
    'michele_atendimentos', 'michele_mensagens'];
begin
  select id into v_fin from auth.users where email = 'financeiro.teste@exemplo.com';
  select id into v_adm from auth.users where email = 'admin.teste@exemplo.com';
  if v_fin is null or v_adm is null then raise exception 'Faltam usuários de teste'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_fin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  foreach t in array tabs loop
    reset role;
    execute format('select count(*) from public.%I', t) into n_priv;
    if n_priv = 0 then sem_dados := sem_dados || ' ' || t; end if;
    set local role authenticated;
    begin
      execute format('select count(*) from public.%I', t) into n;
      if n <> 0 then falhas := falhas || format(' %s (%s linha(s));', t, n); end if;
    exception when insufficient_privilege then null; end;
  end loop;

  -- perfis: só o próprio
  select count(*) into n from public.profiles;
  if n <> 1 then falhas := falhas || format(' profiles (vê %s, esperado 1: o próprio);', n); end if;
  if not exists (select 1 from public.profiles where id = v_fin) then falhas := falhas || ' não lê o próprio perfil;'; end if;
  reset role;

  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA: financeiro leu:%', falhas; end if;
  raise exception 'OK: financeiro lê só o próprio perfil. Tabelas sem dados para conferir:%', coalesce(nullif(sem_dados, ''), ' nenhuma');
end $$;

-- ═══ 4. funções novas negadas a anon e authenticated ═══
do $$
declare
  v_fin uuid; falhas text := '';
begin
  select id into v_fin from auth.users where email = 'financeiro.teste@exemplo.com';
  if v_fin is null then raise exception 'Falta o usuário financeiro de teste'; end if;
  if has_function_privilege('anon', 'public.is_financeiro()', 'execute') then falhas := falhas || ' anon executa is_financeiro;'; end if;
  if has_function_privilege('authenticated', 'public.is_financeiro()', 'execute') then falhas := falhas || ' authenticated executa is_financeiro;'; end if;
  if not has_function_privilege('service_role', 'public.is_financeiro()', 'execute') then falhas := falhas || ' service_role sem execute;'; end if;
  if not exists (select 1 from pg_proc p where p.oid = 'public.is_financeiro()'::regprocedure
                 and p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) then
    falhas := falhas || ' is_financeiro sem security definer + search_path;';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_fin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.is_financeiro(); falhas := falhas || ' financeiro executou is_financeiro;'; exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin perform public.is_financeiro(); falhas := falhas || ' anon executou is_financeiro;'; exception when insufficient_privilege then null; end;
  reset role;
  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA:%', falhas; end if;
  raise exception 'OK: funções novas só para o servidor';
end $$;

-- ═══ 5. auditoria: RLS ligado e policies restritivas do financeiro (e do analista) em todas as tabelas de public e em storage.objects ═══
do $$
declare
  t record; falhas text := ''; n int; total int := 0;
begin
  for t in
    select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and n.nspname = 'public'
  loop
    total := total + 1;
    if not exists (select 1 from pg_class c join pg_namespace s on s.oid = c.relnamespace
                   where s.nspname = t.nspname and c.relname = t.relname and c.relrowsecurity) then
      falhas := falhas || format(' %s sem RLS;', t.relname);
      continue;
    end if;
    select count(*) into n from pg_policies
      where schemaname = t.nspname and tablename = t.relname and permissive = 'RESTRICTIVE'
        and policyname in ('financeiro_no_insert', 'financeiro_no_update', 'financeiro_no_delete');
    if n <> 3 then falhas := falhas || format(' %s com %s de 3 policies restritivas do financeiro;', t.relname, n); end if;
    select count(*) into n from pg_policies
      where schemaname = t.nspname and tablename = t.relname and permissive = 'RESTRICTIVE'
        and policyname in ('analista_no_insert', 'analista_no_update', 'analista_no_delete');
    if n <> 3 then falhas := falhas || format(' %s com %s de 3 policies restritivas do analista;', t.relname, n); end if;
    if has_table_privilege('anon', format('%I.%I', t.nspname, t.relname), 'truncate') or
       has_table_privilege('authenticated', format('%I.%I', t.nspname, t.relname), 'truncate,references,trigger') then
      falhas := falhas || format(' %s com truncate/references/trigger;', t.relname);
    end if;
  end loop;
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and permissive = 'RESTRICTIVE'
    and policyname in ('financeiro_no_insert', 'financeiro_no_update', 'financeiro_no_delete');
  if n <> 3 then falhas := falhas || ' storage.objects sem as 3 policies restritivas do financeiro;'; end if;

  -- nenhuma policy permissiva cita o financeiro (ele não ganha nenhum SELECT)
  select count(*) into n from pg_policies where permissive = 'PERMISSIVE' and (coalesce(qual, '') ilike '%financeiro%' or coalesce(with_check, '') ilike '%financeiro%');
  if n <> 0 then falhas := falhas || format(' %s policy(ies) permissiva(s) citam o financeiro;', n); end if;

  -- constraint do papel e bucket
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%financeiro%') then
    falhas := falhas || ' profiles_role_check sem financeiro;';
  end if;
  if (select count(*) from storage.buckets where id = 'analises-credito' and not public and file_size_limit = 10485760
        and allowed_mime_types = array['application/pdf']) <> 1 then
    falhas := falhas || ' bucket analises-credito ausente, público ou sem limite/PDF;';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and (coalesce(qual, '') ilike '%analises-credito%' or coalesce(with_check, '') ilike '%analises-credito%')) then
    falhas := falhas || ' há policy de storage citando analises-credito;';
  end if;

  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA (auditoria):%', falhas; end if;
  raise exception 'OK: auditoria de % tabelas de public, storage.objects e do bucket analises-credito', total;
end $$;

-- ═══ 6. regressão: vendedor, marketing, analista e admin mantêm o acesso que tinham ═══
-- Rode também 011_analista_testes.sql e 012_contratos_testes.sql depois desta migração.
do $$
declare
  v_adm uuid; v_ven uuid; v_mkt uuid; v_ana uuid; n int; n_priv int; falhas text := ''; v_aff int;
begin
  select id into v_adm from auth.users where email = 'admin.teste@exemplo.com';
  select id into v_ven from auth.users where email = 'vendedor.a.teste@exemplo.com';
  select id into v_mkt from auth.users where email = 'marketing.teste@exemplo.com';
  select id into v_ana from auth.users where email = 'analista.teste@exemplo.com';
  if v_adm is null or v_ven is null or v_mkt is null or v_ana is null then raise exception 'Faltam usuários de teste'; end if;

  -- is_active_user() continua verdadeiro para o vendedor, que segue lendo todos os perfis
  perform set_config('request.jwt.claims', json_build_object('sub', v_ven, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not public.is_active_user() then falhas := falhas || ' vendedor perdeu is_active_user;'; end if;
  select count(*) into n from public.profiles;
  reset role;
  select count(*) into n_priv from public.profiles;
  if n <> n_priv then falhas := falhas || format(' vendedor vê %s de %s perfis;', n, n_priv); end if;

  -- admin lê tudo de contratos; marketing e analista seguem sem contratos
  select count(*) into n_priv from public.contratos;
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.contratos;
  if n <> n_priv then falhas := falhas || format(' admin vê %s de %s contratos;', n, n_priv); end if;
  select count(*) into n from public.tasks;
  reset role;
  select count(*) into n_priv from public.tasks;
  if n <> n_priv then falhas := falhas || format(' admin vê %s de %s tarefas;', n, n_priv); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ana, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.tasks;
  if n <> n_priv then falhas := falhas || format(' analista vê %s de %s tarefas;', n, n_priv); end if;
  select count(*) into n from public.contratos;
  if n <> 0 then falhas := falhas || ' analista lê contratos;'; end if;
  begin
    update public.tasks set title = title;
    get diagnostics v_aff = row_count;
    if v_aff > 0 then falhas := falhas || ' analista atualizou tarefas;'; end if;
  exception when others then null; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_mkt, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.contratos;
  if n <> 0 then falhas := falhas || ' marketing lê contratos;'; end if;
  select count(*) into n from public.michele_atendimentos;
  if n <> 0 then falhas := falhas || ' marketing lê Michele;'; end if;
  select count(*) into n from public.machines where active;
  reset role;
  select count(*) into n_priv from public.machines where active;
  if n <> n_priv then falhas := falhas || format(' marketing vê %s de %s máquinas ativas;', n, n_priv); end if;

  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA (regressão):%', falhas; end if;
  raise exception 'OK: vendedor, marketing, analista e admin mantêm o acesso (is_active_user só deixou de valer para o financeiro)';
end $$;
