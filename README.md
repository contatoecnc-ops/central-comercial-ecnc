# Central Comercial ECNC

Sistema interno da equipe de vendas ECNC: tarefas com SLA e comentários, catálogo de máquinas e manuais de vendas.
Next.js 14 (App Router) · Supabase (Auth + Postgres + RLS) · Tailwind · Vercel.

## Setup

1. Crie um projeto no Supabase e execute `supabase/schema.sql` no SQL Editor.
2. Em **Authentication > Users**, crie o primeiro usuário (email + senha, Auto Confirm) e rode o `insert` do final do `schema.sql` para torná-lo admin.
3. Copie `.env.example` para `.env.local` e preencha:
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=   # só no servidor; nunca com prefixo NEXT_PUBLIC
   ```
4. `npm install && npm run dev` → http://localhost:3000
5. Demais usuários são criados pelo admin em `/admin/usuarios`.

## Deploy (Vercel)

Push para o GitHub → importar em vercel.com/new → adicionar as variáveis de ambiente (as 3 do Supabase e as da Fase 2 abaixo) → deploy a cada push em `main`.

## Fase 2

Execute `supabase/migrations/003_fase2.sql` no SQL Editor (idempotente; pode rodar mais de uma vez).

- **Lembretes do gestor**: admin cria/edita/desativa/exclui em *Usuários → Lembretes*. O vendedor só lê (card no dashboard).
- **Tarefas próprias**: o vendedor cria tarefas para si (`/vendedor/tarefas/nova`), edita e cancela as que criou. Nas atribuídas pelo gestor continua só status e comentário. As métricas de SLA do admin ignoram tarefas próprias.
- **Vendas**: planilha KPI_Vendas_2026 (linhas de pedido). A Central agrega por vendedor e mês e grava **só totais** em `sales_numbers` (nada de cliente ou pedido). Abas, cabeçalhos, apelidos de origem e listas de ex-vendedor e outras receitas em `lib/sales-config.ts`. Vínculo pelo campo *Nome na planilha* (= texto exato da coluna Vendedor). Execute também `supabase/migrations/004_vendas_reais.sql`.
  - Meta mensal do vendedor = soma das linhas de origem da aba dele (1ª palavra do nome = título da aba). Total vendido = soma de `Valor Total` sem filtros (bate com `Resumo`); a conferência aparece em `/admin/vendas`.
  - Teste do leitor: `SALES_FIXTURE_XLSX="caminho/KPI Vendas 2026.xlsx" npm run test:sales` (a planilha fica fora do repositório; `*.xlsx` está no `.gitignore`).

### Variáveis de ambiente

| Variável | Uso |
|---|---|
| `SALES_SOURCE` | `mock` (dados de exemplo) ou `sheets`. Vazio: `sheets` se houver credenciais |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | e-mail da service account |
| `GOOGLE_PRIVATE_KEY` | chave privada do JSON (as quebras de linha \n são tratadas) |
| `GOOGLE_SHEET_ID` | ID da planilha/arquivo |
| `CRON_SECRET` | segredo do cron e de chamadas automáticas a `/api/sync-vendas` |

### Service account do Google (passo a passo)

1. console.cloud.google.com → criar/selecionar projeto → **APIs e serviços → Biblioteca** → ativar **Google Sheets API** (e **Google Drive API**, necessária só se o arquivo for `.xlsx`).
2. **IAM → Contas de serviço → Criar** (sem papéis). Em *Chaves → Adicionar chave → JSON*, baixe o arquivo.
3. Do JSON, copie `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `private_key` → `GOOGLE_PRIVATE_KEY`.
4. No Drive, **compartilhe a planilha com o e-mail da service account** (Leitor).
5. `GOOGLE_SHEET_ID` é o trecho entre `/d/` e `/edit` na URL.
6. Defina `CRON_SECRET` (`openssl rand -hex 32`) na Vercel. O cron diário (`vercel.json`, `0 11 * * *` = 08:00 em Brasília) chama `/api/sync-vendas`.
7. Em **/admin/vendas → Atualizar agora**, confira o painel de conferência e os avisos.

> Se o arquivo no Drive for um `.xlsx` (e não uma planilha Google nativa), a leitura funciona via Drive API, mas **converter para Google Sheets** (Arquivo → Salvar como Planilhas Google) é mais simples e confiável.


## Notas

- Segurança em duas camadas: middleware/layouts por role + RLS no Postgres (vendedor só vê as próprias tarefas; nas atribuídas pelo gestor só muda status, nunca edita ou cancela).
- Comentários são imutáveis (sem policy de update/delete).
- Datas em `America/Sao_Paulo`; o prazo é digitado em horário de Brasília e salvo em UTC.
- SLA: > 24h verde · ≤ 24h amarelo · vencida vermelho · concluída cinza.
