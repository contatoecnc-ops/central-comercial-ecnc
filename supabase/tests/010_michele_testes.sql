-- Testes da migração 010 (módulo Michele IA).
-- Rode UM BLOCO POR VEZ no SQL Editor do Supabase. Cada bloco termina em erro de propósito
-- ("OK: ..." ou "FALHA DE SEGURANÇA: ..."), o que desfaz tudo: nada fica gravado.
--
-- Pré-requisitos (todos ativos): admin, marketing e vendedor de teste. Troque os e-mails:
--   admin.teste@exemplo.com · marketing.teste@exemplo.com · vendedor.teste@exemplo.com
--
-- Os blocos 1 a 4 e 9 a 10 são de segurança (RLS, grants, função de relatório). Os blocos 5 a 8 e 11 testam a função de ingestão.

-- ═══ 1. admin lê michele_atendimentos e michele_mensagens ═══
do $$
declare v_admin uuid; n_a int; n_m int;
begin
  select id into v_admin from auth.users where email = 'admin.teste@exemplo.com';
  if v_admin is null then raise exception 'Admin de teste não encontrado'; end if;
  perform public.michele_ingest(jsonb_build_object(
    'sessao_id', '5500000000001:t1', 'telefone', '5500000000001',
    'mensagens', jsonb_build_array(jsonb_build_object('ordem', 0, 'papel', 'lead', 'texto', 'oi'))));
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n_a from public.michele_atendimentos;
  select count(*) into n_m from public.michele_mensagens;
  reset role;
  if n_a < 1 or n_m < 1 then raise exception 'FALHA FUNCIONAL: admin não leu (atendimentos %, mensagens %)', n_a, n_m; end if;
  raise exception 'OK: admin lê atendimentos (%) e mensagens (%)', n_a, n_m;
end $$;

-- ═══ 2. marketing e vendedor leem as duas tabelas: 0 linhas ═══
do $$
declare u record; n_a int; n_m int; falhas text := '';
begin
  perform public.michele_ingest(jsonb_build_object(
    'sessao_id', '5500000000002:t2', 'telefone', '5500000000002',
    'mensagens', jsonb_build_array(jsonb_build_object('ordem', 0, 'papel', 'lead', 'texto', 'oi'))));
  for u in select id, email from auth.users
           where email in ('marketing.teste@exemplo.com', 'vendedor.teste@exemplo.com') loop
    perform set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n_a from public.michele_atendimentos;
    select count(*) into n_m from public.michele_mensagens;
    reset role;
    if n_a <> 0 or n_m <> 0 then falhas := falhas || format(' %s vê %s atendimentos e %s mensagens;', u.email, n_a, n_m); end if;
  end loop;
  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA:%', falhas; end if;
  raise exception 'OK: marketing e vendedor veem 0 linhas nas duas tabelas';
end $$;

-- ═══ 3. authenticated e anon não fazem insert, update nem delete nas duas tabelas ═══
do $$
declare
  v_admin uuid; v_id uuid; r text; op text; blocked boolean; falhas text := '';
  ops text[];
begin
  select id into v_admin from auth.users where email = 'admin.teste@exemplo.com';
  if v_admin is null then raise exception 'Admin de teste não encontrado'; end if;
  v_id := public.michele_ingest(jsonb_build_object(
    'sessao_id', '5500000000003:t3', 'telefone', '5500000000003',
    'mensagens', jsonb_build_array(jsonb_build_object('ordem', 0, 'papel', 'lead', 'texto', 'oi'))));
  ops := array[
    'insert into public.michele_atendimentos (sessao_id, telefone) values (''x:t'', ''5500000000009'')',
    'update public.michele_atendimentos set nome = ''x''',
    'delete from public.michele_atendimentos',
    format('insert into public.michele_mensagens (atendimento_id, ordem, papel, texto) values (%L, 99, ''lead'', ''x'')', v_id),
    'update public.michele_mensagens set texto = ''x''',
    'delete from public.michele_mensagens'
  ];
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  foreach r in array array['authenticated', 'anon'] loop
    foreach op in array ops loop
      blocked := false;
      begin
        execute format('set local role %I', r);
        execute op;
      exception when others then
        blocked := true;
      end;
      reset role;
      if not blocked then falhas := falhas || format(' %s executou [%s];', r, left(op, 40)); end if;
    end loop;
  end loop;
  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA:%', falhas; end if;
  raise exception 'OK: insert, update e delete bloqueados para authenticated (admin) e anon nas duas tabelas';
