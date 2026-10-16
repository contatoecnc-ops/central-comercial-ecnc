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

Push para o GitHub → importar em vercel.com/new → adicionar as 3 variáveis de ambiente → deploy a cada push em `main`.

## Notas

- Segurança em duas camadas: middleware/layouts por role + RLS no Postgres (vendedor só vê as próprias tarefas; só pode concluir/iniciar, nunca editar ou cancelar).
- Comentários são imutáveis (sem policy de update/delete).
- Datas em `America/Sao_Paulo`; o prazo é digitado em horário de Brasília e salvo em UTC.
- SLA: > 24h verde · ≤ 24h amarelo · vencida vermelho · concluída cinza.
