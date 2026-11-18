-- Testes de segurança da migração 012 (Agente de Contratos).
-- Rode UM BLOCO POR VEZ no SQL Editor do Supabase. Cada bloco termina em erro de propósito
-- ("OK: ..." ou "FALHA DE SEGURANÇA: ..."), o que desfaz tudo: nada fica gravado (os contratos de teste são criados
-- dentro do próprio bloco e somem junto).
--
-- Pré-requisitos (Authentication > Users > Add user, todos ativos, com o perfil/papel indicado em public.profiles):
--   admin.teste@exemplo.com        papel admin
--   vendedor.a.teste@exemplo.com   papel vendedor
--   vendedor.b.teste@exemplo.com   papel vendedor
--   marketing.teste@exemplo.com    papel marketing
--   analista.teste@exemplo.com     papel analista
-- Troque os e-mails de placeholder se os usuários de teste tiverem outros. NUNCA grave e-mails reais neste arquivo.

-- ═══ 1. vendedor A não lê contrato, conversa nem evento do vendedor B; lê os próprios (e B só os dele) ═══
do $$
declare
  v_a uuid; v_b uuid; c_a uuid; c_b uuid; n int; falhas text := '';
begin
  select id into v_a from auth.users where email = 'vendedor.a.teste@exemplo.com';
  select id into v_b from auth.users where email = 'vendedor.b.teste@exemplo.com';
  if v_a is null or v_b is null then raise exception 'Usuários vendedor.a / vendedor.b de teste não encontrados'; end if;
  if not exists (select 1 from public.profiles where id = v_a and role = 'vendedor' and active)
     or not exists (select 1 from public.profiles where id = v_b and role = 'vendedor' and active) then
    raise exception 'Os usuários de teste precisam ser vendedores ativos';
  end if;

  insert into public.contratos (numero, vendedor_id, vendedor_nome, cliente_razao_social, cliente_tipo_pessoa, cliente_documento,
                                valor_total_centavos, condicao_pagamento, dados, variaveis, modelo_id)
    values ('TESTE-A', v_a, 'Vendedor A', 'Cliente Teste A', 'PJ', '00000000000000', 100, 'a_vista', '{}', '{}', 'contrato-fiber')
    returning id into c_a;
  insert into public.contratos (numero, vendedor_id, vendedor_nome, cliente_razao_social, cliente_tipo_pessoa, cliente_documento,
                                valor_total_centavos, condicao_pagamento, dados, variaveis, modelo_id)
    values ('TESTE-B', v_b, 'Vendedor B', 'Cliente Teste B', 'PJ', '00000000000000', 100, 'a_vista', '{}', '{}', 'contrato-fiber')
    returning id into c_b;
  insert into public.contratos_eventos (contrato_id, evento, por) values (c_a, 'gerado', 'teste'), (c_b, 'gerado', 'teste');
  insert into public.contratos_conversas (vendedor_id, canal) values (v_a, 'central'), (v_b, 'central');

  -- como vendedor A
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.contratos where numero in ('TESTE-A', 'TESTE-B');
  if n <> 1 then falhas := falhas || format(' A vê %s contratos de teste (esperado 1);', n); end if;
  select count(*) into n from public.contratos where numero = 'TESTE-B';
  if n <> 0 then falhas := falhas || ' A lê contrato de B;'; end if;
  select count(*) into n from public.contratos_eventos where contrato_id = c_b;
  if n <> 0 then falhas := falhas || ' A lê evento de B;'; end if;
  select count(*) into n from public.contratos_eventos where contrato_id = c_a;
  if n <> 1 then falhas := falhas || ' A não lê o próprio evento;'; end if;
  select count(*) into n from public.contratos_conversas where vendedor_id = v_b;
  if n <> 0 then falhas := falhas || ' A lê conversa de B;'; end if;
  select count(*) into n from public.contratos_conversas where vendedor_id = v_a;
  if n <> 1 then falhas := falhas || ' A não lê a própria conversa;'; end if;
  reset role;

  -- como vendedor B
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.contratos where numero = 'TESTE-A';
  if n <> 0 then falhas := falhas || ' B lê contrato de A;'; end if;
  select count(*) into n from public.contratos where numero = 'TESTE-B';
  if n <> 1 then falhas := falhas || ' B não lê o próprio contrato;'; end if;
  reset role;

  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA:%', falhas; end if;
  raise exception 'OK: cada vendedor lê só os próprios contratos, eventos e conversas';
