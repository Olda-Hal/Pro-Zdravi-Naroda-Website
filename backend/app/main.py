from __future__ import annotations

import asyncio
import json
import os
import secrets
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field

from app.database import get_connection, init_db
from app.emailer import send_email, smtp_is_configured
from app.fio import fetch_fio_transactions
from app.ticket_pdf import build_ticket_pdf

TOTAL_TICKETS = int(os.getenv("TOTAL_TICKETS", "120"))
TICKET_PRICE_CZK = int(os.getenv("TICKET_PRICE_CZK", "1490"))
ORDER_EXPIRATION_MINUTES = int(os.getenv("ORDER_EXPIRATION_MINUTES", "120"))
TICKETS_DIR = Path(os.getenv("TICKETS_DIR", "./data/tickets"))

APP_NAME = os.getenv("APP_NAME", "Pro zdravi naroda")
EVENT_TITLE = os.getenv("EVENT_TITLE", "Beneficni koncert")
EVENT_DATE = os.getenv("EVENT_DATE", "21.10.2026")
EVENT_TIME = os.getenv("EVENT_TIME", "19:00")
EVENT_LOCATION = os.getenv("EVENT_LOCATION", "CROWD CAFE, PRAHA")
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:5173").rstrip("/")

BANK_ACCOUNT_NUMBER = os.getenv("BANK_ACCOUNT_NUMBER", "")
BANK_IBAN = os.getenv("BANK_IBAN", "")
BANK_CODE = os.getenv("BANK_CODE", "")
BANK_MESSAGE_PREFIX = os.getenv("BANK_MESSAGE_PREFIX", "Vstupenka")

FIO_API_TOKEN = os.getenv("FIO_API_TOKEN", "").strip()
FIO_SYNC_LOOKBACK_DAYS = int(os.getenv("FIO_SYNC_LOOKBACK_DAYS", "14"))
FIO_SYNC_SECRET = os.getenv("FIO_SYNC_SECRET", "").strip()
FIO_SYNC_INTERVAL_SECONDS = int(os.getenv("FIO_SYNC_INTERVAL_SECONDS", "60"))

app = FastAPI(title="Pro Zdravi Naroda API")
sync_stop_event = asyncio.Event()
sync_task: asyncio.Task | None = None


def parse_origins(value: str) -> list[str]:
    return [origin.strip() for origin in value.split(",") if origin.strip()]


DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://localhost:3000,http://localhost:8092"
cors_allow_origins = parse_origins(
    os.getenv("CORS_ALLOW_ORIGINS", DEFAULT_CORS_ORIGINS)
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()


class OrderCreate(BaseModel):
    customer_name: str = Field(..., min_length=2, max_length=120)
    customer_email: EmailStr
    ticket_count: int = Field(..., ge=1, le=10)


class TicketStats(BaseModel):
    total_tickets: int
    sold_tickets: int
    remaining_tickets: int
    price_per_ticket: int
    currency: str = "CZK"


class PaymentInstructions(BaseModel):
    account_number: str
    iban: str | None = None
    bank_code: str | None = None
    amount_czk: int
    variable_symbol: str
    message: str
    expires_at: str


class OrderResponse(BaseModel):
    id: str
    order_number: str
    customer_name: str
    customer_email: str
    ticket_count: int
    amount: int
    currency: str
    status: str
    payment_instructions: PaymentInstructions
    ticket_download_url: str | None = None
    created_at: str
    updated_at: str


class SyncResponse(BaseModel):
    fetched: int
    newly_stored: int
    matched_paid: int
    mismatched: int
    unmatched: int


def utc_now_dt() -> datetime:
    return datetime.now(timezone.utc)


def utc_now() -> str:
    return utc_now_dt().isoformat()


def generate_order_number() -> str:
    return f"PZN-{int(utc_now_dt().timestamp() * 1000)}"


def generate_order_id() -> str:
    return f"ord-{secrets.token_hex(8)}"


def generate_variable_symbol() -> str:
    # Numeric VS for Czech bank transfers.
    base = str(int(utc_now_dt().timestamp() * 1000))
    return base[-10:]


def amount_to_text(amount_czk: int) -> str:
    return f"{amount_czk:,}".replace(",", " ") + " CZK"


def build_payment_message(order_number: str) -> str:
    return f"{BANK_MESSAGE_PREFIX} {order_number}".strip()


def get_last_sync_date() -> date:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT value FROM system_state WHERE key = 'fio_last_sync_date'"
        ).fetchone()
    if row and row["value"]:
        try:
            return date.fromisoformat(row["value"])
        except ValueError:
            pass
    return (utc_now_dt() - timedelta(days=FIO_SYNC_LOOKBACK_DAYS)).date()


