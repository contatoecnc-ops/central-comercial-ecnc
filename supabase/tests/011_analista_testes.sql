-- Testes de segurança da migração 011 (papel analista).
-- Rode UM BLOCO POR VEZ no SQL Editor do Supabase. Cada bloco termina em erro de propósito
-- ("OK: ..." ou "FALHA DE SEGURANÇA: ..."), o que desfaz tudo: nada fica gravado.
--
-- Pré-requisitos (Usuários > Novo usuário, todos ativos): um analista, um vendedor, um marketing e um admin de teste.
-- Troque os e-mails de placeholder no início de cada bloco. Quanto mais dados reais houver nas tabelas, mais conclusivos
-- ficam os testes de escrita; tabela vazia aparece como "inconclusivo" na mensagem final (não é falha).
--
-- Padrão de cada teste de escrita: uma tentativa por tabela e por operação (insert, update, delete) como o analista.
--   bloqueado = erro 42501 (RLS), erro de trigger (P0001) ou 0 linhas afetadas. Linha afetada = FALHA DE SEGURANÇA.

-- ═══ 1. analista lê todas as tabelas do escopo (o mesmo que o admin enxerga) ═══
do $$
declare
  v_uid uuid; t text; n_priv int; n_an int; falhas text := ''; sem_dados text := '';
  tabs text[] := array[
    'tasks', 'task_comments', 'sales_numbers', 'sales_sync_status', 'machines', 'machine_media',
    'manuals', 'manual_files', 'content_requests', 'request_files', 'request_comments',
    'content_items', 'content_files', 'content_events', 'profiles'];
  priv jsonb := '{}'::jsonb;
begin
  select id into v_uid from auth.users where email = 'analista.teste@exemplo.com';
  if v_uid is null then raise exception 'Usuário analista de teste não encontrado'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'analista' and active) then
    raise exception 'O usuário de teste precisa ter role analista e estar ativo';
  end if;
  foreach t in array tabs loop
    execute format('select count(*) from public.%I', t) into n_priv;
    priv := priv || jsonb_build_object(t, n_priv);
  end loop;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  foreach t in array tabs loop
    begin
      execute format('select count(*) from public.%I', t) into n_an;
      n_priv := (priv ->> t)::int;
      if n_an <> n_priv then falhas := falhas || format(' %s (vê %s de %s);', t, n_an, n_priv); end if;
      if n_priv = 0 then sem_dados := sem_dados || ' ' || t; end if;
    exception when others then
      falhas := falhas || format(' %s (erro %s);', t, sqlstate);
    end;
  end loop;
  reset role;

  if falhas <> '' then raise exception 'FALHA: analista não enxerga todas as linhas:%', falhas; end if;
  raise exception 'OK: analista lê todas as % tabelas do escopo. Sem dados para conferir:%', array_length(tabs, 1), coalesce(nullif(sem_dados, ''), ' nenhuma');
end $$;

-- ═══ 2. analista NÃO escreve em nenhuma tabela (insert, update e delete, uma tentativa por tabela) ═══
do $$
declare
  v_uid uuid; t text; op text; v_sql text; v_col text; v_n int; v_aff int;
  falhas text := ''; inconc text := ''; bloqueios int := 0;
  tabs text[] := array[
    'profiles', 'tasks', 'task_comments', 'seller_reminders', 'sales_numbers', 'sales_sync_status',
    'machines', 'machine_media', 'manuals', 'manual_files', 'content_requests', 'request_files',
    'request_comments', 'content_items', 'content_files', 'content_events',
    'michele_atendimentos', 'michele_mensagens'];