end $$;

-- ═══ 2. admin lê tudo; marketing, analista e anônimo não leem nada ═══
do $$
declare
  v_a uuid; v_b uuid; v_adm uuid; v_mkt uuid; v_ana uuid; c_a uuid; c_b uuid; n int; t text; papel text; falhas text := '';
  tabs text[] := array['contratos', 'contratos_eventos', 'contratos_conversas', 'perfis_contrato'];
begin
  select id into v_a from auth.users where email = 'vendedor.a.teste@exemplo.com';
  select id into v_b from auth.users where email = 'vendedor.b.teste@exemplo.com';
  select id into v_adm from auth.users where email = 'admin.teste@exemplo.com';
  select id into v_mkt from auth.users where email = 'marketing.teste@exemplo.com';
  select id into v_ana from auth.users where email = 'analista.teste@exemplo.com';
  if v_a is null or v_b is null or v_adm is null or v_mkt is null or v_ana is null then
    raise exception 'Faltam usuários de teste (admin, vendedor A e B, marketing, analista)';
  end if;

  insert into public.contratos (numero, vendedor_id, vendedor_nome, cliente_razao_social, cliente_tipo_pessoa, cliente_documento,
                                valor_total_centavos, condicao_pagamento, dados, variaveis, modelo_id)
    values ('TESTE-A', v_a, 'Vendedor A', 'Cliente Teste A', 'PJ', '00000000000000', 100, 'a_vista', '{}', '{}', 'contrato-fiber')
    returning id into c_a;
  insert into public.contratos (numero, vendedor_id, vendedor_nome, cliente_razao_social, cliente_tipo_pessoa, cliente_documento,
                                valor_total_centavos, condicao_pagamento, dados, variaveis, modelo_id)
    values ('TESTE-B', v_b, 'Vendedor B', 'Cliente Teste B', 'PJ', '00000000000000', 100, 'a_vista', '{}', '{}', 'contrato-fiber')
    returning id into c_b;
  insert into public.contratos_eventos (contrato_id, evento, por) values (c_a, 'gerado', 'teste'), (c_b, 'gerado', 'teste');
  insert into public.contratos_conversas (vendedor_id, canal) values (v_a, 'central'), (v_b, 'central');
  insert into public.perfis_contrato (user_id, cpf) values (v_a, null) on conflict (user_id) do nothing;

  -- admin: enxerga as 2 linhas de teste em cada tabela (perfis_contrato: ao menos a de A)
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.contratos where numero in ('TESTE-A', 'TESTE-B');
  if n <> 2 then falhas := falhas || format(' admin vê %s de 2 contratos;', n); end if;
  select count(*) into n from public.contratos_eventos where contrato_id in (c_a, c_b);
  if n <> 2 then falhas := falhas || format(' admin vê %s de 2 eventos;', n); end if;
  select count(*) into n from public.contratos_conversas where vendedor_id in (v_a, v_b);
  if n <> 2 then falhas := falhas || format(' admin vê %s de 2 conversas;', n); end if;
  select count(*) into n from public.perfis_contrato where user_id = v_a;
  if n <> 1 then falhas := falhas || ' admin não lê perfis_contrato;'; end if;
  reset role;

  -- marketing e analista: 0 linhas em tudo
  foreach papel in array array['marketing', 'analista'] loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', case papel when 'marketing' then v_mkt else v_ana end, 'role', 'authenticated')::text, true);
    set local role authenticated;
    foreach t in array tabs loop
      execute format('select count(*) from public.%I', t) into n;
      if n <> 0 then falhas := falhas || format(' %s lê %s linha(s) de %s;', papel, n, t); end if;
    end loop;
    reset role;
  end loop;

  -- anônimo: sem acesso (permissão negada ou 0 linhas)
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  foreach t in array tabs loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      if n <> 0 then falhas := falhas || format(' anon lê %s linha(s) de %s;', n, t); end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform 1 from public.contrato_sequencias limit 1;
    falhas := falhas || ' anon lê contrato_sequencias;';
  exception when insufficient_privilege then null; end;
  reset role;

  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA:%', falhas; end if;
  raise exception 'OK: admin lê tudo; marketing, analista e anônimo não leem nada';
