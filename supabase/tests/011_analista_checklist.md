# Checklist manual — papel analista (migração 011)

Pré-requisitos: migração 011 aplicada; usuário de teste com perfil **Analista** (Usuários > Novo usuário > Perfil "Analista (somente leitura)"); alguns dados reais em tarefas, vendas, catálogo, manuais, solicitações e conteúdo.
Rode antes os blocos de `011_analista_testes.sql`. Entre com o analista e confira cada linha.

## Login e menu
| Verificar | Esperado |
|---|---|
| Login com o analista | Cai em `/analista/dashboard` |
| Menu lateral | Dashboard, Tarefas, Vendas, Catálogo, Manuais, Solicitações, Conteúdo, Análise (nada de Michele IA nem Usuários) |
| Rótulo no rodapé do menu | "analista" |

## Telas de leitura (devem abrir e mostrar os dados)
| Tela | Vê | Não aparece / bloqueado |
|---|---|---|
| Dashboard (`/analista/dashboard`) | Mesmos números do admin (tarefas, SLA, vendas, por vendedor) | — |
| Tarefas (`/admin/tarefas`) | Lista e filtros de todas as tarefas | Botão "Nova tarefa" |
| Detalhe da tarefa | Dados, prazo, SLA, comentários | "Editar tarefa", botões Iniciar/Concluir/Cancelar, campo de comentário |
| Vendas (`/admin/vendas`) | Abas de mês, bloco de destaque, conferência, tabela, avisos | Botão "Atualizar agora" |
| Catálogo (`/admin/catalogo`) | Lista de máquinas (publicadas e rascunho) | "Nova máquina", Editar, Excluir; o nome não é link |
| Manuais (`/admin/manuais`) | Lista de manuais (inclui inativos e tabela de preços), abre texto e arquivos | "Novo manual", Editar, Excluir |
| Manual aberto (`/admin/manuais/[id]`) | Conteúdo e download dos arquivos (URL assinada) | — |
| Solicitações (`/admin/conteudo/solicitacoes`) | Triagem e histórico de todos os vendedores | — |
| Detalhe da solicitação | Texto, anexos (URL assinada), decisão tomada, conversa | Painel de decisão (aprovar/recusar), campo de comentário |
| Conteúdo: Resumo, Quadro, Calendário | Todos os itens, filtros, navegação | Abas "Aprovações" e "Novo conteúdo"; botões de status nos cartões |
| Detalhe do conteúdo | Dados, arquivos (abrir/baixar), linha do tempo | Prioridade e agendamento só como texto; sem Editar dados, Adicionar versão, Excluir, comentário nem botões de status |
| Análise (`/admin/analise`) | Resumo por período, copiar Markdown, baixar JSON | — |

## URLs que devem dar "Acesso negado" (403) para o analista
Digite cada uma na barra de endereço:

- `/admin/tarefas/nova`, `/admin/catalogo/nova`, `/admin/catalogo/<id>/editar`, `/admin/conteudo/novo`, `/admin/conteudo/aprovacoes`
- `/admin/michele`, `/admin/michele/conversas`, `/admin/michele/conversas/<id>`, `/admin/michele/relatorios`
- `/admin/usuarios`, `/admin/usuarios/<id>/lembretes`
- `/admin/dashboard`, `/vendedor/dashboard`, `/marketing/dashboard`

## Rotas de API (use o console do navegador logado como analista ou curl com o cookie)
| Chamada | Esperado |
|---|---|
| `POST /api/sync-vendas` | 403 `{"error":"Acesso negado"}` (nada é lido da planilha) |
| `GET /api/analise/resumo` | 200 |
| `GET /api/conteudo/arquivo/<id>`, `/api/manuais/arquivo/<id>`, `/api/solicitacoes/arquivo/<id>` | Redireciona para URL assinada |
| `GET /api/solicitacoes/entrega/<id>` | 403 (é do vendedor) |

## Escrita bloqueada no servidor e no banco
A interface do analista não tem botões de escrita, então valide o bloqueio direto no banco e na API:

1. No SQL Editor, rode os blocos 2, 3 e 6 de `011_analista_testes.sql`: todos devem terminar em `OK:`.
2. Com a anon key e o token do analista (`Authorization: Bearer <access_token>`), `POST/PATCH/DELETE` em `/rest/v1/tasks`, `/rest/v1/machines`, `/rest/v1/content_items` e `POST /storage/v1/object/marketing/x.png` devem retornar 401/403 ou afetar 0 linhas.
3. `GET /rest/v1/michele_atendimentos` e `GET /rest/v1/seller_reminders` devem retornar `[]`.

## Regressão dos outros perfis
- **Vendedor**: dashboard, minhas tarefas (criar, iniciar, concluir, comentar), catálogo, manuais, solicitar material (criar, cancelar, comentar), baixar entrega.
- **Marketing**: painel, catálogo (criar/editar), manuais (menos tabela de preços), central de conteúdo (criar, status, arquivos).
- **Admin**: tudo, incluindo Michele IA, Usuários, "Atualizar agora", aprovar/devolver conteúdo, decidir solicitações.
- Criar um usuário novo com cada perfil, inclusive "Analista".