begin
  select id into v_uid from auth.users where email = 'analista.teste@exemplo.com';
  if v_uid is null then raise exception 'Usuário analista de teste não encontrado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  foreach t in array tabs loop
    execute format('select count(*) from public.%I', t) into v_n;
    select attname into v_col from pg_attribute
      where attrelid = format('public.%I', t)::regclass and attnum > 0 and not attisdropped
      order by attnum limit 1;
    foreach op in array array['insert', 'update', 'delete'] loop
      v_sql := case op
        when 'insert' then case when v_n > 0
          then format('insert into public.%I select * from public.%I limit 1', t, t)
          else format('insert into public.%I default values', t) end
        when 'update' then format('update public.%I set %I = %I', t, v_col, v_col)
        else format('delete from public.%I', t) end;
      begin
        execute v_sql;
        get diagnostics v_aff = row_count;
        if v_aff > 0 then
          falhas := falhas || format(' %s.%s (%s linha(s));', t, op, v_aff);
        elsif op <> 'insert' and v_n = 0 then
          inconc := inconc || format(' %s.%s', t, op);   -- nada visível: não prova bloqueio
        else
          bloqueios := bloqueios + 1;
        end if;
      exception when others then
        if sqlstate in ('42501', 'P0001') then
          bloqueios := bloqueios + 1;
        elsif sqlstate = '23505' and op = 'insert' and v_n > 0 then
          falhas := falhas || format(' %s.insert (passou pela RLS; só a chave única barrou);', t);
        else
          inconc := inconc || format(' %s.%s[%s]', t, op, sqlstate);
        end if;
      end;
    end loop;
  end loop;
  reset role;

  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA: analista escreveu:%', falhas; end if;
  raise exception 'OK: analista bloqueado em % tentativas de escrita. Inconclusivo (sem dados/erro de constraint):%',
    bloqueios, coalesce(nullif(inconc, ''), ' nenhum');
end $$;

-- ═══ 3. analista não escreve no Storage (só lê por URL assinada) ═══
do $$
declare
  v_uid uuid; b text; n_priv int; n_an int; v_aff int; falhas text := ''; leitura text := '';
begin
  select id into v_uid from auth.users where email = 'analista.teste@exemplo.com';
  if v_uid is null then raise exception 'Usuário analista de teste não encontrado'; end if;
  select count(*) into n_priv from storage.objects where bucket_id in ('manuais', 'marketing', 'solicitacoes');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n_an from storage.objects where bucket_id in ('manuais', 'marketing', 'solicitacoes');
  if n_an <> n_priv then falhas := falhas || format(' leitura (vê %s de %s);', n_an, n_priv); end if;

  foreach b in array array['manuais', 'marketing', 'solicitacoes', 'catalogo'] loop
    begin
      insert into storage.objects (bucket_id, name, owner) values (b, 'teste-analista/x.png', v_uid);
      falhas := falhas || format(' insert em %s;', b);
    exception when others then null; end;
    begin
      update storage.objects set name = name where bucket_id = b;
      get diagnostics v_aff = row_count;
      if v_aff > 0 then falhas := falhas || format(' update em %s (%s);', b, v_aff); end if;
    exception when others then null; end;
    begin
      delete from storage.objects where bucket_id = b;
      get diagnostics v_aff = row_count;
      if v_aff > 0 then falhas := falhas || format(' delete em %s (%s);', b, v_aff); end if;
    exception when others then null; end;
  end loop;
  reset role;

  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA: Storage:%', falhas; end if;
  raise exception 'OK: analista lê % objeto(s) e não escreve em nenhum bucket', n_an;
end $$;

-- ═══ 4. analista NÃO lê Michele, lembretes nem relatórios ═══
do $$
declare
  v_uid uuid; t text; n int; falhas text := ''; bloqueou boolean := false;
begin
  select id into v_uid from auth.users where email = 'analista.teste@exemplo.com';
  if v_uid is null then raise exception 'Usuário analista de teste não encontrado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  foreach t in array array['michele_atendimentos', 'michele_mensagens', 'v_michele_atendimentos', 'seller_reminders'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then falhas := falhas || format(' %s (%s linhas);', t, n); end if;
  end loop;
  begin
    perform public.michele_relatorio(now() - interval '30 days', now());
  exception when others then
    bloqueou := true;
  end;
  reset role;
  if not bloqueou then falhas := falhas || ' michele_relatorio executou;'; end if;
  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA: analista leu:%', falhas; end if;
  raise exception 'OK: analista vê 0 linhas de Michele e de lembretes, e michele_relatorio é negada';