end $$;

-- ═══ 3. nenhum papel de usuário escreve (insert, update, delete) nas tabelas novas ═══
do $$
declare
  v_a uuid; v_adm uuid; v_mkt uuid; v_ana uuid; c_a uuid; papel text; t text; op text; v_sql text; v_aff int;
  falhas text := ''; inconc text := ''; bloqueios int := 0;
  tabs text[] := array['contratos', 'contratos_eventos', 'contratos_conversas', 'contrato_sequencias', 'canal_atualizacoes'];
  papeis text[] := array['vendedor', 'admin', 'marketing', 'analista', 'anon'];
begin
  select id into v_a from auth.users where email = 'vendedor.a.teste@exemplo.com';
  select id into v_adm from auth.users where email = 'admin.teste@exemplo.com';
  select id into v_mkt from auth.users where email = 'marketing.teste@exemplo.com';
  select id into v_ana from auth.users where email = 'analista.teste@exemplo.com';
  if v_a is null or v_adm is null or v_mkt is null or v_ana is null then raise exception 'Faltam usuários de teste'; end if;

  insert into public.contratos (numero, vendedor_id, vendedor_nome, cliente_razao_social, cliente_tipo_pessoa, cliente_documento,
                                valor_total_centavos, condicao_pagamento, dados, variaveis, modelo_id)
    values ('TESTE-A', v_a, 'Vendedor A', 'Cliente Teste A', 'PJ', '00000000000000', 100, 'a_vista', '{}', '{}', 'contrato-fiber')
    returning id into c_a;
  insert into public.contratos_eventos (contrato_id, evento, por) values (c_a, 'gerado', 'teste');
  insert into public.contratos_conversas (vendedor_id, canal) values (v_a, 'central');
  insert into public.canal_atualizacoes (canal, atualizacao_id) values ('teste', 'teste-1');

  foreach papel in array papeis loop
    if papel = 'anon' then
      perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    else
      perform set_config('request.jwt.claims', json_build_object('sub',
        case papel when 'vendedor' then v_a when 'admin' then v_adm when 'marketing' then v_mkt else v_ana end,
        'role', 'authenticated')::text, true);
    end if;
    foreach t in array tabs loop
      foreach op in array array['insert', 'update', 'delete'] loop
        v_sql := case op
          when 'insert' then format('insert into public.%I select * from public.%I limit 1', t, t)
          when 'update' then format('update public.%I set %s = %s', t,
            (select attname from pg_attribute where attrelid = format('public.%I', t)::regclass and attnum > 0 and not attisdropped order by attnum limit 1),
            (select attname from pg_attribute where attrelid = format('public.%I', t)::regclass and attnum > 0 and not attisdropped order by attnum limit 1))
          else format('delete from public.%I', t) end;
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
  raise exception 'OK: nenhum papel escreve nas tabelas novas (% tentativas bloqueadas). Inconclusivo:%', bloqueios, coalesce(nullif(inconc, ''), ' nenhum');
end $$;

