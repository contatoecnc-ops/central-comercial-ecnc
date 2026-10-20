#!/usr/bin/env bash
# Checklist do endpoint /api/analise/resumo (itens 4 a 9). NÃO contém token: ele vem do ambiente.
#
#   BASE_URL=http://localhost:3000 ANALYSIS_TOKEN=... \
#   [PROIBIDOS="titulo de teste|@exemplo.com"] \
#   [COOKIE_ADMIN="sb-...=..."] [COOKIE_VENDEDOR="..."] [COOKIE_MARKETING="..."] \
#   bash scripts/test-analise.sh
#
# Os cookies de sessão (opcionais) são copiados do navegador (DevTools → Application → Cookies) de cada perfil.
# PROIBIDOS: regex com títulos/e-mails/nomes de cliente de teste que NÃO podem aparecer na resposta.
# Atenção: o limite é 30 req/h por IP; este script usa ~20.
set -u
BASE="${BASE_URL:-http://localhost:3000}"
URL="$BASE/api/analise/resumo"
TOKEN="${ANALYSIS_TOKEN:?defina ANALYSIS_TOKEN}"
pass=0; fail=0

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
check() { # descrição esperado obtido
  if [ "$2" = "$3" ]; then echo "OK    $1"; pass=$((pass+1)); else echo "FALHA $1 (esperado $2, veio $3)"; fail=$((fail+1)); fi
}

echo "── 4. autenticação"
check "sem cabeçalho → 401"            401 "$(code "$URL")"
check "token errado → 401"             401 "$(code -H 'Authorization: Bearer token-errado' "$URL")"
check "token na query string → 401"    401 "$(code "$URL?token=$TOKEN")"
check "Bearer com esquema errado → 401" 401 "$(code -H "Authorization: Basic $TOKEN" "$URL")"

echo "── 5. resposta com token correto"
AUTH=(-H "Authorization: Bearer $TOKEN")
check "token correto → 200" 200 "$(code "${AUTH[@]}" "$URL")"
BODY="$(curl -s "${AUTH[@]}" "$URL")"
if echo "$BODY" | node -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))' 2>/dev/null; then echo "OK    JSON válido"; pass=$((pass+1)); else echo "FALHA JSON inválido"; fail=$((fail+1)); fi
if echo "$BODY" | grep -Eq '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}'; then echo "FALHA e-mail na resposta"; fail=$((fail+1)); else echo "OK    sem e-mail na resposta"; pass=$((pass+1)); fi
if [ -n "${PROIBIDOS:-}" ] && echo "$BODY" | grep -Eqi "$PROIBIDOS"; then echo "FALHA padrão proibido na resposta"; fail=$((fail+1)); else echo "OK    sem padrões proibidos (PROIBIDOS=${PROIBIDOS:-não informado})"; pass=$((pass+1)); fi
curl -sI "${AUTH[@]}" "$URL" | grep -qi 'cache-control: no-store' && { echo "OK    Cache-Control: no-store"; pass=$((pass+1)); } || { echo "FALHA sem no-store"; fail=$((fail+1)); }

echo "── 6. parâmetros inválidos"
check "período > 92 dias → 400"  400 "$(code "${AUTH[@]}" "$URL?from=2026-01-01&to=2026-06-01")"
check "data inválida → 400"      400 "$(code "${AUTH[@]}" "$URL?from=2026-13-40&to=2026-02-01")"
check "to < from → 400"          400 "$(code "${AUTH[@]}" "$URL?from=2026-02-10&to=2026-02-01")"
check "só from → 400"            400 "$(code "${AUTH[@]}" "$URL?from=2026-02-01")"
check "formato inválido → 400"   400 "$(code "${AUTH[@]}" "$URL?formato=xml")"
check "92 dias exatos → 200"     200 "$(code "${AUTH[@]}" "$URL?from=2026-01-01&to=2026-04-02")"

echo "── 7. sessões"
[ -n "${COOKIE_VENDEDOR:-}" ]  && check "vendedor → 403"  403 "$(code -H "Cookie: $COOKIE_VENDEDOR" "$URL")"  || echo "PULOU vendedor (sem COOKIE_VENDEDOR)"
[ -n "${COOKIE_MARKETING:-}" ] && check "marketing → 403" 403 "$(code -H "Cookie: $COOKIE_MARKETING" "$URL")" || echo "PULOU marketing (sem COOKIE_MARKETING)"
[ -n "${COOKIE_ADMIN:-}" ]     && check "admin → 200"     200 "$(code -H "Cookie: $COOKIE_ADMIN" "$URL")"     || echo "PULOU admin (sem COOKIE_ADMIN)"

echo "── 8. período sem eventos → 200 com zeros"
check "período antigo vazio → 200" 200 "$(code "${AUTH[@]}" "$URL?from=2000-01-03&to=2000-01-09")"
curl -s "${AUTH[@]}" "$URL?from=2000-01-03&to=2000-01-09" | node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(r.tarefas.total.criadas===0&&r.conteudo.criados===0&&r.solicitacoes.total.criadas===0?"OK    zeros no período vazio":"FALHA período vazio não zerou")'

echo "── 9. Markdown"
curl -s "${AUTH[@]}" "$URL?formato=md" | head -25

echo; echo "Resultado: $pass ok, $fail falhas"
[ "$fail" -eq 0 ]
