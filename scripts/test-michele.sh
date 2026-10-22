#!/usr/bin/env bash
# Checklist do endpoint POST /api/michele/ingest. NÃO contém o secret: ele vem do ambiente.
#
#   BASE_URL=http://localhost:3000 MICHELE_INGEST_SECRET=... bash scripts/test-michele.sh
#
# Cria (e repete) o atendimento de teste "5500000000099:teste-curl"; exclua-o depois em /admin/michele/conversas.
set -u
BASE="${BASE_URL:-http://localhost:3000}"
URL="$BASE/api/michele/ingest"
SECRET="${MICHELE_INGEST_SECRET:?defina MICHELE_INGEST_SECRET}"
pass=0; fail=0

check() { # descrição esperado obtido
  if [ "$2" = "$3" ]; then echo "OK    $1"; pass=$((pass+1)); else echo "FALHA $1 (esperado $2, veio $3)"; fail=$((fail+1)); fi
}
post() { # corpo [headers...] → código HTTP
  local body="$1"; shift
  curl -s -o /dev/null -w '%{http_code}' -X POST "$URL" -H 'Content-Type: application/json' "$@" -d "$body"
}

VALID='{"sessao_id":"5500000000099:teste-curl","telefone":"+55 (00) 00000-0099","nome":"Teste curl","origem":"whatsapp","status":"em_andamento","cnpj_cpf":"123.456.789-09","mensagens":[{"ordem":0,"papel":"lead","texto":"oi","enviada_em":"2026-10-21T22:00:00.000Z"},{"ordem":1,"papel":"michele","texto":"olá","enviada_em":"2026-10-21T22:00:05.000Z"}]}'
H=(-H "x-ingest-secret: $SECRET")

echo "── autenticação"
check "sem x-ingest-secret → 401"  401 "$(post "$VALID")"
check "secret errado → 401"        401 "$(post "$VALID" -H 'x-ingest-secret: errado')"

echo "── validação"
check "JSON inválido → 400"             400 "$(post '{nao e json' "${H[@]}")"
check "sem telefone → 400"              400 "$(post '{"sessao_id":"x"}' "${H[@]}")"
check "status inválido → 400"           400 "$(post '{"sessao_id":"x","telefone":"5500000000099","status":"abc"}' "${H[@]}")"
check "papel inválido → 400"            400 "$(post '{"sessao_id":"x","telefone":"5500000000099","mensagens":[{"ordem":0,"papel":"x","texto":"a"}]}' "${H[@]}")"
check "data no futuro → 400"            400 "$(post '{"sessao_id":"x","telefone":"5500000000099","iniciado_em":"2099-01-01T00:00:00Z"}' "${H[@]}")"
check "texto > 8000 → 400"              400 "$(post "{\"sessao_id\":\"x\",\"telefone\":\"5500000000099\",\"mensagens\":[{\"ordem\":0,\"papel\":\"lead\",\"texto\":\"$(head -c 8001 /dev/zero | tr '\0' a)\"}]}" "${H[@]}")"
MANY=$(node -e 'console.log(JSON.stringify({sessao_id:"x",telefone:"5500000000099",mensagens:Array.from({length:51},(_,i)=>({ordem:i,papel:"lead",texto:"a"}))}))')
check "51 mensagens → 400"              400 "$(post "$MANY" "${H[@]}")"
BIG=$(node -e 'console.log(JSON.stringify({sessao_id:"x",telefone:"5500000000099",resumo:{a:"x".repeat(300000)}}))')
check "corpo > 256 KB → 413"            413 "$(post "$BIG" "${H[@]}")"

echo "── gravação"
check "payload válido → 200"            200 "$(post "$VALID" "${H[@]}")"
BODY="$(curl -s -X POST "$URL" -H 'Content-Type: application/json' "${H[@]}" -d "$VALID")"
echo "$BODY" | grep -Eq '"ok":true,"atendimento_id":"[0-9a-f-]{36}"' && { echo "OK    resposta com atendimento_id"; pass=$((pass+1)); } || { echo "FALHA resposta inesperada"; fail=$((fail+1)); }
check "repetir o mesmo payload → 200"   200 "$(post "$VALID" "${H[@]}")"
curl -sI -X POST "$URL" "${H[@]}" | grep -qi 'cache-control: no-store' && { echo "OK    Cache-Control: no-store"; pass=$((pass+1)); } || { echo "FALHA sem no-store"; fail=$((fail+1)); }

echo; echo "$pass OK, $fail falha(s)"
[ "$fail" -eq 0 ]