-- ═══ 4. reservar_numero_contrato: negada a anon e authenticated (inclusive admin); permitida só ao servidor ═══
do $$
declare
  v_adm uuid; v_a uuid; falhas text := ''; antes int; depois int; n int;
begin
  select id into v_adm from auth.users where email = 'admin.teste@exemplo.com';
  select id into v_a from auth.users where email = 'vendedor.a.teste@exemplo.com';
  if v_adm is null or v_a is null then raise exception 'Faltam usuários de teste'; end if;

  -- privilégios declarados
  if has_function_privilege('anon', 'public.reservar_numero_contrato(int)', 'execute') then falhas := falhas || ' anon tem execute;'; end if;
  if has_function_privilege('authenticated', 'public.reservar_numero_contrato(int)', 'execute') then falhas := falhas || ' authenticated tem execute;'; end if;
  if not has_function_privilege('service_role', 'public.reservar_numero_contrato(int)', 'execute') then falhas := falhas || ' service_role SEM execute;'; end if;
  if not exists (select 1 from pg_proc p where p.oid = 'public.reservar_numero_contrato(int)'::regprocedure
                 and p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) then
    falhas := falhas || ' função sem security definer + search_path;';
  end if;

  select ultimo into antes from public.contrato_sequencias where ano = 0;

  -- chamada de verdade como anon
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin perform public.reservar_numero_contrato(0); falhas := falhas || ' anon executou;'; exception when insufficient_privilege then null; end;
  reset role;

  -- como admin logado
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.reservar_numero_contrato(0); falhas := falhas || ' admin (authenticated) executou;'; exception when insufficient_privilege then null; end;
  reset role;
  -- como vendedor logado
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.reservar_numero_contrato(0); falhas := falhas || ' vendedor executou;'; exception when insufficient_privilege then null; end;
  reset role;

  select ultimo into depois from public.contrato_sequencias where ano = 0;
  if depois is distinct from antes then falhas := falhas || format(' a sequência andou (%s -> %s);', antes, depois); end if;

  -- servidor (service_role) consegue
  set local role service_role;
  select public.reservar_numero_contrato(0) into n;
  reset role;
  if n is distinct from antes + 1 then falhas := falhas || format(' service_role recebeu %s (esperado %s);', n, antes + 1); end if;

  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA:%', falhas; end if;
  raise exception 'OK: só o servidor reserva número (sequência estava em %, tudo desfeito)', antes;
end $$;

-- ═══ 5. perfis_contrato: só admin lê e escreve ═══
do $$
declare
  v_a uuid; v_b uuid; v_adm uuid; v_mkt uuid; v_ana uuid; n int; papel text; falhas text := ''; v_aff int;
