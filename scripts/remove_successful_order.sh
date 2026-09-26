#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Pouziti:
  ./scripts/remove_successful_order.sh --email EMAIL --vs VARIABILNI_SYMBOL [--dry-run]

Priklady:
  ./scripts/remove_successful_order.sh --email oldrich.halabala@gmail.com --vs 9979557386
  ./scripts/remove_successful_order.sh --email oldrich.halabala@gmail.com --vs 9979557386 --dry-run

Chovani:
  - hleda posledni objednavku se stavem "paid" podle emailu a variabilniho symbolu
  - smaze navazane zaznamy (payments, ticket_sales, email_outbox, vazby na bank_transactions)
  - smaze i PDF soubor vstupenky (pokud existuje)
EOF
}

EMAIL=""
VS=""
DRY_RUN="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --email)
      if [[ $# -lt 2 ]]; then
        echo "Chybi hodnota pro --email" >&2
        exit 1
      fi
      EMAIL="$2"
      shift 2
      ;;
    --vs|--variable-symbol)
      if [[ $# -lt 2 ]]; then
        echo "Chybi hodnota pro --vs" >&2
        exit 1
      fi
      VS="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Neznamy argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$EMAIL" || -z "$VS" ]]; then
  echo "Musis zadat --email a --vs" >&2
  usage >&2
  exit 1
fi

echo "Hledam zaplacenou objednavku pro email=$EMAIL a VS=$VS (dry-run=$DRY_RUN)"

docker compose exec -T backend python - "$EMAIL" "$VS" "$DRY_RUN" <<'PY'
import json
import sys
from pathlib import Path

from app.database import get_connection

email = sys.argv[1].strip()
vs = sys.argv[2].strip()
dry_run = sys.argv[3].strip().lower() == "true"

with get_connection() as conn:
    order = conn.execute(
        """
        SELECT * FROM orders
        WHERE customer_email = ? AND variable_symbol = ? AND status = 'paid'
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (email, vs),
    ).fetchone()

    if order is None:
        raise SystemExit("Nenalezena zadna zaplacena objednavka pro zadane kriterium.")

    order_id = order["id"]
    ticket_file_path = order["ticket_file_path"]

    counters = {
        "payments": conn.execute("SELECT COUNT(*) FROM payments WHERE order_id = ?", (order_id,)).fetchone()[0],
        "ticket_sales": conn.execute("SELECT COUNT(*) FROM ticket_sales WHERE order_id = ?", (order_id,)).fetchone()[0],
        "email_outbox": conn.execute("SELECT COUNT(*) FROM email_outbox WHERE order_id = ?", (order_id,)).fetchone()[0],
        "bank_transactions": conn.execute(
            "SELECT COUNT(*) FROM bank_transactions WHERE matched_order_id = ?", (order_id,)
        ).fetchone()[0],
    }

    result = {
        "order_id": order_id,
        "order_number": order["order_number"],
        "customer_email": order["customer_email"],
        "variable_symbol": order["variable_symbol"],
        "status": order["status"],
        "ticket_file_path": ticket_file_path,
        "dry_run": dry_run,
        "would_delete": counters,
    }

    if dry_run:
        print(json.dumps(result, ensure_ascii=True, indent=2))
        raise SystemExit(0)

    conn.execute("DELETE FROM payments WHERE order_id = ?", (order_id,))
    conn.execute("DELETE FROM ticket_sales WHERE order_id = ?", (order_id,))
    conn.execute("DELETE FROM email_outbox WHERE order_id = ?", (order_id,))
    conn.execute("UPDATE bank_transactions SET matched_order_id = NULL, match_status = 'unmatched', updated_at = updated_at WHERE matched_order_id = ?", (order_id,))
    conn.execute("DELETE FROM orders WHERE id = ?", (order_id,))
    conn.commit()

if ticket_file_path:
    path = Path(ticket_file_path)
    if path.exists():
        path.unlink()
        result["ticket_file_deleted"] = True
    else:
        result["ticket_file_deleted"] = False
else:
    result["ticket_file_deleted"] = False

result["deleted"] = True
print(json.dumps(result, ensure_ascii=True, indent=2))
PY
