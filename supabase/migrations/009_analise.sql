-- Fase D: views de agregação para o endpoint de análise (/api/analise/resumo).
-- Idempotente. Requer as migrações 001 a 008. Execute inteira no SQL Editor do Supabase.
--
-- Regras:
--  • Só números: nenhuma coluna de texto livre (título, descrição, legenda, comentário, arquivo, e-mail, cliente).
--    Os únicos textos são nomes de vendedor/equipe (profiles.full_name) e valores de listas fixas
--    (tipo de solicitação, canal, prioridade, status), que as views filtram por lista branca.
--  • Dias no fuso America/Sao_Paulo. A janela de datas é filtrada pelo endpoint.
--  • Ninguém além da service_role lê o schema analytics.
--  • Depois de rodar: Supabase → Project Settings → API → "Exposed schemas": adicionar "analytics"
--    (sem isso o PostgREST não enxerga as views; anon e authenticated continuam sem permissão alguma).

begin;

create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;
grant usage on schema analytics to service_role;

drop view if exists analytics.v_tarefas_dia cascade;
drop view if exists analytics.v_vendas_mes cascade;
drop view if exists analytics.v_vendas_sync cascade;
drop view if exists analytics.v_solicitacoes_dia cascade;
drop view if exists analytics.v_conteudo_dia cascade;
drop view if exists analytics.v_conteudo_canal_dia cascade;
drop view if exists analytics.v_conteudo_status cascade;
drop view if exists analytics.v_solicitacao_para_entrega cascade;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Tarefas por dia, vendedor e origem ('admin' = atribuída pelo gestor; 'propria' = criada pelo vendedor)
--    (a tabela tasks não tem coluna de origem: ela é created_by = assigned_to)
-- ═════════════════════════════════════════════════════════════════════════
create view analytics.v_tarefas_dia as
with t as (
  select
    assigned_to, created_at, completed_at, due_date, status,
    case when created_by = assigned_to then 'propria' else 'admin' end as origem,
    (created_at at time zone 'America/Sao_Paulo')::date as c_dia,
    (completed_at at time zone 'America/Sao_Paulo')::date as f_dia
  from public.tasks
),
dias as (
  select d::date as dia from generate_series(
    (select min(c_dia) from t)::timestamp, (now() at time zone 'America/Sao_Paulo')::date::timestamp, interval '1 day') d
),
combos as (select distinct assigned_to, origem from t),
grade as (
  select d.dia, c.assigned_to, c.origem,
         ((d.dia + 1)::timestamp at time zone 'America/Sao_Paulo') as fim_dia
  from dias d cross join combos c
),
criadas as (
  select c_dia as dia, assigned_to, origem, count(*) as n from t group by 1, 2, 3
),
concluidas as (
  select f_dia as dia, assigned_to, origem,
         count(*) as n,
         count(*) filter (where completed_at <= due_date) as no_prazo,
         avg(extract(epoch from (completed_at - created_at)) / 3600.0) as horas_medio
  from t where status = 'concluida' and completed_at is not null
  group by 1, 2, 3
),
vencidas as (
  select g.dia, g.assigned_to, g.origem, count(*) as n
  from grade g
  join t on t.assigned_to = g.assigned_to and t.origem = g.origem
        and t.created_at < g.fim_dia
        and t.due_date < g.fim_dia
        and t.status <> 'cancelada'
        and (t.completed_at is null or t.completed_at >= g.fim_dia)
  group by 1, 2, 3
)
select
  g.dia,
  g.assigned_to as seller_id,
  p.full_name as vendedor,
  g.origem,
  coalesce(c.n, 0)::int as criadas,
  coalesce(f.n, 0)::int as concluidas,
  coalesce(f.no_prazo, 0)::int as concluidas_no_prazo,
  coalesce(v.n, 0)::int as vencidas_em_aberto,
  round(f.horas_medio::numeric, 2) as tempo_conclusao_h_medio