begin
  select id into v_a from auth.users where email = 'vendedor.a.teste@exemplo.com';
  select id into v_b from auth.users where email = 'vendedor.b.teste@exemplo.com';
  select id into v_adm from auth.users where email = 'admin.teste@exemplo.com';
  select id into v_mkt from auth.users where email = 'marketing.teste@exemplo.com';
  select id into v_ana from auth.users where email = 'analista.teste@exemplo.com';
  if v_a is null or v_b is null or v_adm is null or v_mkt is null or v_ana is null then raise exception 'Faltam usuários de teste'; end if;
  insert into public.perfis_contrato (user_id, cpf, contratos_liberado) values (v_a, '52998224725', true)
    on conflict (user_id) do update set cpf = '52998224725', contratos_liberado = true;

  foreach papel in array array['vendedor_a', 'vendedor_b', 'marketing', 'analista'] loop
    perform set_config('request.jwt.claims', json_build_object('sub',
      case papel when 'vendedor_a' then v_a when 'vendedor_b' then v_b when 'marketing' then v_mkt else v_ana end,
      'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.perfis_contrato;
    if n <> 0 then falhas := falhas || format(' %s lê %s linha(s);', papel, n); end if;
    begin
      update public.perfis_contrato set contratos_liberado = true, cpf = '11111111111';
      get diagnostics v_aff = row_count;
      if v_aff > 0 then falhas := falhas || format(' %s atualizou %s linha(s);', papel, v_aff); end if;
    exception when others then if sqlstate <> '42501' then falhas := falhas || format(' %s update[%s];', papel, sqlstate); end if; end;
    begin
      insert into public.perfis_contrato (user_id, contratos_liberado) values (v_b, true);
      falhas := falhas || format(' %s inseriu;', papel);
    exception when others then if sqlstate not in ('42501', '23505') then falhas := falhas || format(' %s insert[%s];', papel, sqlstate); end if; end;
    begin
      delete from public.perfis_contrato;
      get diagnostics v_aff = row_count;
      if v_aff > 0 then falhas := falhas || format(' %s apagou %s linha(s);', papel, v_aff); end if;
    exception when others then if sqlstate <> '42501' then falhas := falhas || format(' %s delete[%s];', papel, sqlstate); end if; end;
    reset role;
  end loop;

  -- admin lê e escreve
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.perfis_contrato where user_id = v_a;
  if n <> 1 then falhas := falhas || ' admin não lê;'; end if;
  begin
    update public.perfis_contrato set celular = '14999990000' where user_id = v_a;
    get diagnostics v_aff = row_count;
    if v_aff <> 1 then falhas := falhas || ' admin não atualiza;'; end if;
    insert into public.perfis_contrato (user_id, contratos_liberado) values (v_b, false);
  exception when others then falhas := falhas || format(' admin escrita falhou[%s];', sqlstate); end;
  reset role;

  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA:%', falhas; end if;
  raise exception 'OK: perfis_contrato é lido e escrito só pelo admin';
end $$;

-- ═══ 6. auditoria das tabelas novas e do Storage ═══
do $$
declare
  t text; falhas text := ''; n int;
  novas text[] := array['contrato_sequencias', 'contratos', 'contratos_eventos', 'contratos_conversas', 'canal_atualizacoes', 'perfis_contrato'];
begin
  foreach t in array novas loop
    if not exists (select 1 from pg_class c join pg_namespace s on s.oid = c.relnamespace
                   where s.nspname = 'public' and c.relname = t and c.relrowsecurity) then
      falhas := falhas || format(' %s sem RLS;', t);
    end if;
    -- policies restritivas do analista
    select count(*) into n from pg_policies
      where schemaname = 'public' and tablename = t and permissive = 'RESTRICTIVE'
        and policyname in ('analista_no_insert', 'analista_no_update', 'analista_no_delete');
    if n <> 3 then falhas := falhas || format(' %s com %s de 3 policies restritivas do analista;', t, n); end if;
    -- anon sem nenhum privilégio; authenticated sem truncate/references/trigger
    if has_table_privilege('anon', format('public.%I', t), 'select,insert,update,delete,truncate,references,trigger') then
      falhas := falhas || format(' anon tem privilégio em %s;', t);
    end if;
    if has_table_privilege('authenticated', format('public.%I', t), 'truncate') or
       has_table_privilege('authenticated', format('public.%I', t), 'references') or
       has_table_privilege('authenticated', format('public.%I', t), 'trigger') then
      falhas := falhas || format(' authenticated com truncate/references/trigger em %s;', t);
    end if;
  end loop;

  -- sequência e canal: nenhuma policy, nenhum privilégio para usuário logado
  foreach t in array array['contrato_sequencias', 'canal_atualizacoes'] loop
    select count(*) into n from pg_policies where schemaname = 'public' and tablename = t and permissive = 'PERMISSIVE';
    if n <> 0 then falhas := falhas || format(' %s tem policy permissiva;', t); end if;
    if has_table_privilege('authenticated', format('public.%I', t), 'select,insert,update,delete') then
      falhas := falhas || format(' authenticated tem privilégio em %s;', t);
    end if;
  end loop;

  -- contratos, eventos, conversas: nenhuma policy permissiva de escrita e nenhum privilégio de escrita
  foreach t in array array['contratos', 'contratos_eventos', 'contratos_conversas'] loop
    select count(*) into n from pg_policies
      where schemaname = 'public' and tablename = t and permissive = 'PERMISSIVE' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');
    if n <> 0 then falhas := falhas || format(' %s tem policy permissiva de escrita;', t); end if;
    if has_table_privilege('authenticated', format('public.%I', t), 'insert,update,delete') then
      falhas := falhas || format(' authenticated com privilégio de escrita em %s;', t);
    end if;
  end loop;

  -- buckets existem, são privados e não há policy de storage que os cite
  select count(*) into n from storage.buckets where id in ('modelos-contrato', 'contratos') and not public;
  if n <> 2 then falhas := falhas || ' buckets modelos-contrato/contratos ausentes ou públicos;'; end if;
  select count(*) into n from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') ilike '%modelos-contrato%' or coalesce(with_check, '') ilike '%modelos-contrato%'
        or coalesce(qual, '') like '%''contratos''%' or coalesce(with_check, '') like '%''contratos''%');
  if n <> 0 then falhas := falhas || format(' %s policy(ies) de storage citam os buckets de contratos;', n); end if;
  -- a restritiva do analista também cobre storage.objects
  select count(*) into n from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and permissive = 'RESTRICTIVE'
      and policyname in ('analista_no_insert', 'analista_no_update', 'analista_no_delete');
  if n <> 3 then falhas := falhas || ' storage.objects sem as 3 policies restritivas do analista;'; end if;

  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA (auditoria):%', falhas; end if;
  raise exception 'OK: auditoria das % tabelas novas e dos buckets de contratos', array_length(novas, 1);
end $$;

-- ═══ 7. regressão dos papéis que já existem (a migração 012 não pode ter afrouxado nada) ═══
-- Rode também os blocos de 011_analista_testes.sql e as demais suítes (006 a 010) depois desta migração.
do $$
declare
  v_a uuid; v_mkt uuid; v_ana uuid; n int; n_priv int; falhas text := ''; v_aff int;
begin
  select id into v_a from auth.users where email = 'vendedor.a.teste@exemplo.com';
  select id into v_mkt from auth.users where email = 'marketing.teste@exemplo.com';
  select id into v_ana from auth.users where email = 'analista.teste@exemplo.com';
  if v_a is null or v_mkt is null or v_ana is null then raise exception 'Faltam usuários de teste'; end if;

  -- analista segue lendo tarefas e perfis como antes...
  select count(*) into n_priv from public.tasks;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ana, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.tasks;
  if n <> n_priv then falhas := falhas || format(' analista vê %s de %s tarefas;', n, n_priv); end if;
  -- ...e continua sem escrever
  begin
    update public.tasks set title = title;
    get diagnostics v_aff = row_count;
    if v_aff > 0 then falhas := falhas || ' analista atualizou tarefas;'; end if;
  exception when others then null; end;
  select count(*) into n from public.michele_atendimentos;
  if n <> 0 then falhas := falhas || ' analista lê Michele;'; end if;
  reset role;

  -- vendedor continua vendo só as próprias tarefas
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.tasks where assigned_to <> v_a and created_by <> v_a;
  if n <> 0 then falhas := falhas || format(' vendedor vê %s tarefas alheias;', n); end if;
  select count(*) into n from public.michele_atendimentos;
  if n <> 0 then falhas := falhas || ' vendedor lê Michele;'; end if;
  reset role;

  -- marketing continua sem Michele nem tarefas de vendedor
  perform set_config('request.jwt.claims', json_build_object('sub', v_mkt, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.michele_atendimentos;
  if n <> 0 then falhas := falhas || ' marketing lê Michele;'; end if;
  reset role;

  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA (regressão):%', falhas; end if;
  raise exception 'OK: papéis existentes seguem como antes (analista leitura, vendedor restrito, marketing sem Michele)';
end $$;