end $$;

-- ═══ 4. michele_ingest: anon e authenticated bloqueados; service_role permitido ═══
do $$
declare
  v_admin uuid; r text; blocked boolean; falhas text := ''; p jsonb;
begin
  select id into v_admin from auth.users where email = 'admin.teste@exemplo.com';
  if v_admin is null then raise exception 'Admin de teste não encontrado'; end if;
  p := jsonb_build_object('sessao_id', '5500000000004:t4', 'telefone', '5500000000004');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  foreach r in array array['authenticated', 'anon'] loop
    blocked := false;
    begin
      execute format('set local role %I', r);
      perform public.michele_ingest(p);
    exception when insufficient_privilege then
      blocked := true;
    end;
    reset role;
    if not blocked then falhas := falhas || ' ' || r || ' executou michele_ingest;'; end if;
  end loop;
  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA:%', falhas; end if;
  begin
    set local role service_role;
    perform public.michele_ingest(p);
  exception when others then
    reset role;
    raise exception 'FALHA FUNCIONAL: service_role não executou michele_ingest (%)', sqlerrm;
  end;
  reset role;
  raise exception 'OK: anon e authenticated bloqueados; service_role executa michele_ingest';
end $$;

-- ═══ 5. mesmo payload duas vezes: um atendimento, mensagens sem duplicar ═══
do $$
declare p jsonb; n_a int; n_m int;
begin
  p := jsonb_build_object(
    'sessao_id', '5500000000005:t5', 'telefone', '5500000000005', 'nome', 'Teste',
    'mensagens', jsonb_build_array(
      jsonb_build_object('ordem', 0, 'papel', 'lead', 'texto', 'oi', 'enviada_em', '2026-10-21T22:00:00Z'),
      jsonb_build_object('ordem', 1, 'papel', 'michele', 'texto', 'olá', 'enviada_em', '2026-10-21T22:00:05Z')));
  set local role service_role;
  perform public.michele_ingest(p);
  perform public.michele_ingest(p);
  reset role;
  select count(*) into n_a from public.michele_atendimentos where sessao_id = '5500000000005:t5';
  select count(*) into n_m from public.michele_mensagens m join public.michele_atendimentos a on a.id = m.atendimento_id
   where a.sessao_id = '5500000000005:t5';
  if n_a <> 1 or n_m <> 2 then raise exception 'FALHA FUNCIONAL: % atendimentos e % mensagens (esperado 1 e 2)', n_a, n_m; end if;
  if (select ultima_mensagem_em from public.michele_atendimentos where sessao_id = '5500000000005:t5') <> '2026-10-21T22:00:05Z'::timestamptz then
    raise exception 'FALHA FUNCIONAL: ultima_mensagem_em errada';
  end if;
  raise exception 'OK: 1 atendimento, 2 mensagens, ultima_mensagem_em correta após repetir o payload';
end $$;