from grade g
join public.profiles p on p.id = g.assigned_to
left join criadas c on (c.dia, c.assigned_to, c.origem) = (g.dia, g.assigned_to, g.origem)
left join concluidas f on (f.dia, f.assigned_to, f.origem) = (g.dia, g.assigned_to, g.origem)
left join vencidas v on (v.dia, v.assigned_to, v.origem) = (g.dia, g.assigned_to, g.origem)
where coalesce(c.n, 0) + coalesce(f.n, 0) + coalesce(v.n, 0) > 0;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Vendas por mês e vendedor (linha da empresa: seller_label = '__EMPRESA__')
--    Vendedor com vínculo → nome do perfil. Sem vínculo (ex-vendedor, contas da casa) → 'Sem vínculo' (somado).
-- ═════════════════════════════════════════════════════════════════════════
create view analytics.v_vendas_mes as
with base as (
  select
    n.period as mes,
    case when n.seller_label = '__EMPRESA__' then '__EMPRESA__'
         else coalesce(p.full_name, 'Sem vínculo') end as seller_label,
    coalesce((n.metrics->>'vendas')::numeric, 0) as vendas,
    (n.metrics->>'meta')::numeric as meta,
    coalesce((n.metrics->>'maquinas')::numeric, 0) as maquinas,
    coalesce((n.metrics->>'pecas')::numeric, 0) as pecas,
    coalesce((n.metrics->>'estornos')::numeric, 0) as estornos,
    nullif(n.metrics->>'dados_ate', '')::date as dados_ate
  from public.sales_numbers n
  left join public.profiles p on p.id = n.seller_id
),
agg as (
  select
    mes, seller_label,
    sum(vendas) as vendas,
    sum(meta) as meta,
    sum(maquinas) as maquinas,
    sum(pecas) as pecas,
    sum(estornos) as estornos,
    max(dados_ate) as dados_ate
  from base group by 1, 2
)
select
  a.mes,
  a.seller_label,
  a.vendas,
  a.meta,
  case when a.meta is not null and a.meta > 0 then round(a.vendas / a.meta, 4) end as percentual,
  a.maquinas,
  a.pecas,
  a.estornos,
  a.dados_ate,
  s.synced_at as sincronizado_em
from agg a
left join public.sales_sync_status s on true;

-- Estado da sincronização (uma linha; zero linhas se nunca sincronizou). Sem o texto dos avisos.
create view analytics.v_vendas_sync as
select synced_at as sincronizado_em, dados_ate, jsonb_array_length(coalesce(avisos, '[]'::jsonb)) as qtd_avisos
from public.sales_sync_status;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Solicitações de material por dia, vendedor, tipo e prioridade
--    "Parada" = nova (sem decisão) ao fim do dia, há mais de 24 h / 72 h. Cancelamento usa updated_at.
-- ═════════════════════════════════════════════════════════════════════════
create view analytics.v_solicitacoes_dia as
with r as (
  select
    requested_by, priority as prioridade, status, created_at, decided_at,
    case when request_type in ('Post/arte para redes', 'Vídeo', 'Material impresso (folder, catálogo)',
                               'Apresentação ou proposta', 'Foto/vídeo de máquina', 'Outro')
         then request_type else 'Outro' end as tipo,
    (created_at at time zone 'America/Sao_Paulo')::date as c_dia,
    case when status in ('aprovada', 'recusada') then (decided_at at time zone 'America/Sao_Paulo')::date end as d_dia,
    case when status = 'cancelada' then (coalesce(decided_at, updated_at) at time zone 'America/Sao_Paulo')::date end as x_dia,
    case when status in ('aprovada', 'recusada') then decided_at
         when status = 'cancelada' then coalesce(decided_at, updated_at) end as fechada_em
  from public.content_requests
),
eventos as (
  select c_dia as dia, requested_by, tipo, prioridade,
         1 as criadas, 0 as aprovadas, 0 as recusadas, 0 as canceladas,
         0::numeric as triagem_soma_h, 0 as triagens, 0 as abertas, 0 as paradas_24h, 0 as paradas_72h
  from r
  union all
  select d_dia, requested_by, tipo, prioridade,
         0, (status = 'aprovada')::int, (status = 'recusada')::int, 0,
         extract(epoch from (decided_at - created_at)) / 3600.0, 1, 0, 0, 0
  from r where d_dia is not null and decided_at is not null
  union all
  select x_dia, requested_by, tipo, prioridade, 0, 0, 0, 1, 0, 0, 0, 0, 0
  from r where x_dia is not null
),
abertas as (
  -- um registro por dia em que a solicitação ainda estava aberta ao fim do dia
  select d::date as dia, r.requested_by, r.tipo, r.prioridade,
         0 as criadas, 0 as aprovadas, 0 as recusadas, 0 as canceladas,
         0::numeric as triagem_soma_h, 0 as triagens,
         1 as abertas,
         case when ((d::date + 1)::timestamp at time zone 'America/Sao_Paulo') - r.created_at > interval '24 hours' then 1 else 0 end as paradas_24h,
         case when ((d::date + 1)::timestamp at time zone 'America/Sao_Paulo') - r.created_at > interval '72 hours' then 1 else 0 end as paradas_72h
  from r
  cross join lateral generate_series(
    r.c_dia::timestamp,
    case when r.fechada_em is null then (now() at time zone 'America/Sao_Paulo')::date::timestamp
         else ((r.fechada_em at time zone 'America/Sao_Paulo')::date - 1)::timestamp end,
    interval '1 day') d
),
tudo as (select * from eventos union all select * from abertas)
select
  t.dia,
  t.requested_by as seller_id,
  p.full_name as vendedor,
  t.tipo,
  t.prioridade,
  sum(t.criadas)::int as criadas,
  sum(t.aprovadas)::int as aprovadas,
  sum(t.recusadas)::int as recusadas,
  sum(t.canceladas)::int as canceladas,
  sum(t.triagens)::int as triagens,
  case when sum(t.triagens) > 0 then round(sum(t.triagem_soma_h) / sum(t.triagens), 2) end as triagem_h_medio,
  sum(t.abertas)::int as abertas_fim_dia,
  sum(t.paradas_24h)::int as paradas_mais_24h,
  sum(t.paradas_72h)::int as paradas_mais_72h
