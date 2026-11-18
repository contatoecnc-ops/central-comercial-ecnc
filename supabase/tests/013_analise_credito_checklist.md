# Checklist manual — Análise de crédito (migração 013)

Pré-requisitos: migração 013 aplicada; blocos de `013_analise_credito_testes.sql` todos com "OK" (e os de 011 e 012 de novo); usuários de teste (admin, financeiro, vendedor liberado, marketing, analista). `ANALISE_CREDITO_OBRIGATORIA = false` (padrão).

## Trocar o papel de um usuário existente para financeiro
Não existe tela de editar papel. No SQL Editor (troque o e-mail):
```sql
update public.profiles set role = 'financeiro' where email = 'financeiro@exemplo.com';
```
Para criar um usuário novo, use Usuários > "Financeiro (análises de crédito)".

## Acesso por papel
| Papel | Login cai em | `/financeiro/analises` | `/admin/contratos/analises` | `/admin/*`, `/vendedor/*`, `/marketing/*`, `/analista/*`, `/admin/contratos`, `/admin/michele` |
|---|---|---|---|---|
| Financeiro | `/financeiro/analises` (menu com 1 item: "Análises de crédito") | Abre | Acesso negado (403) | Acesso negado (403) |
| Admin | dashboard | Abre (vê todos os envios) | Abre | Abre |
| Vendedor liberado | dashboard | Acesso negado (403) | Acesso negado (403) | só o que já tinha |
| Marketing | dashboard | Acesso negado (403) | Acesso negado (403) | só o que já tinha |
| Analista | dashboard | Acesso negado (403) | Acesso negado (403) | só o que já tinha |

## Rotas de API (console do navegador logado, ou curl com o cookie)
| Chamada | Esperado |
|---|---|
| Sem sessão: qualquer `/api/analises...` | 401 |
| Vendedor, marketing ou analista: `POST/GET /api/analises`, `GET /api/analises/<id>/arquivo`, `POST/DELETE .../vincular` | 403 |
| Financeiro: `GET /api/analises/<id>/arquivo`, `POST/DELETE .../vincular`, `GET /api/analises/contratos` | 403 |
| Financeiro: `GET /api/analises` | só os envios dele, documentos mascarados, sem dado de contrato |
| Admin: `GET /api/analises/<id>/arquivo` | 302 para URL assinada que expira em 60 s |
| id que não é UUID | 404 |
| `POST /api/analises` com arquivo `.exe` renomeado para `.pdf` | 400 "Envie um arquivo PDF." |
| `POST /api/analises` com PDF acima de 10 MB | 400 ou 413 |
| `POST /api/analises` com CPF/CNPJ de dígito inválido, 4 documentos, resultado fora de aprovada/reprovada, data futura, validade anterior à análise | 400 |
| Campo extra no formulário | 400 |
| 31º envio do mesmo usuário em 1 hora | 429 |
| Vendedor: qualquer link/rota do PDF da análise | 403 (não existe link na tela dele) |

## Fluxo funcional
1. **Análise antes do contrato:** financeiro sobe uma análise (CNPJ da empresa + CPF do garantidor) → aparece na lista dele como "Aguardando contrato" (sem dado de contrato); no admin, "Aguardando contrato" na caixa de entrada com documento mascarado. Telegram (se configurado): "Nova análise de crédito na caixa de entrada" (sem nome nem documento).
2. **Ligação automática:** o vendedor gera um contrato parcelado em boleto com o mesmo CNPJ → o card já mostra "Análise: aprovada · vale até dd/mm"; no detalhe, bloco "Análise de crédito" com vínculo "automático", "Abrir PDF" e "Desvincular"; histórico com "Análise de crédito vinculada".
3. **Só o CPF do garantidor:** contrato que traz o mesmo CPF só como garantidor (ou signatário) também liga.
4. **Corrigir contrato:** reprovar e corrigir pelo chat não duplica o vínculo.
5. **Contrato à vista** (e cartão, financiamento): sem selo e sem bloco de análise.
6. **Vencida:** análise com validade no passado mostra "Vencida" (amarelo). **Reprovada:** selo vermelho.
7. **Validade em branco:** análise de 01/11 sem validade digitada vale até 31/12 (60 dias).
8. **Várias análises no mesmo contrato:** vale a mais recente (por data da análise); o detalhe indica qual.
9. **Sem análise** (chave `false`): card e detalhe mostram o aviso vermelho "sem análise de crédito vinculada"; **Aprovar continua funcionando**.
10. **Chave `true`** (teste e volte para `false`): contrato parcelado sem análise válida → botão Aprovar desabilitado com o motivo e `POST /api/contratos/<id>/aprovar` devolve 409; com análise aprovada e vigente funciona; vencida ou reprovada continua barrando; contrato à vista não é afetado.
11. **Vincular/desvincular manual** pela caixa de entrada (busca por número ou cliente) e pelo detalhe; o evento aparece no histórico.
12. **Busca** na caixa de entrada por nome e por CPF/CNPJ completo.
13. **Dashboard do admin:** contadores "Análises aguardando contrato" e "Contratos parcelados sem análise". O dashboard do analista não mostra contratos nem análises.
14. **Vendedor:** vê só "Análise de crédito: aprovada / pendente / reprovada / vencida" no card e no detalhe (sem validade, sem bloco, sem link, sem eventos de análise no histórico).
15. **Financeiro** abrindo `/admin/*`, `/vendedor/*` e `/admin/contratos` cai em "Acesso negado".
