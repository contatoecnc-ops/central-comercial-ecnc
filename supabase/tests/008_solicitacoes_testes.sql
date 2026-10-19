-- Testes de segurança da migração 008 (prioridade e solicitações de material).
-- Rode UM BLOCO POR VEZ no SQL Editor do Supabase. Cada bloco termina em erro de propósito
-- ("OK: ..." ou "FALHA DE SEGURANÇA: ..."), o que desfaz tudo: nada fica gravado.
--
-- Pré-requisitos (todos ativos): admin, marketing e DOIS vendedores de teste.
-- Troque os e-mails no início de cada bloco:
--   admin.teste@exemplo.com · marketing.teste@exemplo.com
--   vendedor.teste@exemplo.com · vendedor2.teste@exemplo.com

-- ═══ 1. vendedor cria solicitação própria; em nome de outro é bloqueado ═══
do $$
declare v_a uuid; v_b uuid; blocked boolean := false;
begin
  select id into v_a from auth.users where email = 'vendedor.teste@exemplo.com';
  select id into v_b from auth.users where email = 'vendedor2.teste@exemplo.com';
  if v_a is null or v_b is null then raise exception 'Vendedores de teste não encontrados'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.content_requests (requested_by, title, description, request_type)
    values (v_a, 'Meu pedido', 'Descrição', 'Vídeo');
  exception when others then
    reset role;
    raise exception 'FALHA FUNCIONAL: vendedor deveria criar solicitação própria (%)', sqlerrm;
  end;
  begin
    insert into public.content_requests (requested_by, title, description, request_type)
    values (v_b, 'Em nome de outro', 'Descrição', 'Vídeo');
  exception when others then
    blocked := true;
  end;
  reset role;
  if not blocked then raise exception 'FALHA DE SEGURANÇA: vendedor criou solicitação em nome de outro'; end if;
  raise exception 'OK: própria permitida, em nome de outro bloqueada';
end $$;

-- ═══ 2. vendedor não vai de nova para aprovada direto ═══
do $$
declare v_a uuid; v_id uuid := gen_random_uuid(); blocked boolean := false;
begin
  select id into v_a from auth.users where email = 'vendedor.teste@exemplo.com';
  if v_a is null then raise exception 'Vendedor de teste não encontrado'; end if;
  insert into public.content_requests (id, requested_by, title, description, request_type)
  values (v_id, v_a, 'Pedido', 'Descrição', 'Vídeo');
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.content_requests set status = 'aprovada' where id = v_id;
  exception when others then
    blocked := true;
  end;
  reset role;
  if not blocked then raise exception 'FALHA DE SEGURANÇA: vendedor aprovou a própria solicitação'; end if;
  raise exception 'OK: nova → aprovada direto é bloqueado';
end $$;

-- ═══ 3. vendedor não edita solicitação aprovada; cancela a própria nova ═══
do $$
declare v_a uuid; v_new uuid := gen_random_uuid(); v_done uuid := gen_random_uuid(); n int := 0; blocked boolean := false; st text;
begin
  select id into v_a from auth.users where email = 'vendedor.teste@exemplo.com';
  if v_a is null then raise exception 'Vendedor de teste não encontrado'; end if;
  insert into public.content_requests (id, requested_by, title, description, request_type)
  values (v_new, v_a, 'Nova', 'Descrição', 'Vídeo');
  insert into public.content_requests (id, requested_by, title, description, request_type, status)
  values (v_done, v_a, 'Aprovada', 'Descrição', 'Vídeo', 'aprovada');
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.content_requests set title = 'alterado' where id = v_done;
    get diagnostics n = row_count;
  exception when others then
    blocked := true;
  end;
  if not blocked and n > 0 then
    reset role;
    raise exception 'FALHA DE SEGURANÇA: vendedor editou solicitação aprovada';
  end if;
  begin
    perform public.cancel_request(v_new);
  exception when others then
    reset role;
    raise exception 'FALHA FUNCIONAL: vendedor deveria cancelar a própria nova (%)', sqlerrm;
  end;
  reset role;
  select status into st from public.content_requests where id = v_new;
  if st <> 'cancelada' then raise exception 'FALHA: cancelamento não gravou o status'; end if;
  raise exception 'OK: aprovada travada e cancelamento da própria nova funciona';
end $$;

