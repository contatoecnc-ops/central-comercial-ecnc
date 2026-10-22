-- Fase E: módulo "Michele IA" (somente admin). Atendimentos e mensagens da IA que qualifica leads no WhatsApp.
-- Idempotente. Requer as migrações 001 a 009 (auth_role, touch_updated_at, schema analytics). Execute inteira no SQL Editor.
--
-- Regras:
--  • Escrita só pela service role (função michele_ingest, chamada por /api/michele/ingest). Nenhuma policy de escrita.
--  • Leitura só do admin (RLS). Marketing e vendedor veem 0 linhas.
--  • O CPF (11 dígitos) é gravado mascarado pela própria função; o CNPJ (14 dígitos) fica completo.
--  • A view analytics.v_michele_dia só tem contagens e o nome da campanha (nunca nome, telefone, texto, resumo, CPF/CNPJ).

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Tabelas
-- ═════════════════════════════════════════════════════════════════════════
create table if not exists public.michele_atendimentos (
  id uuid primary key default gen_random_uuid(),
  sessao_id text not null unique check (length(sessao_id) between 1 and 200),
  telefone text not null check (telefone ~ '^[0-9]{8,15}$'),
  nome text check (nome is null or length(nome) <= 200),
  origem text check (origem is null or origem in ('whatsapp', 'instagram')),
  campanha text check (campanha is null or length(campanha) <= 120),
  status text not null default 'em_andamento' check (status in ('em_andamento', 'qualificado', 'recusou')),
  score int,
  temperatura text check (temperatura is null or temperatura in ('lead-quente', 'lead-morno', 'lead-frio')),
  prioridade boolean default false,
  segmento text,
  budget text,   -- Faixa 1 (R$12k-15k) | Faixa 2 (R$20k-28k) | Faixa 3 (R$30k+) | Abaixo da faixa | texto livre
  cnpj_cpf text, -- CPF sempre mascarado (***.456.789-**); CNPJ completo
  momento_compra text,
  produto_provavel text,
  resumo jsonb,  -- JSON completo gerado pela Michele no encerramento
  kommo_lead_id bigint,
  iniciado_em timestamptz not null default now(),
  ultima_mensagem_em timestamptz,
  encerrado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.michele_mensagens (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.michele_atendimentos(id) on delete cascade,
  ordem int not null check (ordem >= 0),
  papel text not null check (papel in ('lead', 'michele')),
  texto text not null check (length(texto) <= 8000),
  enviada_em timestamptz not null default now(),
  unique (atendimento_id, ordem)
);

create index if not exists michele_atendimentos_telefone_idx on public.michele_atendimentos(telefone);
create index if not exists michele_atendimentos_status_idx on public.michele_atendimentos(status);
create index if not exists michele_atendimentos_campanha_idx on public.michele_atendimentos(campanha);
create index if not exists michele_atendimentos_iniciado_idx on public.michele_atendimentos(iniciado_em);
create index if not exists michele_atendimentos_ultima_idx on public.michele_atendimentos(ultima_mensagem_em);
create index if not exists michele_mensagens_atendimento_idx on public.michele_mensagens(atendimento_id);

drop trigger if exists michele_atendimentos_touch on public.michele_atendimentos;
create trigger michele_atendimentos_touch before update on public.michele_atendimentos
  for each row execute function public.touch_updated_at();

-- ═════════════════════════════════════════════════════════════════════════
-- 2. RLS: leitura só do admin; nenhuma policy de escrita
-- ═════════════════════════════════════════════════════════════════════════
alter table public.michele_atendimentos enable row level security;
alter table public.michele_mensagens enable row level security;

drop policy if exists michele_atendimentos_select on public.michele_atendimentos;
create policy michele_atendimentos_select on public.michele_atendimentos
  for select to authenticated using (public.auth_role() = 'admin');

drop policy if exists michele_mensagens_select on public.michele_mensagens;
create policy michele_mensagens_select on public.michele_mensagens
  for select to authenticated using (public.auth_role() = 'admin');

revoke all on public.michele_atendimentos, public.michele_mensagens from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.michele_atendimentos, public.michele_mensagens from authenticated;
grant select on public.michele_atendimentos, public.michele_mensagens to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Ingestão atômica (service role). Idempotente: dado repetido nunca é erro.
-- ═════════════════════════════════════════════════════════════════════════
create or replace function public.michele_ingest(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_digits text := regexp_replace(coalesce(p_payload->>'cnpj_cpf', ''), '\D', '', 'g');
  v_doc text;
  v_max timestamptz;
begin
  -- CPF (11 dígitos): só os 6 do meio. CNPJ (14): completo. Já mascarado: mantém. Outro formato: descarta.
  v_doc := case
    when p_payload->>'cnpj_cpf' ~ '^\*\*\*\.[0-9]{3}\.[0-9]{3}-\*\*$' then p_payload->>'cnpj_cpf'
    when length(v_digits) = 11 then '***.' || substr(v_digits, 4, 3) || '.' || substr(v_digits, 7, 3) || '-**'
    when length(v_digits) = 14 then v_digits
    else null
  end;

  insert into public.michele_atendimentos as t (
    sessao_id, telefone, nome, origem, campanha, iniciado_em, status, score, temperatura, prioridade,
    segmento, budget, cnpj_cpf, momento_compra, produto_provavel, resumo, kommo_lead_id, encerrado_em
  ) values (
    p_payload->>'sessao_id',
    regexp_replace(p_payload->>'telefone', '\D', '', 'g'),
    nullif(p_payload->>'nome', ''),
    nullif(p_payload->>'origem', ''),
    nullif(p_payload->>'campanha', ''),
    coalesce((p_payload->>'iniciado_em')::timestamptz, now()),
    coalesce(nullif(p_payload->>'status', ''), 'em_andamento'),
    (p_payload->>'score')::int,
    nullif(p_payload->>'temperatura', ''),
    coalesce((p_payload->>'prioridade')::boolean, false),
    nullif(p_payload->>'segmento', ''),
    nullif(p_payload->>'budget', ''),
    v_doc,
    nullif(p_payload->>'momento_compra', ''),
    nullif(p_payload->>'produto_provavel', ''),
    case when jsonb_typeof(p_payload->'resumo') = 'object' then p_payload->'resumo' end,
    (p_payload->>'kommo_lead_id')::bigint,
    case when p_payload->>'status' in ('qualificado', 'recusou') then now() end
  )
  on conflict (sessao_id) do update set
    nome = coalesce(excluded.nome, t.nome),
    origem = coalesce(excluded.origem, t.origem),
    campanha = coalesce(excluded.campanha, t.campanha),
    -- nunca regride de qualificado/recusou para em_andamento
    status = case when t.status in ('qualificado', 'recusou') and excluded.status = 'em_andamento'
                  then t.status else excluded.status end,
    score = coalesce(excluded.score, t.score),
    temperatura = coalesce(excluded.temperatura, t.temperatura),
    -- prioridade, uma vez verdadeira, não volta a falso por um payload que traz false por padrão
    prioridade = coalesce(t.prioridade, false) or coalesce(excluded.prioridade, false),
    segmento = coalesce(excluded.segmento, t.segmento),
    budget = coalesce(excluded.budget, t.budget),
    cnpj_cpf = coalesce(excluded.cnpj_cpf, t.cnpj_cpf),
    momento_compra = coalesce(excluded.momento_compra, t.momento_compra),
    produto_provavel = coalesce(excluded.produto_provavel, t.produto_provavel),
    resumo = coalesce(excluded.resumo, t.resumo),
    kommo_lead_id = coalesce(excluded.kommo_lead_id, t.kommo_lead_id),
    encerrado_em = coalesce(
      t.encerrado_em,
      case when (case when t.status in ('qualificado', 'recusou') and excluded.status = 'em_andamento'
                      then t.status else excluded.status end) in ('qualificado', 'recusou')
           then now() end
    )
  returning t.id into v_id;

  if jsonb_typeof(p_payload->'mensagens') = 'array' then
    insert into public.michele_mensagens (atendimento_id, ordem, papel, texto, enviada_em)
    select v_id, m.ordem, m.papel, m.texto, coalesce(m.enviada_em, now())
    from jsonb_to_recordset(p_payload->'mensagens') as m(ordem int, papel text, texto text, enviada_em timestamptz)
    on conflict (atendimento_id, ordem) do nothing;

    select max(coalesce(m.enviada_em, now())) into v_max
    from jsonb_to_recordset(p_payload->'mensagens') as m(enviada_em timestamptz);

    if v_max is not null then
      update public.michele_atendimentos
         set ultima_mensagem_em = greatest(ultima_mensagem_em, v_max)
       where id = v_id;
    end if;
  end if;

  return v_id;
end $$;

revoke execute on function public.michele_ingest(jsonb) from public, anon, authenticated;
grant execute on function public.michele_ingest(jsonb) to service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 4. Leitura para as telas (admin)
-- ═════════════════════════════════════════════════════════════════════════
-- Lista com contagem de mensagens e status efetivo. security_invoker: o RLS das tabelas vale para quem consulta.
-- "abandonado" é calculado aqui (em_andamento sem mensagem há mais de 24 h) e nunca gravado.
drop view if exists public.v_michele_atendimentos;
create view public.v_michele_atendimentos with (security_invoker = true) as
select
  a.id, a.sessao_id, a.telefone, a.nome, a.origem, a.campanha, a.status, a.score, a.temperatura, a.prioridade,
  a.segmento, a.budget, a.momento_compra, a.produto_provavel, a.kommo_lead_id,
  a.iniciado_em, a.ultima_mensagem_em, a.encerrado_em,
  coalesce(a.ultima_mensagem_em, a.iniciado_em) as ultima_atividade_em,
  case when a.status = 'em_andamento' and coalesce(a.ultima_mensagem_em, a.iniciado_em) < now() - interval '24 hours'
       then 'abandonado' else a.status end as status_efetivo,
  (select count(*) from public.michele_mensagens m where m.atendimento_id = a.id and m.papel = 'lead')::int as msgs_lead,
  (select count(*) from public.michele_mensagens m where m.atendimento_id = a.id)::int as msgs_total
from public.michele_atendimentos a;

revoke all on public.v_michele_atendimentos from public, anon;
grant select on public.v_michele_atendimentos to authenticated;

-- Relatório agregado no banco. Janela [p_de, p_ate) sobre iniciado_em. Só admin (senão erro 42501).
create or replace function public.michele_relatorio(p_de timestamptz, p_ate timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if public.auth_role() is distinct from 'admin' then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  with a as (
    select x.status, x.temperatura, x.campanha, x.budget,
           (select count(*) from public.michele_mensagens m where m.atendimento_id = x.id and m.papel = 'lead')::int as msgs_lead,
           (x.status = 'em_andamento' and coalesce(x.ultima_mensagem_em, x.iniciado_em) < now() - interval '24 hours') as abandonado
    from public.michele_atendimentos x
    where x.iniciado_em >= p_de and x.iniciado_em < p_ate
  )
  select jsonb_build_object(
    'funil', (select jsonb_build_object(
        'iniciaram', count(*),
        'responderam', count(*) filter (where msgs_lead >= 2),
        'chegaram_ao_fim', count(*) filter (where status in ('qualificado', 'recusou')),
        'aceitaram', count(*) filter (where status = 'qualificado'),
        'recusaram', count(*) filter (where status = 'recusou'),
        'em_andamento', count(*) filter (where status = 'em_andamento' and not abandonado),
        'abandonados', count(*) filter (where abandonado)
      ) from a),
    'abandono_por_etapa', coalesce((select jsonb_agg(jsonb_build_object('etapa', e, 'qtd', n) order by e)
        from (select least(msgs_lead, 10) as e, count(*) as n from a where abandonado group by 1) s), '[]'::jsonb),
    'por_campanha', coalesce((select jsonb_agg(jsonb_build_object('campanha', c, 'leads', n, 'qualificados', q, 'recusaram', rc) order by n desc, c)
        from (select coalesce(nullif(btrim(campanha), ''), 'Sem campanha') as c, count(*) as n,
                     count(*) filter (where status = 'qualificado') as q,
                     count(*) filter (where status = 'recusou') as rc
              from a group by 1 order by n desc, c limit 30) s), '[]'::jsonb),
    'por_budget', coalesce((select jsonb_agg(jsonb_build_object('faixa', b, 'qtd', n) order by o)
        from (select case
                       when budget ilike 'Faixa 1%' then 'Faixa 1' when budget ilike 'Faixa 2%' then 'Faixa 2'
                       when budget ilike 'Faixa 3%' then 'Faixa 3' when budget ilike 'Abaixo%' then 'Abaixo da faixa'
                       when budget is null then 'Não informado' else 'Outro' end as b,
                     min(case
                       when budget ilike 'Faixa 1%' then 1 when budget ilike 'Faixa 2%' then 2
                       when budget ilike 'Faixa 3%' then 3 when budget ilike 'Abaixo%' then 4
                       when budget is null then 6 else 5 end) as o,
                     count(*) as n
              from a group by 1) s), '[]'::jsonb),
    'por_temperatura', coalesce((select jsonb_agg(jsonb_build_object('temperatura', t, 'qtd', n) order by n desc)
        from (select coalesce(temperatura, 'sem-temperatura') as t, count(*) as n from a group by 1) s), '[]'::jsonb),
    'hoje', (select count(*) from public.michele_atendimentos
             where (iniciado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date),
    'em_andamento_agora', (select count(*) from public.michele_atendimentos
             where status = 'em_andamento' and coalesce(ultima_mensagem_em, iniciado_em) >= now() - interval '24 hours')
  ) into r;
  return r;
end $$;

revoke execute on function public.michele_relatorio(timestamptz, timestamptz) from public, anon;
grant execute on function public.michele_relatorio(timestamptz, timestamptz) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 5. Análise (Hermes): só contagens por dia e campanha. Mesmo padrão das views da 009.
-- ═════════════════════════════════════════════════════════════════════════
drop view if exists analytics.v_michele_dia cascade;
create view analytics.v_michele_dia as
select
  (iniciado_em at time zone 'America/Sao_Paulo')::date as dia,
  left(coalesce(nullif(btrim(regexp_replace(campanha, '[[:cntrl:]]+', ' ', 'g')), ''), 'Sem campanha'), 60) as campanha,
  count(*)::int as atendimentos,
  (count(*) filter (where status = 'qualificado'))::int as qualificados,
  (count(*) filter (where status = 'recusou'))::int as recusas,
  (count(*) filter (where status = 'em_andamento'
                      and coalesce(ultima_mensagem_em, iniciado_em) < now() - interval '24 hours'))::int as abandonados
from public.michele_atendimentos
group by 1, 2;

revoke all on analytics.v_michele_dia from public, anon, authenticated;
grant select on analytics.v_michele_dia to service_role;

notify pgrst, 'reload schema';

commit;

notify pgrst, 'reload schema';