-- ═══ 6. campos null depois de campos preenchidos: valores preservados ═══
do $$
declare a public.michele_atendimentos;
begin
  set local role service_role;
  perform public.michele_ingest(jsonb_build_object(
    'sessao_id', '5500000000006:t6', 'telefone', '5500000000006', 'nome', 'Edmar', 'origem', 'whatsapp',
    'campanha', 'Camp X', 'score', 80, 'temperatura', 'lead-quente', 'prioridade', true, 'segmento', 'Gráfica',
    'budget', 'Faixa 2 (R$20k-28k)', 'momento_compra', 'agora', 'produto_provavel', 'Fiber 3015',
    'resumo', jsonb_build_object('a', 1), 'kommo_lead_id', 123));
  perform public.michele_ingest(jsonb_build_object(
    'sessao_id', '5500000000006:t6', 'telefone', '5500000000006', 'nome', null, 'origem', null, 'campanha', null,
    'score', null, 'temperatura', null, 'prioridade', false, 'segmento', null, 'budget', null, 'momento_compra', null,
    'produto_provavel', null, 'resumo', null, 'kommo_lead_id', null, 'status', null));
  reset role;
  select * into a from public.michele_atendimentos where sessao_id = '5500000000006:t6';
  if a.nome is distinct from 'Edmar' or a.origem is distinct from 'whatsapp' or a.campanha is distinct from 'Camp X'
     or a.score is distinct from 80 or a.temperatura is distinct from 'lead-quente' or a.prioridade is distinct from true
     or a.segmento is distinct from 'Gráfica' or a.budget is distinct from 'Faixa 2 (R$20k-28k)'
     or a.momento_compra is distinct from 'agora' or a.produto_provavel is distinct from 'Fiber 3015'
     or a.resumo is distinct from jsonb_build_object('a', 1) or a.kommo_lead_id is distinct from 123 then
    raise exception 'FALHA FUNCIONAL: algum valor foi sobrescrito por null: %', to_jsonb(a);
  end if;
  raise exception 'OK: campos null não sobrescrevem valores já gravados (prioridade true também preservada)';
end $$;

-- ═══ 7. qualificado seguido de em_andamento continua qualificado ═══
do $$
declare a public.michele_atendimentos;
begin
  set local role service_role;
  perform public.michele_ingest(jsonb_build_object('sessao_id', '5500000000007:t7', 'telefone', '5500000000007', 'status', 'qualificado'));
  perform public.michele_ingest(jsonb_build_object('sessao_id', '5500000000007:t7', 'telefone', '5500000000007', 'status', 'em_andamento'));
  reset role;
  select * into a from public.michele_atendimentos where sessao_id = '5500000000007:t7';
  if a.status <> 'qualificado' then raise exception 'FALHA FUNCIONAL: status regrediu para %', a.status; end if;
  if a.encerrado_em is null then raise exception 'FALHA FUNCIONAL: encerrado_em não foi preenchido'; end if;
  raise exception 'OK: status continua qualificado e encerrado_em preenchido';
end $$;

-- ═══ 8. CPF de 11 dígitos entra mascarado; CNPJ completo; formato estranho descartado ═══
do $$
declare cpf1 text; cpf2 text; cnpj text; outro text; mascarado text;
begin
  set local role service_role;
  perform public.michele_ingest(jsonb_build_object('sessao_id', '5500000000008:a', 'telefone', '5500000000008', 'cnpj_cpf', '123.456.789-09'));
  perform public.michele_ingest(jsonb_build_object('sessao_id', '5500000000008:b', 'telefone', '5500000000008', 'cnpj_cpf', '12345678909'));
  perform public.michele_ingest(jsonb_build_object('sessao_id', '5500000000008:c', 'telefone', '5500000000008', 'cnpj_cpf', '12.345.678/0001-95'));
  perform public.michele_ingest(jsonb_build_object('sessao_id', '5500000000008:d', 'telefone', '5500000000008', 'cnpj_cpf', '123456'));
  perform public.michele_ingest(jsonb_build_object('sessao_id', '5500000000008:a', 'telefone', '5500000000008', 'cnpj_cpf', '***.456.789-**'));
  reset role;
  select cnpj_cpf into cpf1 from public.michele_atendimentos where sessao_id = '5500000000008:a';
  select cnpj_cpf into cpf2 from public.michele_atendimentos where sessao_id = '5500000000008:b';
  select cnpj_cpf into cnpj from public.michele_atendimentos where sessao_id = '5500000000008:c';
  select cnpj_cpf into outro from public.michele_atendimentos where sessao_id = '5500000000008:d';
  mascarado := '***.456.789-**';
  if cpf1 is distinct from mascarado or cpf2 is distinct from mascarado then
    raise exception 'FALHA DE SEGURANÇA: CPF gravado sem máscara (% / %)', cpf1, cpf2;
  end if;
  if cnpj is distinct from '12345678000195' then raise exception 'FALHA FUNCIONAL: CNPJ gravado como %', cnpj; end if;
  if outro is not null then raise exception 'FALHA FUNCIONAL: documento de tamanho inválido foi gravado (%)', outro; end if;
  raise exception 'OK: CPF mascarado (%), CNPJ completo, formato inválido descartado', cpf1;