from tudo t
join public.profiles p on p.id = t.requested_by
group by t.dia, t.requested_by, p.full_name, t.tipo, t.prioridade;

-- ═════════════════════════════════════════════════════════════════════════
-- 4. Conteúdo por dia e prioridade (eventos vêm de content_events, gravados por trigger)
--    Rodadas de ajustes e tempo em aprovação são atribuídos ao dia em que o item foi publicado / saiu de aprovação.
-- ═════════════════════════════════════════════════════════════════════════
create view analytics.v_conteudo_dia as
with it as (
  select id, priority as prioridade, created_at,
         (created_at at time zone 'America/Sao_Paulo')::date as c_dia
  from public.content_items
),
ev as (
  select e.content_id, e.from_status, e.to_status, e.created_at,
         (e.created_at at time zone 'America/Sao_Paulo')::date as dia,
         lead(e.created_at) over (partition by e.content_id order by e.created_at, e.id) as proximo_em
  from public.content_events e
  where e.event_type = 'status_change'
),
ajustes_por_item as (
  select content_id, count(*) as rodadas from ev where to_status = 'ajustes' group by 1
),
eventos as (
  select it.c_dia as dia, it.prioridade,
         1 as criados, 0 as publicados, 0 as aprovados, 0 as devolvidos,
         0::numeric as aprov_soma_h, 0 as aprov_n, 0::numeric as rodadas_soma
  from it
  union all
  select ev.dia, it.prioridade, 0, 1, 0, 0, 0, 0, coalesce(a.rodadas, 0)
  from ev join it on it.id = ev.content_id
  left join ajustes_por_item a on a.content_id = ev.content_id
  where ev.to_status = 'publicado'
  union all
  select ev.dia, it.prioridade, 0, 0, 1, 0, 0, 0, 0
  from ev join it on it.id = ev.content_id where ev.to_status = 'aprovado'
  union all
  select ev.dia, it.prioridade, 0, 0, 0, 1, 0, 0, 0
  from ev join it on it.id = ev.content_id where ev.to_status = 'ajustes'
  union all
  -- intervalo em em_aprovacao, contado no dia em que terminou
  select (ev.proximo_em at time zone 'America/Sao_Paulo')::date, it.prioridade, 0, 0, 0, 0,
         extract(epoch from (ev.proximo_em - ev.created_at)) / 3600.0, 1, 0
  from ev join it on it.id = ev.content_id
  where ev.to_status = 'em_aprovacao' and ev.proximo_em is not null
)
select
  dia,
  prioridade,
  sum(criados)::int as criados,
  sum(publicados)::int as publicados,
  sum(aprovados)::int as aprovados,
  sum(devolvidos)::int as devolvidos_ajustes,
  sum(aprov_n)::int as intervalos_aprovacao,
  case when sum(aprov_n) > 0 then round(sum(aprov_soma_h) / sum(aprov_n), 2) end as tempo_aprovacao_h_medio,
  case when sum(publicados) > 0 then round(sum(rodadas_soma) / sum(publicados), 2) end as rodadas_ajustes_medio