end $$;

-- ═══ 5. analista não lê as views analytics.* diretamente ═══
do $$
declare
  v_uid uuid; v record; blocked boolean; falhas text := ''; n int := 0;
begin
  select id into v_uid from auth.users where email = 'analista.teste@exemplo.com';
  if v_uid is null then raise exception 'Usuário analista de teste não encontrado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  for v in select viewname from pg_views where schemaname = 'analytics' loop
    n := n + 1;
    blocked := false;
    begin
      set local role authenticated;
      execute format('select 1 from analytics.%I limit 1', v.viewname);
    exception when insufficient_privilege then
      blocked := true;
    end;
    reset role;
    if not blocked then falhas := falhas || format(' %s;', v.viewname); end if;
  end loop;
  if n = 0 then raise exception 'FALHA: nenhuma view em analytics (rode a 009)'; end if;
  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA: analista leu views:%', falhas; end if;
  raise exception 'OK: analista bloqueado em todas as % views analytics', n;
end $$;

-- ═══ 6. escrita indireta: funções (RPC) não deixam o analista mudar nada ═══
do $$
declare
  v_uid uuid; v_task uuid; v_task_status text; v_content uuid; v_content_status text; v_req uuid;
  falhas text := ''; inconc text := ''; v_after text;
begin
  select id into v_uid from auth.users where email = 'analista.teste@exemplo.com';
  if v_uid is null then raise exception 'Usuário analista de teste não encontrado'; end if;
  select id, status into v_task, v_task_status from public.tasks where status in ('pendente', 'em_andamento') limit 1;
  select id, status into v_content, v_content_status from public.content_items where status <> 'arquivado' limit 1;
  select id into v_req from public.content_requests where status = 'nova' limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  if v_task is null then inconc := inconc || ' complete_task';
  else
    begin
      perform public.complete_task(v_task, 'teste');
      falhas := falhas || ' complete_task executou;';
    exception when others then null; end;
  end if;

  if v_content is null then inconc := inconc || ' set_content_status';
  else
    begin
      perform public.set_content_status(v_content, 'arquivado', null);
      falhas := falhas || ' set_content_status executou;';
    exception when others then null; end;
    begin
      perform public.approve_content(v_content, null);
      falhas := falhas || ' approve_content executou;';
    exception when others then null; end;
    begin
      perform public.request_changes(v_content, 'teste');
      falhas := falhas || ' request_changes executou;';
    exception when others then null; end;
  end if;

  if v_req is null then inconc := inconc || ' approve_request/reject_request/cancel_request';
  else
    begin
      perform public.reject_request(v_req, 'teste');
      falhas := falhas || ' reject_request executou;';
    exception when others then null; end;
    begin
      perform public.cancel_request(v_req);
      falhas := falhas || ' cancel_request executou;';
    exception when others then null; end;
    begin
      perform public.approve_request(v_req, null, null, null, null, null, null);
      falhas := falhas || ' approve_request executou;';
    exception when others then null; end;
  end if;
  reset role;

  if v_task is not null then
    select status into v_after from public.tasks where id = v_task;
    if v_after is distinct from v_task_status then falhas := falhas || ' status da tarefa mudou;'; end if;
  end if;
  if v_content is not null then
    select status into v_after from public.content_items where id = v_content;
    if v_after is distinct from v_content_status then falhas := falhas || ' status do conteúdo mudou;'; end if;
  end if;
  if v_req is not null then
    select status into v_after from public.content_requests where id = v_req;
    if v_after is distinct from 'nova' then falhas := falhas || ' status da solicitação mudou;'; end if;
  end if;

  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA: caminho indireto de escrita:%', falhas; end if;
  raise exception 'OK: funções de escrita negadas ao analista. Inconclusivo (sem dados):%', coalesce(nullif(inconc, ''), ' nenhum');
end $$;

