-- Fase F: Agente de Contratos (vendedor conversa com o agente; admin aprova; assinatura pelo ZapSign).
-- Idempotente. Requer as migrações 001 a 011 (auth_role, touch_updated_at, papel analista). Execute inteira no SQL Editor.
-- Parte do pacote agente-contratos (supabase/001_contratos.sql), com os acréscimos de segurança da Central.
--
-- Regras:
--  • Escrita só pelo servidor (service role). NENHUMA policy de INSERT/UPDATE/DELETE em contratos, eventos e conversas.
--  • Leitura: vendedor dono do contrato e admin. Marketing, analista e anônimo: nada.
--  • contrato_sequencias e canal_atualizacoes: RLS ligado e nenhuma policy (só a service role acessa).
--  • reservar_numero_contrato: só a service role executa (senão qualquer usuário gastaria números pela API).
--  • CPF e celular do vendedor ficam em perfis_contrato (só admin lê e escreve), NUNCA em profiles.
--  • Buckets privados modelos-contrato e contratos, sem policy: acesso só por URL assinada gerada pelo servidor.
-- Numeração: sequência contínua; o primeiro contrato é o 2800 (2800-26). Não altere o 2799 abaixo.

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Sequência de números e reserva atômica
-- ═════════════════════════════════════════════════════════════════════════
create table if not exists public.contrato_sequencias (
  ano    int primary key,
  ultimo int not null default 0
);

-- chave 0 = sequência contínua (reinicia_por_ano: false). O primeiro número reservado será 2800.
insert into public.contrato_sequencias (ano, ultimo) values (0, 2799)
  on conflict (ano) do nothing;

create or replace function public.reservar_numero_contrato(p_ano int)
returns int
language sql
security definer
set search_path = public
as $$
  insert into public.contrato_sequencias (ano, ultimo) values (p_ano, 1)
  on conflict (ano) do update set ultimo = public.contrato_sequencias.ultimo + 1
  returning ultimo;
$$;

