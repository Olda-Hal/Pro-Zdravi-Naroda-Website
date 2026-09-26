#!/usr/bin/env bash
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:8093}"
OUT_FILE="${OUT_FILE:-.tmp-last-order.json}"

NAME="${1:-Test Uzivatel}"
EMAIL="${2:-test+ticket@example.com}"
COUNT="${3:-2}"

if ! [[ "$COUNT" =~ ^[0-9]+$ ]] || [[ "$COUNT" -lt 1 ]]; then
  echo "ticket_count musi byt kladne cele cislo" >&2
  exit 1
fi

payload=$(cat <<JSON
{"customer_name":"$NAME","customer_email":"$EMAIL","ticket_count":$COUNT}
JSON
)

response=$(curl -sS -f -X POST "$BACKEND_URL/api/tickets/orders" \
  -H "Content-Type: application/json" \
  -d "$payload")

printf '%s\n' "$response" > "$OUT_FILE"

echo "Objednavka vytvorena. Ulozeno do $OUT_FILE"
printf '%s\n' "$response" | python3 -c '
import json,sys
x=json.load(sys.stdin)
print("order_id:", x["id"])
print("order_number:", x["order_number"])
print("status:", x["status"])
print("variable_symbol:", x["payment_instructions"]["variable_symbol"])
print("amount_czk:", x["amount"])
print("expires_at:", x["payment_instructions"]["expires_at"])
'