-- ═══ 7. auditoria das funções security definer chamáveis por usuário logado ═══
-- Falha se alguma função (não-trigger) security definer com insert/update/delete no corpo não confere papel/usuário.
do $$
declare
  r record; falhas text := ''; n int := 0;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosrc
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('authenticated', p.oid, 'execute')
      and p.prosrc ~* '\m(insert|update|delete)\M'
  loop
    n := n + 1;
    if r.prosrc !~* '(auth_role|is_admin|is_staff|is_privileged|auth\.uid)' then
      falhas := falhas || format(' %s(%s);', r.proname, r.args);
    end if;
  end loop;
  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA: security definer que escreve sem conferir papel:%', falhas; end if;
  raise exception 'OK: % função(ões) security definer que escrevem, todas conferem papel ou usuário no corpo', n;
end $$;

-- ═══ 8. nenhuma tabela do schema public sem RLS e nenhuma sem as policies restritivas do analista ═══
do $$
declare
  r record; falhas text := '';
begin
  for r in
    select c.relname, c.relrowsecurity,
           (select count(*) from pg_policies p
             where p.schemaname = 'public' and p.tablename = c.relname
               and p.policyname in ('analista_no_insert', 'analista_no_update', 'analista_no_delete')) as restritivas
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    if not r.relrowsecurity then falhas := falhas || format(' %s sem RLS;', r.relname);
    elsif r.restritivas <> 3 then falhas := falhas || format(' %s sem as 3 policies restritivas;', r.relname);
    end if;
  end loop;
  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA:% (rode de novo a seção 4 da 011)', falhas; end if;
  raise exception 'OK: todas as tabelas de public têm RLS e as policies restritivas do analista';
end $$;

-- ═══ 9. regressão: vendedor mantém o acesso que já tinha ═══
do $$
declare
  v_uid uuid; n_an int; n_ok int; falhas text := ''; v_task uuid;
begin
  select id into v_uid from auth.users where email = 'vendedor.teste@exemplo.com';
  if v_uid is null then raise exception 'Usuário vendedor de teste não encontrado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- esperado calculado com privilégio total, antes de assumir o papel
  select count(*) into n_ok from public.tasks where assigned_to = v_uid;
  set local role authenticated;
  select count(*) into n_an from public.tasks;
  if n_an <> n_ok then falhas := falhas || format(' tarefas (vê %s, esperado %s);', n_an, n_ok); end if;
  reset role;

  select count(*) into n_ok from public.sales_numbers where seller_id = v_uid;
  set local role authenticated;
  select count(*) into n_an from public.sales_numbers;
  if n_an <> n_ok then falhas := falhas || format(' vendas (vê %s, esperado %s);', n_an, n_ok); end if;
  reset role;

  select count(*) into n_ok from public.content_requests where requested_by = v_uid;
  set local role authenticated;
  select count(*) into n_an from public.content_requests;
  if n_an <> n_ok then falhas := falhas || format(' solicitações (vê %s, esperado %s);', n_an, n_ok); end if;
  reset role;

  select count(*) into n_ok from public.machines where active;
  set local role authenticated;
  select count(*) into n_an from public.machines;
  if n_an <> n_ok then falhas := falhas || format(' catálogo (vê %s, esperado %s);', n_an, n_ok); end if;
  reset role;

  select count(*) into n_ok from public.manuals where active;
  set local role authenticated;
  select count(*) into n_an from public.manuals;
  if n_an <> n_ok then falhas := falhas || format(' manuais (vê %s, esperado %s);', n_an, n_ok); end if;
  select count(*) into n_an from public.content_items;
  if n_an <> 0 then falhas := falhas || format(' conteúdo (vê %s);', n_an); end if;
  select count(*) into n_an from public.michele_atendimentos;
  if n_an <> 0 then falhas := falhas || format(' michele (vê %s);', n_an); end if;

  -- escrita própria continua: cria tarefa própria e muda o status
  begin
    insert into public.tasks (title, assigned_to, created_by, due_date)
      values ('Teste regressão vendedor', v_uid, v_uid, now() + interval '1 day') returning id into v_task;
    update public.tasks set status = 'em_andamento' where id = v_task;
    get diagnostics n_an = row_count;
    if n_an <> 1 then falhas := falhas || ' vendedor não atualizou a própria tarefa;'; end if;
  exception when others then
    falhas := falhas || format(' vendedor não criou/atualizou tarefa própria (%s);', sqlerrm);
  end;
  reset role;

  if falhas <> '' then raise exception 'FALHA (regressão do vendedor):%', falhas; end if;
  raise exception 'OK: vendedor mantém o acesso (próprias tarefas, vendas, solicitações; catálogo e manuais ativos; sem conteúdo nem Michele)';