revoke execute on function public.reservar_numero_contrato(int) from public, anon, authenticated;
grant execute on function public.reservar_numero_contrato(int) to service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Contratos, histórico, conversas, deduplicação de canais
-- ═════════════════════════════════════════════════════════════════════════
create table if not exists public.contratos (
  id                    uuid primary key default gen_random_uuid(),
  numero                text not null unique,
  status                text not null default 'aguardando_aprovacao'
                        check (status in ('aguardando_aprovacao','aprovado','reprovado',
                                          'enviado_cliente','assinado','cancelado')),
  vendedor_id           uuid not null,
  vendedor_nome         text not null,
  cliente_razao_social  text not null,
  cliente_tipo_pessoa   text not null check (cliente_tipo_pessoa in ('PF','PJ')),
  cliente_documento     text not null,    -- CPF ou CNPJ, só dígitos
  valor_total_centavos  bigint not null,
  condicao_pagamento    text not null,    -- id da condição (config/condicoes-pagamento.ts)
  dados                 jsonb not null,   -- dados estruturados validados
  variaveis             jsonb not null,   -- exatamente o que foi para o .docx / ZapSign
  alertas               jsonb not null default '[]',
  -- Nível de atenção: 1 padrão, 2 atenção, 3 atenção máxima
  nivel_aprovacao       smallint not null default 1 check (nivel_aprovacao between 1 and 3),
  motivos_nivel         jsonb not null default '[]',
  aprovacoes_necessarias jsonb not null default '[]', -- rótulos de papel exigidos ([] = pronto p/ envio)
  aprovacoes            jsonb not null default '[]',  -- [{papel, por, em}]
  documentos            jsonb not null default '[]',  -- [{nome, recebido, por, em, arquivo_path}]
  modelo_id             text not null,
  arquivo_path          text,
  motivo_reprovacao     text,
  aprovado_em           timestamptz,
  enviado_em            timestamptz,
  assinado_em           timestamptz,
  zapsign_doc_token     text unique,
  zapsign_assinantes    jsonb,            -- [{nome, email, papel, url, token, assinou_em}] na ordem de assinatura
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists contratos_vendedor_idx  on public.contratos (vendedor_id);
create index if not exists contratos_status_idx    on public.contratos (status, nivel_aprovacao);
create index if not exists contratos_documento_idx on public.contratos (cliente_documento);

drop trigger if exists contratos_touch on public.contratos;
create trigger contratos_touch before update on public.contratos
  for each row execute function public.touch_updated_at();

create table if not exists public.contratos_eventos (
  id           bigserial primary key,
  contrato_id  uuid not null references public.contratos(id) on delete cascade,
  evento       text not null,   -- gerado, regerado, aprovado, reprovado, enviado_cliente, assinado, cancelado...
  por          text not null,   -- id de quem fez (ou "zapsign")
  detalhe      jsonb,
  em           timestamptz not null default now()
);
create index if not exists contratos_eventos_contrato_idx on public.contratos_eventos (contrato_id, em);

create table if not exists public.contratos_conversas (
  id           uuid primary key default gen_random_uuid(),
  vendedor_id  uuid not null,
  canal        text not null default 'central' check (canal in ('central','telegram','whatsapp')),
  mensagens    jsonb not null default '[]',
  estado       jsonb not null default '{"receitas":{}}',
  contrato_id  uuid references public.contratos(id),
  encerrada    boolean not null default false,
  processando_ate timestamptz,           -- trava enquanto o agente responde
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists contratos_conversas_vendedor_idx
  on public.contratos_conversas (vendedor_id, canal, encerrada);

create table if not exists public.canal_atualizacoes (
  canal          text not null,
  atualizacao_id text not null,
  em             timestamptz not null default now(),
  primary key (canal, atualizacao_id)
);

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Dados do vendedor para o contrato (separado de profiles, que qualquer usuário ativo lê)
-- ═════════════════════════════════════════════════════════════════════════
create table if not exists public.perfis_contrato (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  cpf                text check (cpf is null or cpf ~ '^[0-9]{11}$'),
  celular            text check (celular is null or celular ~ '^[0-9]{10,13}$'),
  telegram_user_id   text unique check (telegram_user_id is null or telegram_user_id ~ '^[0-9]{3,20}$'),
  contratos_liberado boolean not null default false,
  updated_at         timestamptz not null default now()
);

drop trigger if exists perfis_contrato_touch on public.perfis_contrato;
create trigger perfis_contrato_touch before update on public.perfis_contrato
  for each row execute function public.touch_updated_at();

-- ═════════════════════════════════════════════════════════════════════════
-- 4. RLS
-- ═════════════════════════════════════════════════════════════════════════
alter table public.contrato_sequencias enable row level security;
alter table public.contratos           enable row level security;
alter table public.contratos_eventos   enable row level security;
alter table public.contratos_conversas enable row level security;
alter table public.canal_atualizacoes  enable row level security;
alter table public.perfis_contrato     enable row level security;

-- contratos e conversas: SELECT do vendedor dono e do admin (auth_role() é nulo para usuário inativo)
drop policy if exists contratos_select on public.contratos;
create policy contratos_select on public.contratos for select to authenticated
  using (public.auth_role() = 'admin' or (public.auth_role() = 'vendedor' and vendedor_id = auth.uid()));

drop policy if exists contratos_conversas_select on public.contratos_conversas;
create policy contratos_conversas_select on public.contratos_conversas for select to authenticated
  using (public.auth_role() = 'admin' or (public.auth_role() = 'vendedor' and vendedor_id = auth.uid()));

-- eventos: via o contrato (a subconsulta já passa pela RLS de contratos)
drop policy if exists contratos_eventos_select on public.contratos_eventos;
create policy contratos_eventos_select on public.contratos_eventos for select to authenticated
  using (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'vendedor' and exists (
      select 1 from public.contratos c where c.id = contrato_id and c.vendedor_id = auth.uid()))
  );

-- perfis_contrato: só admin lê e escreve
drop policy if exists perfis_contrato_admin on public.perfis_contrato;
create policy perfis_contrato_admin on public.perfis_contrato for all to authenticated
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');

-- contrato_sequencias e canal_atualizacoes: sem nenhuma policy (só a service role, que ignora RLS)

-- Privilégios: ninguém logado escreve em contratos/eventos/conversas; anônimo não toca em nada
revoke all on public.contrato_sequencias, public.canal_atualizacoes from public, anon, authenticated;
revoke all on public.contratos, public.contratos_eventos, public.contratos_conversas, public.perfis_contrato
  from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.contratos, public.contratos_eventos, public.contratos_conversas from authenticated;
grant select on public.contratos, public.contratos_eventos, public.contratos_conversas to authenticated;
revoke truncate, references, trigger on public.perfis_contrato from authenticated;
grant select, insert, update, delete on public.perfis_contrato to authenticated;
revoke all on sequence public.contratos_eventos_id_seq from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 5. Buckets privados (sem policies: acesso só por URL assinada do servidor)
-- ═════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('modelos-contrato', 'modelos-contrato', false, 10485760,
   array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('contratos', 'contratos', false, 10485760,
   array['application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ═════════════════════════════════════════════════════════════════════════
-- 6. Papel analista (seção 4 e 5 da migração 011, reaplicadas para cobrir as tabelas novas)
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
