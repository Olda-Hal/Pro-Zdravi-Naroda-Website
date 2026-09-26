#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Pouziti:
  ./scripts/fake_mark_paid.sh [--email EMAIL] [--order-id ORDER_ID]
  ./scripts/fake_mark_paid.sh [ORDER_ID]

Priklady:
  ./scripts/fake_mark_paid.sh
  ./scripts/fake_mark_paid.sh --email test@example.com
  ./scripts/fake_mark_paid.sh --email test@example.com --order-id ord-123456

Chovani:
  - bez argumentu: zaplati posledni awaiting_payment objednavku
    - --email: zaplati posledni awaiting_payment objednavku a nastavi na ni dany email
  - --order-id: zaplati konkretni objednavku
  - pokud je zadany --email a je nalezena objednavka, email se na objednavce prepise
EOF
}

ORDER_ID=""
CUSTOMER_EMAIL=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --email)
            if [[ $# -lt 2 ]]; then
                echo "Chybi hodnota pro --email" >&2
                exit 1
            fi
            CUSTOMER_EMAIL="$2"
            shift 2
            ;;
        --order-id)
            if [[ $# -lt 2 ]]; then
                echo "Chybi hodnota pro --order-id" >&2
                exit 1
            fi
            ORDER_ID="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            if [[ -z "$ORDER_ID" ]]; then
                ORDER_ID="$1"
                shift
            else
                echo "Neznamy argument: $1" >&2
                usage >&2
                exit 1
            fi
            ;;
    esac
done

if [[ -n "$CUSTOMER_EMAIL" ]]; then
    echo "Simuluju platbu pro email=$CUSTOMER_EMAIL order_id=${ORDER_ID:-auto}"
else
    echo "Simuluju platbu pro order_id=${ORDER_ID:-auto}"
fi

docker compose exec -T backend python - "$ORDER_ID" "$CUSTOMER_EMAIL" <<'PY'
import json
import secrets
import sys

from app.database import get_connection
from app.emailer import smtp_is_configured
from app.main import APP_BASE_URL, APP_NAME, mark_order_paid, process_email_outbox, queue_email, utc_now

order_id_arg = (sys.argv[1] or "").strip()
email_arg = (sys.argv[2] or "").strip()

tx_id = f"fake-tx-{secrets.token_hex(6)}"
selection_mode = ""
resend_queued = False

with get_connection() as conn:
    if order_id_arg:
        selection_mode = "order_id"
        order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id_arg,)).fetchone()
    elif email_arg:
        selection_mode = "latest_awaiting_payment_set_email"
        order = conn.execute(
            """
            SELECT * FROM orders
            WHERE status = 'awaiting_payment'
            ORDER BY created_at DESC
            LIMIT 1
            """,
        ).fetchone()
    else:
        selection_mode = "latest_awaiting_payment"
        order = conn.execute(
            """
            SELECT * FROM orders
            WHERE status = 'awaiting_payment'
            ORDER BY created_at DESC
            LIMIT 1
            """,
        ).fetchone()

    if order is None:
        raise SystemExit("Objednavka nebyla nalezena pro zadana kriteria.")

    order_id = order["id"]

    if email_arg and order["customer_email"] != email_arg:
        conn.execute(
            "UPDATE orders SET customer_email = ?, updated_at = ? WHERE id = ?",
            (email_arg, utc_now(), order_id),
        )
        conn.commit()
        order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()

    if order["status"] == "paid":
        ticket_url = (
            f"{APP_BASE_URL}/api/tickets/orders/{order['id']}/ticket?token={order['ticket_download_token']}"
            if order["ticket_download_token"]
            else None
        )
        email_body = (
            f"Dobry den {order['customer_name']},\n\n"
            "objednavka je vedena jako uhrazena.\n"
            f"Objednavka: {order['order_number']}\n"
            f"Odkaz na vstupenku: {ticket_url or 'neni dostupny'}\n\n"
            "Dekujeme."
        )
        queue_email(
            connection=conn,
            order_id=order["id"],
            recipient_email=order["customer_email"],
            subject=f"Vstupenka {APP_NAME} | {order['order_number']}",
            body_text=email_body,
            attachment_path=order["ticket_file_path"],
            attachment_name=f"vstupenka-{order['order_number']}.pdf",
        )
        conn.commit()
        resend_queued = True
    else:
        fake_payload = {
            "id": tx_id,
            "variable_symbol": order["variable_symbol"] or "",
            "amount_minor": int(order["amount"]) * 100,
            "currency": "CZK",
            "source": "manual-test-script",
        }

        mark_order_paid(conn, order, tx_id, fake_payload)
        conn.commit()

email_dispatch = process_email_outbox(limit=30)

with get_connection() as conn:
    refreshed = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    last_email = conn.execute(
        """
        SELECT status, last_error, recipient_email, sent_at, retries
        FROM email_outbox
        WHERE order_id = ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (order_id,),
    ).fetchone()

result = {
    "selection_mode": selection_mode,
    "id": refreshed["id"],
    "order_number": refreshed["order_number"],
    "customer_email": refreshed["customer_email"],
    "status": refreshed["status"],
    "ticket_file_path": refreshed["ticket_file_path"],
    "ticket_download_token": refreshed["ticket_download_token"],
    "smtp_configured": smtp_is_configured(),
    "resend_queued": resend_queued,
    "email_dispatch": email_dispatch,
    "last_email_status": (last_email["status"] if last_email else None),
    "last_email_error": (last_email["last_error"] if last_email else None),
    "last_email_recipient": (last_email["recipient_email"] if last_email else None),
    "last_email_sent_at": (last_email["sent_at"] if last_email else None),
    "last_email_retries": (last_email["retries"] if last_email else None),
    "ticket_download_url": (
        f"{APP_BASE_URL}/api/tickets/orders/{refreshed['id']}/ticket?token={refreshed['ticket_download_token']}"
        if refreshed["ticket_download_token"]
        else None
    ),
}

print(json.dumps(result, ensure_ascii=True, indent=2))

if not result["smtp_configured"]:
    raise SystemExit("SMTP neni nastavene, e-mail se vstupenkou nebylo mozne odeslat.")

if result["last_email_status"] != "sent":
    detail = result["last_email_error"] or "neznama chyba"
    raise SystemExit(f"E-mail se vstupenkou nebyl odeslan. Detail: {detail}")
PY
