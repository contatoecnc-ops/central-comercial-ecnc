-- =====================================================================
-- Agente de Contratos ECNC — tabelas, numeração e histórico
-- Rodar no SQL Editor do Supabase da Central Comercial.
-- =====================================================================

-- 1) Sequência de números por ano (substitui a planilha de reserva)
create table if not exists contrato_sequencias (
  ano     int primary key,
  ultimo  int not null default 0
);

-- Numeração ECNC: 2800-26, 2801-26... sequência contínua (chave 0); o sufixo é o ano.
-- O primeiro contrato do agente será o 2800:
insert into contrato_sequencias (ano, ultimo) values (0, 2799)
  on conflict (ano) do nothing;
-- (se um dia a sequência passar a recomeçar por ano, a chave vira o ano: 2027, 2028...)

-- Reserva atômica: dois vendedores ao mesmo tempo nunca recebem o mesmo número.
create or replace function reservar_numero_contrato(p_ano int)
returns int
language sql
security definer
as $$
  insert into contrato_sequencias (ano, ultimo) values (p_ano, 1)
  on conflict (ano) do update set ultimo = contrato_sequencias.ultimo + 1
  returning ultimo;
$$;

-- 2) Contratos
create table if not exists contratos (
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
  aprovacoes_necessarias jsonb not null default '[]', -- papéis que precisam aprovar ([] = pronto p/ envio)
  aprovacoes            jsonb not null default '[]', -- [{papel, por, em}]
  documentos            jsonb not null default '[]', -- [{nome, recebido, por, em, arquivo_path}]
  modelo_id             text not null,
  arquivo_path          text,
  motivo_reprovacao     text,
  aprovado_em           timestamptz,      -- quando ficou pronto para envio
  enviado_em            timestamptz,
  assinado_em           timestamptz,
  zapsign_doc_token     text unique,      -- documento no ZapSign
  zapsign_assinantes    jsonb,            -- [{nome, email, papel, url, token, assinou_em}] na ordem de assinatura
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists contratos_vendedor_idx on contratos (vendedor_id);
create index if not exists contratos_status_idx   on contratos (status, nivel_aprovacao);
create index if not exists contratos_documento_idx on contratos (cliente_documento);

-- 3) Histórico (base para o futuro agente jurídico)
create table if not exists contratos_eventos (
  id           bigserial primary key,
  contrato_id  uuid not null references contratos(id) on delete cascade,
  evento       text not null,   -- gerado, regerado, aprovado, reprovado, enviado, assinado, cancelado
  por          text not null,   -- id ou nome de quem fez
  detalhe      jsonb,
  em           timestamptz not null default now()
);

-- 4) RLS ligado. O agente roda no servidor com a service role (ignora RLS).
-- As políticas de leitura para vendedor (só os próprios) e admin (todos)
-- devem seguir o mesmo padrão de papéis já usado na Central.
alter table contrato_sequencias enable row level security;
alter table contratos           enable row level security;
alter table contratos_eventos   enable row level security;

-- 5) Storage: criar dois buckets PRIVADOS no painel do Supabase
--   - modelos-contrato  (os .docx com {{VARIAVEIS}})
--   - contratos         (os contratos gerados)

-- 6) Conversas do vendedor com o agente (histórico + estado, para o chat continuar)
create table if not exists contratos_conversas (
  id           uuid primary key default gen_random_uuid(),
  vendedor_id  uuid not null,
  canal        text not null default 'central' check (canal in ('central','telegram','whatsapp')),
  mensagens    jsonb not null default '[]',
  estado       jsonb not null default '{"receitas":{}}',
  contrato_id  uuid references contratos(id),
  encerrada    boolean not null default false,
  processando_ate timestamptz,           -- trava enquanto o agente responde
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists contratos_conversas_vendedor_idx on contratos_conversas (vendedor_id, canal, encerrada);
alter table contratos_conversas enable row level security;

-- 7) Canais externos (Telegram/WhatsApp): evita processar a mesma mensagem duas vezes
create table if not exists canal_atualizacoes (
  canal          text not null,
  atualizacao_id text not null,
  em             timestamptz not null default now(),
  primary key (canal, atualizacao_id)
);
alter table canal_atualizacoes enable row level security;

-- 8) Vínculo do Telegram no perfil do usuário da Central.
-- ⚠️ Ajustar o nome da tabela de perfis para o que a Central já usa.
-- alter table profiles add column if not exists telegram_user_id text unique;