from eventos
group by dia, prioridade;

-- Mesmos eventos por canal (item com vários canais conta em cada um: NÃO somar entre canais).
-- Canal fora da lista fixa vira 'Outro'; item sem canal vira 'Sem canal'.
create view analytics.v_conteudo_canal_dia as
with it as (
  select i.id, i.created_at,
         (i.created_at at time zone 'America/Sao_Paulo')::date as c_dia,
         case when cardinality(i.channels) = 0 then array['Sem canal'] else i.channels end as canais
  from public.content_items i
),
itc as (
  select it.id, it.c_dia,
         case when c in ('Instagram Feed', 'Instagram Reels', 'Instagram Stories', 'Facebook', 'LinkedIn', 'YouTube',
                         'TikTok', 'Site/Blog', 'E-mail', 'WhatsApp', 'Meta Ads', 'Google Ads', 'Outro', 'Sem canal')
              then c else 'Outro' end as canal
  from it cross join lateral unnest(it.canais) as c
  group by 1, 2, 3
),
eventos as (
  select c_dia as dia, canal, 1 as criados, 0 as publicados, 0 as aprovados, 0 as devolvidos from itc
  union all
  select (e.created_at at time zone 'America/Sao_Paulo')::date, itc.canal,
         0, (e.to_status = 'publicado')::int, (e.to_status = 'aprovado')::int, (e.to_status = 'ajustes')::int
  from public.content_events e join itc on itc.id = e.content_id
  where e.event_type = 'status_change' and e.to_status in ('publicado', 'aprovado', 'ajustes')
)
select dia, canal,
       sum(criados)::int as criados, sum(publicados)::int as publicados,
       sum(aprovados)::int as aprovados, sum(devolvidos)::int as devolvidos_ajustes
from eventos
group by dia, canal;

-- Situação atual (uma linha por status e prioridade): itens, urgentes em aberto, programados vencidos sem publicar.
create view analytics.v_conteudo_status as
select
  status,
  priority as prioridade,
  count(*)::int as itens,
  count(*) filter (where priority = 'urgente' and status not in ('publicado', 'arquivado'))::int as urgentes_em_aberto,
  count(*) filter (where scheduled_for is not null and scheduled_for < now()
                     and status not in ('publicado', 'arquivado'))::int as atrasados
from public.content_items
group by status, priority;

-- ═════════════════════════════════════════════════════════════════════════
-- 5. Da solicitação à entrega (publicado; se nunca publicado, aprovado), por mês da entrega e prioridade
-- ═════════════════════════════════════════════════════════════════════════
create view analytics.v_solicitacao_para_entrega as
with pub as (
  select content_id, min(created_at) as publicado_em
  from public.content_events
  where event_type = 'status_change' and to_status = 'publicado'
  group by 1
),
x as (
  select
    r.priority as prioridade, r.created_at as pedido_em,
    coalesce(p.publicado_em, case when i.status in ('aprovado', 'publicado') then i.approved_at end) as entrega_em,
    (p.publicado_em is not null) as foi_publicado
  from public.content_requests r
  join public.content_items i on i.id = r.content_id
  left join pub p on p.content_id = i.id
  where r.status = 'aprovada'
)
select
  to_char(entrega_em at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes,
  prioridade,
  count(*)::int as entregas,
  count(*) filter (where foi_publicado)::int as entregas_publicadas,
  round(avg(extract(epoch from (entrega_em - pedido_em)) / 3600.0)::numeric, 2) as horas_medio
from x
where entrega_em is not null and entrega_em >= pedido_em
group by 1, 2;

-- ═════════════════════════════════════════════════════════════════════════
-- 6. Permissões: só a service_role lê. Views rodam com os direitos do dono (ignoram RLS) — por isso o revoke.
-- ═════════════════════════════════════════════════════════════════════════
do $$
declare v text;
begin
  for v in
    select viewname from pg_views where schemaname = 'analytics'
  loop
    execute format('revoke all on analytics.%I from public, anon, authenticated', v);
    execute format('grant select on analytics.%I to service_role', v);
  end loop;
end $$;

-- Views novas no futuro não herdam acesso de ninguém por engano
alter default privileges in schema analytics revoke all on tables from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

notify pgrst, 'reload schema';