end $$;

-- ═══ 10. regressão: marketing mantém o acesso que já tinha ═══
do $$
declare
  v_uid uuid; n_an int; n_ok int; falhas text := ''; v_id uuid; t text;
begin
  select id into v_uid from auth.users where email = 'marketing.teste@exemplo.com';
  if v_uid is null then raise exception 'Usuário marketing de teste não encontrado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  foreach t in array array['content_items', 'content_files', 'content_events', 'machines', 'machine_media', 'manuals'] loop
    execute format('select count(*) from public.%I', t) into n_ok;
    set local role authenticated;
    execute format('select count(*) from public.%I', t) into n_an;
    reset role;
    if n_an <> n_ok then falhas := falhas || format(' %s (vê %s de %s);', t, n_an, n_ok); end if;
  end loop;

  set local role authenticated;
  foreach t in array array['tasks', 'task_comments', 'sales_numbers', 'seller_reminders', 'content_requests', 'michele_atendimentos'] loop
    execute format('select count(*) from public.%I', t) into n_an;
    if n_an <> 0 then falhas := falhas || format(' %s (vê %s, esperado 0);', t, n_an); end if;
  end loop;

  begin
    insert into public.content_items (title, created_by) values ('Teste regressão marketing', v_uid) returning id into v_id;
    insert into public.machines (name, slug, category) values ('Teste marketing', 'teste-mkt-' || gen_random_uuid(), 'CO2');
  exception when others then
    falhas := falhas || format(' marketing não criou conteúdo/máquina (%s);', sqlerrm);
  end;
  reset role;

  if falhas <> '' then raise exception 'FALHA (regressão do marketing):%', falhas; end if;
  raise exception 'OK: marketing mantém o acesso (conteúdo, catálogo e manuais; sem tarefas, vendas, solicitações nem Michele)';
end $$;

-- ═══ 11. regressão: admin continua lendo e escrevendo em tudo ═══
do $$
declare
  v_uid uuid; t text; n_priv int; n_ad int; falhas text := ''; v_id uuid;
begin
  select id into v_uid from auth.users where email = 'admin.teste@exemplo.com';
  if v_uid is null then raise exception 'Usuário admin de teste não encontrado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  foreach t in array array[
    'tasks', 'task_comments', 'seller_reminders', 'sales_numbers', 'sales_sync_status', 'machines', 'manuals',
    'manual_files', 'content_requests', 'content_items', 'content_events', 'michele_atendimentos', 'michele_mensagens'] loop
    execute format('select count(*) from public.%I', t) into n_priv;
    set local role authenticated;
    execute format('select count(*) from public.%I', t) into n_ad;
    reset role;
    if n_ad <> n_priv then falhas := falhas || format(' %s (vê %s de %s);', t, n_ad, n_priv); end if;
  end loop;

  set local role authenticated;
  begin
    insert into public.seller_reminders (seller_id, message, created_by)
      select id, 'Teste regressão admin', v_uid from public.profiles where role = 'vendedor' limit 1;
    insert into public.machines (name, slug, category) values ('Teste admin', 'teste-adm-' || gen_random_uuid(), 'CO2')
      returning id into v_id;
    update public.machines set tagline = 'ok' where id = v_id;
    delete from public.machines where id = v_id;
  exception when others then
    falhas := falhas || format(' admin não escreveu (%s);', sqlerrm);
  end;
  reset role;

  if falhas <> '' then raise exception 'FALHA (regressão do admin):%', falhas; end if;
  raise exception 'OK: admin mantém leitura e escrita';
end $$;