end $$;

-- ═══ 9. michele_relatorio: admin executa; marketing, vendedor e anon são barrados ═══
do $$
declare u record; r jsonb; blocked boolean; falhas text := ''; v_admin uuid;
begin
  select id into v_admin from auth.users where email = 'admin.teste@exemplo.com';
  if v_admin is null then raise exception 'Admin de teste não encontrado'; end if;
  perform public.michele_ingest(jsonb_build_object('sessao_id', '5500000000010:t9', 'telefone', '5500000000010'));
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.michele_relatorio(now() - interval '1 day', now() + interval '1 day');
  reset role;
  if (r->'funil'->>'iniciaram')::int < 1 then raise exception 'FALHA FUNCIONAL: relatório do admin sem dados: %', r; end if;
  for u in select id, email from auth.users where email in ('marketing.teste@exemplo.com', 'vendedor.teste@exemplo.com') loop
    perform set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    blocked := false;
    begin
      set local role authenticated;
      perform public.michele_relatorio(now() - interval '1 day', now() + interval '1 day');
    exception when others then
      blocked := true;
    end;
    reset role;
    if not blocked then falhas := falhas || ' ' || u.email || ' executou o relatório;'; end if;
  end loop;
  blocked := false;
  begin
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    set local role anon;
    perform public.michele_relatorio(now() - interval '1 day', now() + interval '1 day');
  exception when others then
    blocked := true;
  end;
  reset role;
  if not blocked then falhas := falhas || ' anon executou o relatório;'; end if;
  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA:%', falhas; end if;
  raise exception 'OK: relatório só para admin';
end $$;

-- ═══ 10. view v_michele_atendimentos: admin vê; marketing e vendedor veem 0 linhas ═══
do $$
declare u record; n int; v_admin uuid; falhas text := '';
begin
  select id into v_admin from auth.users where email = 'admin.teste@exemplo.com';
  if v_admin is null then raise exception 'Admin de teste não encontrado'; end if;
  perform public.michele_ingest(jsonb_build_object('sessao_id', '5500000000011:t10', 'telefone', '5500000000011'));
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.v_michele_atendimentos;
  reset role;
  if n < 1 then raise exception 'FALHA FUNCIONAL: admin não vê a view'; end if;
  for u in select id, email from auth.users where email in ('marketing.teste@exemplo.com', 'vendedor.teste@exemplo.com') loop
    perform set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.v_michele_atendimentos;
    reset role;
    if n <> 0 then falhas := falhas || format(' %s vê %s linhas;', u.email, n); end if;
  end loop;
  if falhas <> '' then raise exception 'FALHA DE SEGURANÇA:%', falhas; end if;
  raise exception 'OK: view visível só para admin';
end $$;

-- ═══ 11. abandonado é calculado na consulta, não gravado ═══
do $$
declare a record;
begin
  perform public.michele_ingest(jsonb_build_object(
    'sessao_id', '5500000000012:t11', 'telefone', '5500000000012',
    'iniciado_em', to_char(now() - interval '2 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'mensagens', jsonb_build_array(jsonb_build_object('ordem', 0, 'papel', 'lead', 'texto', 'oi',
                 'enviada_em', to_char(now() - interval '2 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))));
  select status, status_efetivo into a from public.v_michele_atendimentos where sessao_id = '5500000000012:t11';
  if a.status <> 'em_andamento' or a.status_efetivo <> 'abandonado' then
    raise exception 'FALHA FUNCIONAL: status % / efetivo %', a.status, a.status_efetivo;
  end if;
  raise exception 'OK: gravado como em_andamento, exibido como abandonado';
end $$;
