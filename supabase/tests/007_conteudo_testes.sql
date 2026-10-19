-- Testes de segurança da migração 007 (central de conteúdo).
-- Rode UM BLOCO POR VEZ no SQL Editor do Supabase. Cada bloco termina em erro de propósito
-- ("OK: ..." ou "FALHA DE SEGURANÇA: ..."), o que desfaz tudo: nada fica gravado.
--
-- Pré-requisitos: um admin, um marketing e um vendedor de teste, todos ativos.
-- Troque os e-mails no início de cada bloco.

-- ═══ 1. marketing não vai de em_aprovacao para aprovado ═══
do $$
declare v_m uuid; v_id uuid := gen_random_uuid(); blocked boolean := false;
begin
  select id into v_m from auth.users where email = 'marketing.teste@exemplo.com';
  if v_m is null then raise exception 'Marketing de teste não encontrado'; end if;
  insert into public.content_items (id, title, status, created_by) values (v_id, 'Teste', 'em_aprovacao', v_m);
  perform set_config('request.jwt.claims', json_build_object('sub', v_m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.content_items set status = 'aprovado' where id = v_id;
  exception when others then
    blocked := true;
  end;
  reset role;
  if not blocked then raise exception 'FALHA DE SEGURANÇA: marketing aprovou conteúdo'; end if;
  raise exception 'OK: marketing não aprova (em_aprovacao → aprovado)';
end $$;

-- ═══ 2. marketing não vai de em_producao direto para aprovado ═══
do $$
declare v_m uuid; v_id uuid := gen_random_uuid(); blocked boolean := false;
begin
  select id into v_m from auth.users where email = 'marketing.teste@exemplo.com';
  if v_m is null then raise exception 'Marketing de teste não encontrado'; end if;
  insert into public.content_items (id, title, status, created_by) values (v_id, 'Teste', 'em_producao', v_m);
  perform set_config('request.jwt.claims', json_build_object('sub', v_m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.content_items set status = 'aprovado' where id = v_id;
  exception when others then
    blocked := true;
  end;
  reset role;
  if not blocked then raise exception 'FALHA DE SEGURANÇA: marketing pulou para aprovado'; end if;
  raise exception 'OK: em_producao → aprovado direto é bloqueado';
end $$;

-- ═══ 3. admin aprova (preenche approved_by/at); reabrir limpa os dois ═══
do $$
declare v_a uuid; v_m uuid; v_id uuid := gen_random_uuid(); r public.content_items;
begin
  select id into v_a from auth.users where email = 'admin.teste@exemplo.com';
  select id into v_m from auth.users where email = 'marketing.teste@exemplo.com';
  if v_a is null or v_m is null then raise exception 'Admin ou marketing de teste não encontrado'; end if;
  insert into public.content_items (id, title, status, created_by) values (v_id, 'Teste', 'em_aprovacao', v_m);
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.approve_content(v_id, 'ok');
  select * into r from public.content_items where id = v_id;
  if r.status <> 'aprovado' or r.approved_by is distinct from v_a or r.approved_at is null then
    reset role;
    raise exception 'FALHA: aprovação não preencheu status/approved_by/approved_at';
  end if;
  perform public.set_content_status(v_id, 'em_producao', null);
  select * into r from public.content_items where id = v_id;
  reset role;
  if r.approved_by is not null or r.approved_at is not null then
    raise exception 'FALHA: reabrir não limpou approved_by/approved_at';
  end if;
  raise exception 'OK: aprovar preenche approved_by/at e reabrir limpa os dois';
end $$;

-- ═══ 4. ajustes sem comentário é recusado ═══
do $$
declare v_a uuid; v_m uuid; v_id uuid := gen_random_uuid(); blocked1 boolean := false; blocked2 boolean := false;
begin
  select id into v_a from auth.users where email = 'admin.teste@exemplo.com';
  select id into v_m from auth.users where email = 'marketing.teste@exemplo.com';
  if v_a is null or v_m is null then raise exception 'Admin ou marketing de teste não encontrado'; end if;
  insert into public.content_items (id, title, status, created_by) values (v_id, 'Teste', 'em_aprovacao', v_m);
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.request_changes(v_id, '   '); exception when others then blocked1 := true; end;
  begin update public.content_items set status = 'ajustes' where id = v_id; exception when others then blocked2 := true; end;
  reset role;
  if not (blocked1 and blocked2) then
    raise exception 'FALHA DE SEGURANÇA: ajustes aceito sem comentário (rpc bloqueada=%, update direto bloqueado=%)', blocked1, blocked2;
  end if;
  raise exception 'OK: ajustes exige comentário';
end $$;

-- ═══ 5. vendedor não lê content_items, content_files nem content_events ═══
do $$
declare v_s uuid; v_m uuid; v_id uuid := gen_random_uuid(); a int; b int; c int;
begin
  select id into v_s from auth.users where email = 'vendedor.teste@exemplo.com';
  select id into v_m from auth.users where email = 'marketing.teste@exemplo.com';
  if v_s is null or v_m is null then raise exception 'Vendedor ou marketing de teste não encontrado'; end if;
  insert into public.content_items (id, title, status, created_by) values (v_id, 'Teste', 'ideia', v_m);
  insert into public.content_files (content_id, storage_path, file_name, kind)
    values (v_id, v_id::text || '/a.png', 'a.png', 'arte');
  perform set_config('request.jwt.claims', json_build_object('sub', v_s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into a from public.content_items;
  select count(*) into b from public.content_files;
  select count(*) into c from public.content_events;
  reset role;
  if a + b + c > 0 then
    raise exception 'FALHA DE SEGURANÇA: vendedor leu items=%, files=%, events=%', a, b, c;
  end if;
  raise exception 'OK: vendedor vê 0 linhas nas três tabelas de conteúdo';
end $$;

-- ═══ 6. marketing não edita o título de item aprovado ═══
do $$
declare v_m uuid; v_id uuid := gen_random_uuid(); blocked boolean := false;
begin
  select id into v_m from auth.users where email = 'marketing.teste@exemplo.com';
  if v_m is null then raise exception 'Marketing de teste não encontrado'; end if;
  insert into public.content_items (id, title, status, created_by) values (v_id, 'Teste', 'aprovado', v_m);
  perform set_config('request.jwt.claims', json_build_object('sub', v_m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.content_items set title = 'alterado' where id = v_id;
  exception when others then
    blocked := true;
  end;
  reset role;
  if not blocked then raise exception 'FALHA DE SEGURANÇA: título de item aprovado foi alterado'; end if;
  raise exception 'OK: item aprovado está travado';
end $$;

-- ═══ 7. evento de status falsificado pelo cliente ═══
do $$
declare v_m uuid; v_id uuid := gen_random_uuid(); blocked boolean := false; ok_comment boolean := true;
begin
  select id into v_m from auth.users where email = 'marketing.teste@exemplo.com';
  if v_m is null then raise exception 'Marketing de teste não encontrado'; end if;
  insert into public.content_items (id, title, status, created_by) values (v_id, 'Teste', 'em_aprovacao', v_m);
  perform set_config('request.jwt.claims', json_build_object('sub', v_m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.content_events (content_id, actor_id, event_type, from_status, to_status)
    values (v_id, v_m, 'status_change', 'em_aprovacao', 'aprovado');
  exception when others then
    blocked := true;
  end;
  begin
    insert into public.content_events (content_id, actor_id, event_type, body) values (v_id, v_m, 'comment', 'comentário legítimo');
  exception when others then
    ok_comment := false;
  end;
  reset role;
  if not blocked then raise exception 'FALHA DE SEGURANÇA: cliente gravou evento status_change'; end if;
  if not ok_comment then raise exception 'FALHA FUNCIONAL: comentário legítimo foi recusado'; end if;
  raise exception 'OK: status_change falsificado é bloqueado e comentário próprio é aceito';
end $$;
