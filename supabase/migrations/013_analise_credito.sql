-- Fase G: análise de crédito do cliente + papel "financeiro".
-- Idempotente. Requer as migrações 001 a 012 (auth_role, touch_updated_at, papel analista, contratos). Execute inteira no SQL Editor.
--
-- Regras:
--  • Papel "financeiro": só envia análises (pela API, com a service role). NENHUM SELECT em tabela de negócio e nenhuma escrita
--    direta: policies RESTRITIVAS de insert/update/delete em todas as tabelas de public e em storage.objects, como a 011 fez
--    para o analista (o analista segue com as policies analista_no_*; o financeiro ganha financeiro_no_*).
--  • analises_credito e contratos_analises: SELECT só do admin; nenhuma policy de escrita (escreve só o servidor).
--  • Bucket privado analises-credito: só PDF, 10 MB, sem policies; acesso por URL assinada de 60 s gerada pelo servidor.
--  • Funções novas: execute só para service_role.

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Papel financeiro na constraint de profiles (descobre o nome real da constraint)
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
  check (role in ('admin', 'vendedor', 'marketing', 'analista', 'financeiro'));

create or replace function public.is_financeiro() returns boolean
language sql security definer set search_path = public stable as $$
  select coalesce(public.auth_role() = 'financeiro', false);
$$;
revoke execute on function public.is_financeiro() from public, anon, authenticated;
grant execute on function public.is_financeiro() to service_role;

-- is_staff() NÃO muda (continua só admin e marketing): o financeiro não ganha nenhuma permissão por ele.

-- is_active_user() é o que libera a leitura de catálogo, manuais e perfis alheios para "qualquer usuário ativo" (003, 005, 006).
-- O financeiro NÃO é um desses usuários: lê só o próprio perfil e nenhuma tabela de negócio. (Os grants da função são mantidos.)
create or replace function public.is_active_user() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role <> 'financeiro');
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Tabelas
-- ═════════════════════════════════════════════════════════════════════════
create table if not exists public.analises_credito (
  id            uuid primary key default gen_random_uuid(),
  -- de 1 a 3 documentos (CPF de 11 ou CNPJ de 14 dígitos); o dígito verificador é conferido pelo servidor
  documentos    text[] not null
                check (cardinality(documentos) between 1 and 3
                       and array_to_string(documentos, ',') ~ '^([0-9]{11}|[0-9]{14})(,([0-9]{11}|[0-9]{14})){0,2}$'),
  cliente_nome  text not null check (length(cliente_nome) between 1 and 200),
  resultado     text not null check (resultado in ('aprovada', 'reprovada')),
  analisada_em  date not null,
  validade_ate  date not null,
  arquivo_path  text not null,
  arquivo_nome  text,
  enviado_por   uuid not null,
  created_at    timestamptz not null default now(),
  check (validade_ate >= analisada_em)
);
create index if not exists analises_credito_documentos_idx on public.analises_credito using gin (documentos);
create index if not exists analises_credito_created_idx on public.analises_credito (created_at desc);
create index if not exists analises_credito_enviado_idx on public.analises_credito (enviado_por, created_at desc);

create table if not exists public.contratos_analises (
  contrato_id  uuid not null references public.contratos(id) on delete cascade,
  analise_id   uuid not null references public.analises_credito(id) on delete cascade,
  origem       text not null check (origem in ('automatico', 'manual')),
  vinculada_por uuid,
  vinculada_em timestamptz not null default now(),
  unique (contrato_id, analise_id)
);
create index if not exists contratos_analises_analise_idx on public.contratos_analises (analise_id);

-- ═════════════════════════════════════════════════════════════════════════
-- 3. RLS: leitura só do admin; nenhuma policy de escrita
-- ═════════════════════════════════════════════════════════════════════════
alter table public.analises_credito enable row level security;
alter table public.contratos_analises enable row level security;

drop policy if exists analises_credito_select on public.analises_credito;
create policy analises_credito_select on public.analises_credito
  for select to authenticated using (public.auth_role() = 'admin');

drop policy if exists contratos_analises_select on public.contratos_analises;
create policy contratos_analises_select on public.contratos_analises
  for select to authenticated using (public.auth_role() = 'admin');

revoke all on public.analises_credito, public.contratos_analises from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.analises_credito, public.contratos_analises from authenticated;
grant select on public.analises_credito, public.contratos_analises to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 4. Bucket privado (sem policies)
-- ═════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('analises-credito', 'analises-credito', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ═════════════════════════════════════════════════════════════════════════
-- 5. Papel financeiro: escrita negada por policies RESTRITIVAS (public.* e storage.objects)
--    Sem SELECT em nenhuma tabela de negócio: nenhuma policy permissiva cita o financeiro.
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
    execute format('drop policy if exists financeiro_no_insert on %s', t);
    execute format('drop policy if exists financeiro_no_update on %s', t);
    execute format('drop policy if exists financeiro_no_delete on %s', t);
    execute format(
      'create policy financeiro_no_insert on %s as restrictive for insert to authenticated
         with check (public.auth_role() is distinct from ''financeiro'')', t);
    execute format(
      'create policy financeiro_no_update on %s as restrictive for update to authenticated
         using (public.auth_role() is distinct from ''financeiro'')
         with check (public.auth_role() is distinct from ''financeiro'')', t);
    execute format(
      'create policy financeiro_no_delete on %s as restrictive for delete to authenticated
         using (public.auth_role() is distinct from ''financeiro'')', t);
    -- o analista também cobre as tabelas novas (mesma lógica da 011)
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

-- TRUNCATE/REFERENCES/TRIGGER não passam por RLS: ninguém logado (nem anônimo) precisa deles (inclui as tabelas novas)
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
