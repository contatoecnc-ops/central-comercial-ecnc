-- Testes de segurança da migração 006 (papel marketing).
-- Rode UM BLOCO POR VEZ no SQL Editor do Supabase. Cada bloco termina em erro de propósito
-- ("OK: ..." ou "FALHA DE SEGURANÇA: ..."), o que desfaz tudo: nada fica gravado.
--
-- Pré-requisitos: um usuário marketing de teste e um vendedor de teste (Usuários > Novo usuário),
-- ativos. Troque os e-mails no início de cada bloco.

-- ═══ 1. marketing tenta virar admin ═══
do $$
declare v_uid uuid; n int := 0;
begin
  select id into v_uid from auth.users where email = 'marketing.teste@exemplo.com';
  if v_uid is null then raise exception 'Usuário marketing de teste não encontrado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.profiles set role = 'admin' where id = v_uid;
    get diagnostics n = row_count;
  exception when others then
    reset role;
    raise exception 'OK: marketing não consegue alterar o próprio papel (%)', sqlerrm;
  end;
  reset role;
  if n > 0 then raise exception 'FALHA DE SEGURANÇA: marketing alterou o próprio papel'; end if;
  raise exception 'OK: update de role não afetou nenhuma linha';
end $$;

-- ═══ 2. marketing não lê tarefas, vendas nem lembretes ═══
do $$
declare v_uid uuid; a int; b int; c int; d int;
begin
  select id into v_uid from auth.users where email = 'marketing.teste@exemplo.com';
  if v_uid is null then raise exception 'Usuário marketing de teste não encontrado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into a from public.tasks;
  select count(*) into b from public.sales_numbers;
  select count(*) into c from public.seller_reminders;
  select count(*) into d from public.task_comments;
  reset role;
  if a + b + c + d > 0 then
    raise exception 'FALHA DE SEGURANÇA: marketing leu tasks=%, sales_numbers=%, seller_reminders=%, task_comments=%', a, b, c, d;
  end if;
  raise exception 'OK: marketing vê 0 linhas de tarefas, vendas, lembretes e comentários';
end $$;

-- ═══ 3. marketing cria e edita machines ═══
do $$
declare v_uid uuid; v_id uuid; n int;
begin
  select id into v_uid from auth.users where email = 'marketing.teste@exemplo.com';
  if v_uid is null then raise exception 'Usuário marketing de teste não encontrado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.machines (name, slug, category) values ('Teste marketing', 'teste-marketing-' || gen_random_uuid(), 'CO2')
      returning id into v_id;
    update public.machines set tagline = 'ok' where id = v_id;
    get diagnostics n = row_count;
  exception when others then
    reset role;
    raise exception 'FALHA DE SEGURANÇA/FUNCIONAL: marketing deveria poder criar e editar machines (%)', sqlerrm;
  end;
  reset role;
  if n <> 1 then raise exception 'FALHA: update de machine não afetou a linha'; end if;
  raise exception 'OK: marketing criou e editou machine (desfeito pelo teste)';
end $$;

-- ═══ 4. marketing: tabela_preco bloqueada, texto permitido ═══
do $$
declare v_uid uuid; blocked boolean := false;
begin
  select id into v_uid from auth.users where email = 'marketing.teste@exemplo.com';
  if v_uid is null then raise exception 'Usuário marketing de teste não encontrado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.manuals (kind, title, category, valid_from) values ('tabela_preco', 'Teste', 'Teste', current_date);
  exception when others then
    blocked := true;
  end;
  if not blocked then
    reset role;
    raise exception 'FALHA DE SEGURANÇA: marketing criou manual tabela_preco';
  end if;
  begin
    insert into public.manuals (kind, title, category, content) values ('texto', 'Teste', 'Teste', 'conteúdo');
  exception when others then
    reset role;
    raise exception 'FALHA FUNCIONAL: marketing deveria poder criar manual de texto (%)', sqlerrm;
  end;
  reset role;
  raise exception 'OK: tabela_preco bloqueada e texto permitido para marketing';
end $$;

-- ═══ 4b. marketing não altera nem apaga uma tabela_preco existente ═══
do $$
declare v_uid uuid; v_id uuid := gen_random_uuid(); n1 int := 0; n2 int := 0;
begin
  select id into v_uid from auth.users where email = 'marketing.teste@exemplo.com';
  if v_uid is null then raise exception 'Usuário marketing de teste não encontrado'; end if;
  insert into public.manuals (id, kind, title, category, valid_from) values (v_id, 'tabela_preco', 'Tabela teste', 'Teste', current_date);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.manuals set title = 'hackeado' where id = v_id;
  get diagnostics n1 = row_count;
  delete from public.manuals where id = v_id;
  get diagnostics n2 = row_count;
  reset role;
  if n1 + n2 > 0 then raise exception 'FALHA DE SEGURANÇA: marketing alterou (%) ou apagou (%) tabela_preco', n1, n2; end if;
  raise exception 'OK: marketing não altera nem apaga tabela_preco';
end $$;

-- ═══ 5. vendedor não cria machines ═══
do $$
declare v_uid uuid; blocked boolean := false;
begin
  select id into v_uid from auth.users where email = 'vendedor.teste@exemplo.com';
  if v_uid is null then raise exception 'Vendedor de teste não encontrado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.machines (name, slug, category) values ('Teste vendedor', 'teste-vendedor-' || gen_random_uuid(), 'CO2');
  exception when others then
    blocked := true;
  end;
  reset role;
  if not blocked then raise exception 'FALHA DE SEGURANÇA: vendedor criou machine'; end if;
  raise exception 'OK: vendedor não cria machines';
end $$;

-- ═══ 6. marketing desativado não acessa nada ═══
do $$
declare v_uid uuid; a int; b int; c int; blocked boolean := false;
begin
  select id into v_uid from auth.users where email = 'marketing.teste@exemplo.com';
  if v_uid is null then raise exception 'Usuário marketing de teste não encontrado'; end if;
  update public.profiles set active = false where id = v_uid; -- como postgres (privilegiado)
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into a from public.machines;
  select count(*) into b from public.manuals;
  select count(*) into c from public.profiles where id <> v_uid;
  begin
    insert into public.machines (name, slug, category) values ('Teste', 'teste-inativo-' || gen_random_uuid(), 'CO2');
  exception when others then
    blocked := true;
  end;
  reset role;
  if a + b + c > 0 or not blocked then
    raise exception 'FALHA DE SEGURANÇA: desativado leu machines=%, manuals=%, profiles=% ou conseguiu escrever (bloqueado=%)', a, b, c, blocked;
  end if;
  raise exception 'OK: marketing desativado não lê nem escreve nada';
end $$;