-- ═══ 4. marketing não lê content_requests, request_files nem request_comments ═══
do $$
declare v_a uuid; v_m uuid; v_id uuid := gen_random_uuid(); a int; b int; c int;
begin
  select id into v_a from auth.users where email = 'vendedor.teste@exemplo.com';
  select id into v_m from auth.users where email = 'marketing.teste@exemplo.com';
  if v_a is null or v_m is null then raise exception 'Vendedor ou marketing de teste não encontrado'; end if;
  insert into public.content_requests (id, requested_by, title, description, request_type)
  values (v_id, v_a, 'Pedido', 'Descrição', 'Vídeo');
  insert into public.request_files (request_id, storage_path, file_name, mime_type, size_bytes)
  values (v_id, v_id::text || '/a.png', 'a.png', 'image/png', 100);
  insert into public.request_comments (request_id, author_id, body) values (v_id, v_a, 'oi');
  perform set_config('request.jwt.claims', json_build_object('sub', v_m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into a from public.content_requests;
  select count(*) into b from public.request_files;
  select count(*) into c from public.request_comments;
  reset role;
  if a + b + c > 0 then
    raise exception 'FALHA DE SEGURANÇA: marketing leu requests=%, files=%, comments=%', a, b, c;
  end if;
  raise exception 'OK: marketing vê 0 linhas das três tabelas de solicitação';
end $$;

-- ═══ 5. admin aprova: conteúdo criado; solicitação aprovada; segunda chamada recusada ═══
do $$
declare v_a uuid; v_ad uuid; v_m uuid; v_id uuid := gen_random_uuid(); v_c uuid; ci public.content_items; rq public.content_requests; blocked boolean := false;
begin
  select id into v_a from auth.users where email = 'vendedor.teste@exemplo.com';
  select id into v_ad from auth.users where email = 'admin.teste@exemplo.com';
  select id into v_m from auth.users where email = 'marketing.teste@exemplo.com';
  if v_a is null or v_ad is null or v_m is null then raise exception 'Usuários de teste não encontrados'; end if;
  insert into public.content_requests (id, requested_by, title, description, request_type)
  values (v_id, v_a, 'Pedido', 'Descrição', 'Vídeo');
  insert into public.request_files (request_id, storage_path, file_name, mime_type, size_bytes)
  values (v_id, v_id::text || '/ref.png', 'ref.png', 'image/png', 100);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_c := public.approve_request(v_id, 'Título ajustado', 'Descrição ajustada', 'urgente', v_m, null, 'ok');
  select * into ci from public.content_items where id = v_c;
  select * into rq from public.content_requests where id = v_id;
  begin
    perform public.approve_request(v_id, 'Outra vez', 'Descrição', 'media', null, null, null);
  exception when others then
    blocked := true;
  end;
  reset role;
  if ci.status <> 'ideia' or ci.priority <> 'urgente' or ci.assigned_to is distinct from v_m or ci.source_label is null then
    raise exception 'FALHA: conteúdo criado incorreto (status=%, prioridade=%)', ci.status, ci.priority;
  end if;
  if rq.status <> 'aprovada' or rq.content_id is distinct from v_c or rq.decided_by is distinct from v_ad then
    raise exception 'FALHA: solicitação não ficou aprovada com content_id';
  end if;
  if (select count(*) from public.content_files where content_id = v_c and kind = 'referencia' and bucket = 'solicitacoes') <> 1 then
    raise exception 'FALHA: referência do vendedor não foi anexada ao conteúdo';
  end if;
  if not blocked then raise exception 'FALHA DE SEGURANÇA: segunda aprovação foi aceita'; end if;
  raise exception 'OK: aprovação cria conteúdo em ideia com prioridade e responsável; repetir é recusado';
end $$;

-- ═══ 5b. marketing e vendedor não chamam approve_request ═══
do $$
declare v_a uuid; v_m uuid; v_id uuid := gen_random_uuid(); b1 boolean := false; b2 boolean := false;
begin
  select id into v_a from auth.users where email = 'vendedor.teste@exemplo.com';
  select id into v_m from auth.users where email = 'marketing.teste@exemplo.com';
  if v_a is null or v_m is null then raise exception 'Usuários de teste não encontrados'; end if;
  insert into public.content_requests (id, requested_by, title, description, request_type)
  values (v_id, v_a, 'Pedido', 'Descrição', 'Vídeo');
  perform set_config('request.jwt.claims', json_build_object('sub', v_m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.approve_request(v_id, 'x', 'y', 'media', null, null, null); exception when others then b1 := true; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.approve_request(v_id, 'x', 'y', 'media', null, null, null); exception when others then b2 := true; end;
  reset role;
  if not (b1 and b2) then raise exception 'FALHA DE SEGURANÇA: marketing bloqueado=%, vendedor bloqueado=%', b1, b2; end if;
  raise exception 'OK: só o admin aprova solicitações';
end $$;

-- ═══ 6. reject_request sem motivo é recusado (e com motivo funciona) ═══
do $$
declare v_a uuid; v_ad uuid; v_id uuid := gen_random_uuid(); blocked boolean := false; st text;
begin
  select id into v_a from auth.users where email = 'vendedor.teste@exemplo.com';
  select id into v_ad from auth.users where email = 'admin.teste@exemplo.com';
  if v_a is null or v_ad is null then raise exception 'Usuários de teste não encontrados'; end if;
  insert into public.content_requests (id, requested_by, title, description, request_type)
  values (v_id, v_a, 'Pedido', 'Descrição', 'Vídeo');
  perform set_config('request.jwt.claims', json_build_object('sub', v_ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.reject_request(v_id, '   '); exception when others then blocked := true; end;
  perform public.reject_request(v_id, 'Fora do escopo');
  reset role;
  select status into st from public.content_requests where id = v_id;
  if not blocked then raise exception 'FALHA DE SEGURANÇA: recusa sem motivo foi aceita'; end if;
  if st <> 'recusada' then raise exception 'FALHA: recusa com motivo não gravou o status'; end if;
  raise exception 'OK: recusa exige motivo';
end $$;

-- ═══ 7. vendedor não lê content_*; vendedor não dono não vê a entrega de outro ═══
do $$
declare v_a uuid; v_b uuid; v_m uuid; v_c uuid := gen_random_uuid(); v_r uuid := gen_random_uuid();
        a1 int; a2 int; a3 int; b1 int;
begin
  select id into v_a from auth.users where email = 'vendedor.teste@exemplo.com';
  select id into v_b from auth.users where email = 'vendedor2.teste@exemplo.com';
  select id into v_m from auth.users where email = 'marketing.teste@exemplo.com';
  if v_a is null or v_b is null or v_m is null then raise exception 'Usuários de teste não encontrados'; end if;
  insert into public.content_items (id, title, status, created_by) values (v_c, 'Conteúdo', 'aprovado', v_m);
  insert into public.content_files (content_id, storage_path, file_name, kind, version)
    values (v_c, v_c::text || '/final.png', 'final.png', 'final', 1);
  insert into public.content_requests (id, requested_by, title, description, request_type, status, content_id)
    values (v_r, v_a, 'Pedido', 'Descrição', 'Vídeo', 'aprovada', v_c);

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into a1 from public.content_items;
  select count(*) into a2 from public.content_events;
  select count(*) into a3 from public.content_files where kind <> 'final';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into b1 from public.content_files;
  reset role;

  if a1 + a2 + a3 > 0 then
    raise exception 'FALHA DE SEGURANÇA: vendedor leu items=%, events=%, files não-final=%', a1, a2, a3;
  end if;
  if b1 > 0 then raise exception 'FALHA DE SEGURANÇA: vendedor que não é dono viu % arquivo(s) de outro', b1; end if;
  raise exception 'OK: vendedor não lê content_items/events; não dono não vê a entrega';
end $$;

-- ═══ 8. dono lê só "final" de conteúdo aprovado; não lê referencia/arte nem final ainda em produção ═══
do $$
declare v_a uuid; v_m uuid; v_c1 uuid := gen_random_uuid(); v_c2 uuid := gen_random_uuid();
        v_r1 uuid := gen_random_uuid(); v_r2 uuid := gen_random_uuid(); n_final int; n_other int; n_prod int; prog text;
begin
  select id into v_a from auth.users where email = 'vendedor.teste@exemplo.com';
  select id into v_m from auth.users where email = 'marketing.teste@exemplo.com';
  if v_a is null or v_m is null then raise exception 'Usuários de teste não encontrados'; end if;
  insert into public.content_items (id, title, status, created_by) values (v_c1, 'Pronto', 'aprovado', v_m);
  insert into public.content_files (content_id, storage_path, file_name, kind, version) values
    (v_c1, v_c1::text || '/f.png', 'f.png', 'final', 1),
    (v_c1, v_c1::text || '/r.png', 'r.png', 'referencia', 1),
    (v_c1, v_c1::text || '/a.png', 'a.png', 'arte', 1);
  insert into public.content_items (id, title, status, created_by) values (v_c2, 'Em produção', 'em_producao', v_m);
  insert into public.content_files (content_id, storage_path, file_name, kind, version)
    values (v_c2, v_c2::text || '/f.png', 'f.png', 'final', 1);
  insert into public.content_requests (id, requested_by, title, description, request_type, status, content_id) values
    (v_r1, v_a, 'P1', 'D', 'Vídeo', 'aprovada', v_c1),
    (v_r2, v_a, 'P2', 'D', 'Vídeo', 'aprovada', v_c2);

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n_final from public.content_files where content_id = v_c1 and kind = 'final';
  select count(*) into n_other from public.content_files where content_id = v_c1 and kind <> 'final';
  select count(*) into n_prod from public.content_files where content_id = v_c2;
  select progress into prog from public.my_requests_progress() where request_id = v_r2;
  reset role;

  if n_final <> 1 then raise exception 'FALHA FUNCIONAL: dono deveria ler 1 arquivo final de conteúdo aprovado (leu %)', n_final; end if;
  if n_other > 0 then raise exception 'FALHA DE SEGURANÇA: vendedor leu % arquivo(s) referencia/arte', n_other; end if;
  if n_prod > 0 then raise exception 'FALHA DE SEGURANÇA: vendedor leu final de conteúdo ainda em produção'; end if;
  if prog <> 'Em produção' then raise exception 'FALHA: andamento esperado "Em produção", veio "%"', prog; end if;
  raise exception 'OK: só o final de conteúdo aprovado/publicado chega ao dono';
end $$;

-- ═══ 9. prioridade: valor inválido recusado; marketing altera em item publicado; título continua travado ═══
do $$
declare v_m uuid; v_id uuid := gen_random_uuid(); bad boolean := false; locked boolean := false; p text;
begin
  select id into v_m from auth.users where email = 'marketing.teste@exemplo.com';
  if v_m is null then raise exception 'Marketing de teste não encontrado'; end if;
  insert into public.content_items (id, title, status, created_by) values (v_id, 'Publicado', 'publicado', v_m);
  begin
    update public.content_items set priority = 'altissima' where id = v_id;
  exception when others then
    bad := true;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.content_items set priority = 'urgente' where id = v_id;
  exception when others then
    reset role;
    raise exception 'FALHA FUNCIONAL: marketing deveria alterar prioridade de item publicado (%)', sqlerrm;
  end;
  begin
    update public.content_items set title = 'alterado' where id = v_id;
  exception when others then
    locked := true;
  end;
  reset role;
  select priority into p from public.content_items where id = v_id;
  if not bad then raise exception 'FALHA: prioridade fora da lista foi aceita'; end if;
  if p <> 'urgente' then raise exception 'FALHA: prioridade não foi gravada'; end if;
  if not locked then raise exception 'FALHA DE SEGURANÇA: título de item publicado foi alterado'; end if;
  raise exception 'OK: prioridade validada e livre; título de publicado segue travado';
end $$;

-- ═══ 10. vendedor desativado não acessa nada ═══
do $$
declare v_a uuid; v_id uuid := gen_random_uuid(); n1 int; n2 int; blocked boolean := false;
begin
  select id into v_a from auth.users where email = 'vendedor.teste@exemplo.com';
  if v_a is null then raise exception 'Vendedor de teste não encontrado'; end if;
  insert into public.content_requests (id, requested_by, title, description, request_type)
  values (v_id, v_a, 'Pedido', 'Descrição', 'Vídeo');
  update public.profiles set active = false where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n1 from public.content_requests;
  select count(*) into n2 from public.my_requests_progress();
  begin
    insert into public.content_requests (requested_by, title, description, request_type)
    values (v_a, 'Novo', 'Descrição', 'Vídeo');
  exception when others then
    blocked := true;
  end;
  reset role;
  if n1 + n2 > 0 or not blocked then
    raise exception 'FALHA DE SEGURANÇA: desativado leu requests=%, progresso=% ou criou solicitação (bloqueado=%)', n1, n2, blocked;
  end if;
  raise exception 'OK: vendedor desativado não lê nem cria nada';
end $$;
