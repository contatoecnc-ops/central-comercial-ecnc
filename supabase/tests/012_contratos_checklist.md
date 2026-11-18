# Checklist manual — Contratos (migração 012)

Pré-requisitos: migração 012 aplicada; blocos de `012_contratos_testes.sql` todos com "OK"; os 2 modelos `.docx` no bucket `modelos-contrato`; variáveis na Vercel (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`); usuários de teste (admin, vendedor liberado, vendedor NÃO liberado, marketing, analista). Em `/admin/usuarios/<id>/contrato`, preencha CPF e celular do vendedor de teste e marque "Liberar Contratos".

## Menu e acesso por papel
| Papel | Menu | `/admin/contratos` | `/vendedor/contratos` e `/vendedor/contratos/chat` | `/admin/usuarios/<id>/contrato` |
|---|---|---|---|---|
| Admin | "Contratos" (com contador de aguardando aprovação) | Kanban com todos | Acesso negado (403) | Abre e salva |
| Vendedor liberado | "Contratos" | Acesso negado (403) | Kanban só dos dele; chat abre | Acesso negado (403) |
| Vendedor NÃO liberado | Sem o item "Contratos" | Acesso negado (403) | Acesso negado | Acesso negado (403) |
| Marketing | Sem o item | Acesso negado (403) | Acesso negado (403) | Redireciona ao dashboard |
| Analista | Sem o item | Acesso negado (403) | Acesso negado (403) | Acesso negado (403) |

Também conferir:
- Dashboard do admin: tile "Contratos aguardando aprovação". Dashboard do analista (`/analista/dashboard`): **sem** o tile.
- Marketing e analista: `/admin/contratos/<id-de-contrato>` e `/admin/contratos/configuracoes` → Acesso negado.

## Rotas de API (console do navegador logado, ou curl com o cookie)
| Chamada | Esperado |
|---|---|
| Sem sessão: qualquer `/api/contratos/...` | 401 |
| Analista ou marketing: `POST /api/contratos/chat`, `GET /api/contratos/<id>/arquivo` | 403 |
| Vendedor A: `GET/POST /api/contratos/<id de B>/...` | 404 genérico `{"erro":"Contrato não encontrado."}` |
| Vendedor: `POST .../aprovar`, `.../reprovar`, `.../assinado`, `.../documentos` | 403 |
| Vendedor não liberado: `POST /api/contratos/chat` | 403 |
| Admin: `POST .../assinado` com `ZAPSIGN_ATIVO=true` | 403 |
| Admin: `POST .../enviado` com `ZAPSIGN_ATIVO=true` | 409 |
| `id` que não é UUID | 404 |
| Corpo com campo extra (ex.: `{"motivo":"x","admin":true}`) | 400 |
| `POST /api/contratos/chat` com mais de 8000 caracteres | 400 |
| 31ª mensagem do mesmo vendedor em 1 hora | 429 |
| `GET /api/contratos/<id>/arquivo` (dono ou admin) | 302 para URL assinada que expira em 60 s |
| Upload em `documentos` com um `.exe` renomeado para `.pdf` | 400 ("Envie um arquivo PDF, JPG ou PNG.") |
| Upload com mais de 10 MB | 400 |
| `POST /api/telegram/webhook` sem o header de segredo ou com segredo errado | 403 |
| `POST /api/zapsign/webhook` sem `Authorization` ou com segredo errado | 403 |
| `POST /api/zapsign/webhook` com segredo certo e evento desconhecido / `doc_token` inexistente | 200, nada muda |
| `POST /api/telegram/configurar` e `/api/zapsign/configurar` por vendedor/analista | 403 |

## Fluxo funcional (vendedor liberado + admin)
1. Contrato padrão PJ, outro PF, um de Atenção e um faturado (Atenção máxima, com documentos): cada um aparece em "Aguardando aprovação" com o selo de nível certo; passar o mouse no selo mostra os motivos.
2. Faturado: "Aprovar" desabilitado com o motivo; marcar os documentos (com e sem arquivo) e aprovar.
3. Aprovar → card em "Pronto para enviar"; baixar o `.docx` (conferir quadro IV, IV.4, IV.6, cláusula).
4. Com ZapSign desligado: "Marquei como enviado" → "Com o cliente" → admin "Marcar como assinado" → "Assinado".
5. Reprovar (motivo obrigatório) → card em "Reprovado — corrigir" com o motivo; vendedor clica "Corrigir", o chat abre com a mensagem pronta; ao regerar, o **mesmo número** volta para "Aguardando aprovação" com aprovações zeradas.
6. Cancelar (vendedor dono e admin): sai do quadro e aparece em "Ver cancelados". Contrato assinado não cancela.
7. Vendedor abrindo o contrato de outro vendedor pela URL → 404; vendedor tentando aprovar por API → 403; analista abrindo qualquer URL de contratos → Acesso negado.
8. "Novo contrato" no chat encerra a conversa e abre outra.

## Telegram (depois do chat validado; 1 vendedor)
- Variáveis `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `CENTRAL_URL`; em `/admin/contratos/configuracoes`, "Configurar webhook do Telegram".
- Usuário não cadastrado manda `/start` → recebe só o ID do Telegram dele.
- Cadastrar o ID (tela "Dados para contrato"); conversa completa até gerar o contrato; admin com Telegram recebe resumo + `.docx` + botão da Central.
- Aprovar na Central → vendedor recebe o `.docx` no Telegram. Reprovar → vendedor recebe o motivo; corrigir pelo Telegram mantém o número.
- Vendedor desativado na Central ou com "Liberar Contratos" desmarcado → o bot para de atender na hora.
- Grupo/canal: o bot ignora (só conversa privada).

## ZapSign (sandbox)
- `ZAPSIGN_ATIVO=true`, `ZAPSIGN_AMBIENTE=sandbox`; nome completo do gestor preenchido em `lib/contratos-config.ts`; "Configurar webhook do ZapSign".
- Selo "SANDBOX — sem validade" visível no quadro e no detalhe.
- "Enviar para assinatura" (1 contrato de cada nível); PDF do ZapSign: quadro IV (tabela), IV.4, IV.6 e cláusula com várias linhas.
- Assinar como cliente → testemunha (vendedor) → gestor: o card anda sozinho até "Assinado"; avisos chegam ("sua vez", "assinado"). Testar uma recusa: card com destaque vermelho.
- Vendedor **não** vê o link de assinatura do gestor no detalhe.