def set_last_sync_date(value: date) -> None:
    now = utc_now()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO system_state (key, value, updated_at)
            VALUES ('fio_last_sync_date', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            """,
            (value.isoformat(), now),
        )
        conn.commit()


def expire_stale_orders(connection) -> None:
    connection.execute(
        """
        UPDATE orders
        SET status = 'expired', updated_at = ?
        WHERE status = 'awaiting_payment' AND expires_at IS NOT NULL AND expires_at < ?
        """,
        (utc_now(), utc_now()),
    )


def order_ticket_download_url(row) -> str | None:
    if row["status"] != "paid" or not row["ticket_download_token"]:
        return None
    return f"{APP_BASE_URL}/api/tickets/orders/{row['id']}/ticket?token={row['ticket_download_token']}"


def as_order_response(row) -> OrderResponse:
    instructions = PaymentInstructions(
        account_number=row["bank_account"] or BANK_ACCOUNT_NUMBER,
        iban=row["bank_iban"] or BANK_IBAN or None,
        bank_code=row["bank_code"] or BANK_CODE or None,
        amount_czk=int(row["amount"]),
        variable_symbol=row["variable_symbol"] or "",
        message=row["bank_message"] or build_payment_message(row["order_number"]),
        expires_at=row["expires_at"] or row["updated_at"],
    )

    return OrderResponse(
        id=row["id"],
        order_number=row["order_number"],
        customer_name=row["customer_name"],
        customer_email=row["customer_email"],
        ticket_count=int(row["ticket_count"]),
        amount=int(row["amount"]),
        currency="CZK",
        status=row["status"],
        payment_instructions=instructions,
        ticket_download_url=order_ticket_download_url(row),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def queue_email(
    *,
    connection,
    order_id: str,
    recipient_email: str,
    subject: str,
    body_text: str,
    attachment_path: str | None = None,
    attachment_name: str | None = None,
) -> None:
    now = utc_now()
    connection.execute(
        """
        INSERT INTO email_outbox (
            id, order_id, recipient_email, subject, body_text, attachment_path,
            attachment_name, status, retries, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
        """,
        (
            f"mail-{secrets.token_hex(8)}",
            order_id,
            recipient_email,
            subject,
            body_text,
            attachment_path,
            attachment_name,
            now,
            now,
        ),
    )


def process_email_outbox(limit: int = 20) -> dict[str, int]:
    if not smtp_is_configured():
        return {"processed": 0, "sent": 0, "failed": 0}

    sent = 0
    failed = 0
    processed = 0

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM email_outbox
            WHERE status IN ('pending', 'failed') AND retries < 3
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

        for row in rows:
            processed += 1
            try:
                send_email(
                    to_email=row["recipient_email"],
                    subject=row["subject"],
                    body=row["body_text"],
                    attachment_path=row["attachment_path"],
                    attachment_name=row["attachment_name"],
                )
                conn.execute(
                    """
                    UPDATE email_outbox
                    SET status = 'sent', sent_at = ?, updated_at = ?, last_error = NULL
                    WHERE id = ?
                    """,
                    (utc_now(), utc_now(), row["id"]),
                )
                sent += 1
            except Exception as exc:
                conn.execute(
                    """
                    UPDATE email_outbox
                    SET status = 'failed', retries = retries + 1, last_error = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (str(exc), utc_now(), row["id"]),
                )
                failed += 1

        conn.commit()

    return {"processed": processed, "sent": sent, "failed": failed}


def create_ticket_pdf_for_order(row) -> tuple[str, str]:
    token = row["ticket_download_token"] or secrets.token_urlsafe(24)
    file_name = f"ticket-{row['order_number']}.pdf"
    output_path = TICKETS_DIR / file_name

    build_ticket_pdf(
        output_path=output_path,
        app_name=APP_NAME,
        event_title=EVENT_TITLE,
        event_date=EVENT_DATE,
        event_time=EVENT_TIME,
        event_location=EVENT_LOCATION,
        order_number=row["order_number"],
        customer_name=row["customer_name"],
        ticket_count=int(row["ticket_count"]),
        amount_czk=int(row["amount"] * 100),
        variable_symbol=row["variable_symbol"] or "",
    )

    return str(output_path), token


def mark_order_paid(connection, order, bank_tx_id: str, raw_payload: dict) -> None:
    now = utc_now()

    connection.execute(
        """
        UPDATE orders
        SET status = 'paid', paid_at = ?, updated_at = ?, payment_matched_tx_id = ?
        WHERE id = ?
        """,
        (now, now, bank_tx_id, order["id"]),
    )

    connection.execute(
        """
        INSERT INTO payments (
            id, order_id, status, amount, variable_symbol, bank_tx_id, raw_payload, created_at, updated_at
        ) VALUES (?, ?, 'paid', ?, ?, ?, ?, ?, ?)
        """,
        (
            f"pay-{secrets.token_hex(8)}",
            order["id"],
            int(order["amount"]),
            order["variable_symbol"],
            bank_tx_id,
            json.dumps(raw_payload, ensure_ascii=True),
            now,
            now,
        ),
    )

    connection.execute(
        """
        INSERT OR IGNORE INTO ticket_sales (id, order_id, ticket_count, amount, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            f"sale-{secrets.token_hex(8)}",
            order["id"],
            int(order["ticket_count"]),
            int(order["amount"]),
            now,
        ),
    )

    refreshed = connection.execute("SELECT * FROM orders WHERE id = ?", (order["id"],)).fetchone()
    ticket_path, ticket_token = create_ticket_pdf_for_order(refreshed)
    connection.execute(
        """
        UPDATE orders
        SET ticket_file_path = ?, ticket_download_token = ?, updated_at = ?
        WHERE id = ?
        """,
        (ticket_path, ticket_token, utc_now(), order["id"]),
    )

    email_subject = f"Vstupenka {APP_NAME} | {order['order_number']}"
    ticket_url = f"{APP_BASE_URL}/api/tickets/orders/{order['id']}/ticket?token={ticket_token}"
    email_body = (
        f"Dobrý den {order['customer_name']},\n\n"
        f"děkujeme, vaše platba byla úspěšně přijata.\n"
        f"Objednávka: {order['order_number']}\n"
        f"Počet vstupenek: {order['ticket_count']}\n"
        f"Uhrazeno: {amount_to_text(int(order['amount']))}\n\n"
        f"V příloze posíláme PDF vstupenku.\n"
        f"Online odkaz ke vstupence: {ticket_url}\n\n"
        "Těšíme se na vás."
    )

    queue_email(
        connection=connection,
        order_id=order["id"],
        recipient_email=order["customer_email"],
        subject=email_subject,
        body_text=email_body,
        attachment_path=ticket_path,
        attachment_name=f"vstupenka-{order['order_number']}.pdf",
    )


def sync_fio_payments() -> SyncResponse:
    if not FIO_API_TOKEN:
        raise HTTPException(status_code=503, detail="FIO_API_TOKEN není nastaven.")

    start_date = get_last_sync_date()
    end_date = utc_now_dt().date()

    tx_rows = fetch_fio_transactions(FIO_API_TOKEN, date_from=start_date, date_to=end_date)

    fetched = len(tx_rows)
    newly_stored = 0
    matched_paid = 0
    mismatched = 0
    unmatched = 0

    with get_connection() as conn:
        expire_stale_orders(conn)

        for tx in tx_rows:
            now = utc_now()
            existing = conn.execute(
                "SELECT id FROM bank_transactions WHERE id = ?", (tx["id"],)
            ).fetchone()

            if existing:
                continue

            newly_stored += 1

            conn.execute(
                """
                INSERT INTO bank_transactions (
                    id, tx_date, amount, currency, variable_symbol, constant_symbol, specific_symbol,
                    sender_account, sender_name, message, raw_json, match_status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unmatched', ?, ?)
                """,
                (
                    tx["id"],
                    tx.get("date"),
                    int(tx.get("amount_minor") or 0),
                    tx.get("currency") or "CZK",
                    tx.get("variable_symbol"),
                    tx.get("constant_symbol"),
                    tx.get("specific_symbol"),
                    tx.get("sender_account"),
                    tx.get("sender_name"),
                    tx.get("message"),
                    json.dumps(tx.get("raw") or {}, ensure_ascii=True),
                    now,
                    now,
                ),
            )

            vs = (tx.get("variable_symbol") or "").strip()
            if not vs:
                unmatched += 1
                continue

            order = conn.execute(
                """
                SELECT * FROM orders
                WHERE variable_symbol = ? AND status = 'awaiting_payment'
                ORDER BY created_at ASC
                LIMIT 1
                """,
                (vs,),
            ).fetchone()

            if order is None:
                conn.execute(
                    "UPDATE bank_transactions SET match_status = 'unmatched', updated_at = ? WHERE id = ?",
                    (utc_now(), tx["id"]),
                )
                unmatched += 1
                continue

            expected_minor = int(order["amount"]) * 100
            if int(tx.get("amount_minor") or 0) != expected_minor:
                conn.execute(
                    "UPDATE bank_transactions SET match_status = 'mismatch_amount', matched_order_id = ?, updated_at = ? WHERE id = ?",
                    (order["id"], utc_now(), tx["id"]),
                )
                conn.execute(
                    "UPDATE orders SET status = 'payment_mismatch', updated_at = ? WHERE id = ?",
                    (utc_now(), order["id"]),
                )
                mismatched += 1
                continue

            mark_order_paid(conn, order, tx["id"], tx)
            conn.execute(
                "UPDATE bank_transactions SET match_status = 'matched_paid', matched_order_id = ?, updated_at = ? WHERE id = ?",
                (order["id"], utc_now(), tx["id"]),
            )
            matched_paid += 1

        conn.commit()

    set_last_sync_date(end_date)
    process_email_outbox(limit=30)

    return SyncResponse(
        fetched=fetched,
        newly_stored=newly_stored,
        matched_paid=matched_paid,
        mismatched=mismatched,
        unmatched=unmatched,
    )


async def background_sync_loop() -> None:
    while not sync_stop_event.is_set():
        try:
            if FIO_API_TOKEN:
                sync_fio_payments()
            else:
                process_email_outbox(limit=30)
        except Exception:
            # Keep the loop alive even if external APIs or SMTP fail temporarily.
            pass

        try:
            await asyncio.wait_for(sync_stop_event.wait(), timeout=FIO_SYNC_INTERVAL_SECONDS)
        except TimeoutError:
            continue


@app.on_event("startup")
async def startup_event() -> None:
    global sync_task
    if sync_task is None:
        sync_task = asyncio.create_task(background_sync_loop())


@app.on_event("shutdown")
async def shutdown_event() -> None:
    global sync_task
    sync_stop_event.set()
    if sync_task:
        sync_task.cancel()
        try:
            await sync_task
        except asyncio.CancelledError:
            pass
    sync_task = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/db")
def health_db() -> dict[str, str | int]:
    try:
        with get_connection() as conn:
            value = conn.execute("SELECT 1").fetchone()[0]
        return {"status": "ok", "db": value}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Database unavailable: {exc}")


@app.get("/api/tickets/stats", response_model=TicketStats)
def get_ticket_stats() -> TicketStats:
    with get_connection() as conn:
        expire_stale_orders(conn)
        sold = conn.execute(
            "SELECT COALESCE(SUM(ticket_count), 0) FROM orders WHERE status IN ('awaiting_payment', 'paid')"
        ).fetchone()[0]
        conn.commit()

    sold_int = int(sold)
    return TicketStats(
        total_tickets=TOTAL_TICKETS,
        sold_tickets=sold_int,
        remaining_tickets=max(TOTAL_TICKETS - sold_int, 0),
        price_per_ticket=TICKET_PRICE_CZK,
    )


@app.post("/api/tickets/orders", response_model=OrderResponse)
def create_order(payload: OrderCreate) -> OrderResponse:
    if payload.ticket_count < 1:
        raise HTTPException(status_code=400, detail="Počet vstupenek musí být kladný.")

    if not BANK_ACCOUNT_NUMBER:
        raise HTTPException(status_code=503, detail="BANK_ACCOUNT_NUMBER není nastaven.")

    with get_connection() as conn:
        expire_stale_orders(conn)
        sold = conn.execute(
            "SELECT COALESCE(SUM(ticket_count), 0) FROM orders WHERE status IN ('awaiting_payment', 'paid')"
        ).fetchone()[0]

        if payload.ticket_count + int(sold) > TOTAL_TICKETS:
            raise HTTPException(status_code=409, detail="Není dostatek volných vstupenek.")

        now = utc_now()
        order_id = generate_order_id()
        order_number = generate_order_number()
        amount = payload.ticket_count * TICKET_PRICE_CZK
        variable_symbol = generate_variable_symbol()
        expires_at = (utc_now_dt() + timedelta(minutes=ORDER_EXPIRATION_MINUTES)).isoformat()
        message = build_payment_message(order_number)

        conn.execute(
            """
            INSERT INTO orders (
                id, order_number, customer_name, customer_email, ticket_count, amount, status,
                variable_symbol, bank_account, bank_iban, bank_code,
                bank_message, expires_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                order_id,
                order_number,
                payload.customer_name.strip(),
                str(payload.customer_email),
                payload.ticket_count,
                amount,
                variable_symbol,
                BANK_ACCOUNT_NUMBER,
                BANK_IBAN or None,
                BANK_CODE or None,
                message,
                expires_at,
                now,
                now,
            ),
        )

        email_subject = f"Instrukce k platbě | {order_number}"
        email_body = (
            f"Dobrý den {payload.customer_name.strip()},\n\n"
            "děkujeme za rezervaci vstupenek.\n"
            f"Objednávka: {order_number}\n"
            f"Počet vstupenek: {payload.ticket_count}\n"
            f"Částka: {amount_to_text(amount)}\n"
            f"Účet: {BANK_ACCOUNT_NUMBER}\n"
            f"VS: {variable_symbol}\n"
            f"Zpráva: {message}\n"
            f"Termín úhrady: {expires_at}\n\n"
            "Po přijetí platby vám automaticky pošleme PDF vstupenku."
        )

        queue_email(
            connection=conn,
            order_id=order_id,
            recipient_email=str(payload.customer_email),
            subject=email_subject,
            body_text=email_body,
        )

        conn.commit()

        row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()

    process_email_outbox(limit=10)
    return as_order_response(row)


@app.get("/api/tickets/orders/{order_id}", response_model=OrderResponse)
def get_order(order_id: str) -> OrderResponse:
    with get_connection() as conn:
        expire_stale_orders(conn)
        row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        conn.commit()
        if row is None:
            raise HTTPException(status_code=404, detail="Objednávka nebyla nalezena.")

    return as_order_response(row)


@app.get("/api/tickets/orders/{order_id}/ticket")
def download_ticket(order_id: str, token: str = Query(..., min_length=12)):
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Objednávka nebyla nalezena.")
    if row["status"] != "paid":
        raise HTTPException(status_code=409, detail="Objednávka zatím není zaplacená.")
    if token != row["ticket_download_token"]:
        raise HTTPException(status_code=403, detail="Neplatný token vstupenky.")
    if not row["ticket_file_path"]:
        raise HTTPException(status_code=404, detail="Soubor vstupenky nebyl nalezen.")

    ticket_path = Path(row["ticket_file_path"])
    if not ticket_path.exists():
        raise HTTPException(status_code=404, detail="Soubor vstupenky nebyl nalezen.")

    return FileResponse(
        path=str(ticket_path),
        media_type="application/pdf",
        filename=f"vstupenka-{row['order_number']}.pdf",
    )


@app.post("/api/payments/fio/sync", response_model=SyncResponse)
def run_fio_sync(x_sync_secret: str | None = Header(default=None)) -> SyncResponse:
    if FIO_SYNC_SECRET and x_sync_secret != FIO_SYNC_SECRET:
        raise HTTPException(status_code=401, detail="Neplatný sync secret.")
    return sync_fio_payments()


@app.post("/api/emails/process")
def process_pending_emails(x_sync_secret: str | None = Header(default=None)) -> dict[str, int]:
    if FIO_SYNC_SECRET and x_sync_secret != FIO_SYNC_SECRET:
        raise HTTPException(status_code=401, detail="Neplatný sync secret.")
    return process_email_outbox(limit=30)


@app.get("/api/tickets/orders")
def list_orders() -> list[dict[str, object]]:
    with get_connection() as conn:
        expire_stale_orders(conn)
        rows = conn.execute("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100").fetchall()
        conn.commit()

    return [
        {
            "id": row["id"],
            "order_number": row["order_number"],
            "customer_name": row["customer_name"],
            "customer_email": row["customer_email"],
            "ticket_count": row["ticket_count"],
            "amount": row["amount"],
            "status": row["status"],
            "variable_symbol": row["variable_symbol"],
            "expires_at": row["expires_at"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]
