import os
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

from app.database import get_connection, init_db
from app.gopay import create_gopay_payment_session, get_gopay_payment_status, normalize_gopay_status

TOTAL_TICKETS = int(os.getenv("TOTAL_TICKETS", "120"))
TICKET_PRICE_CZK = int(os.getenv("TICKET_PRICE_CZK", "1490"))

app = FastAPI(title="Pro Zdravi Naroda API")


def parse_origins(value: str) -> list[str]:
    return [origin.strip() for origin in value.split(",") if origin.strip()]


DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://localhost:3000,http://localhost:8092"
cors_allow_origins = parse_origins(os.getenv("CORS_ALLOW_ORIGINS", DEFAULT_CORS_ORIGINS))

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def generate_order_number() -> str:
    return f"PZN-{int(datetime.now(timezone.utc).timestamp() * 1000)}"


class OrderCreate(BaseModel):
    customer_name: str = Field(..., min_length=2, max_length=120)
    customer_email: EmailStr
    ticket_count: int = Field(..., ge=1, le=10)
    payment_provider: str = "gopay"


class PaymentCreate(BaseModel):
    provider: str = "gopay"


class TicketStats(BaseModel):
    total_tickets: int
    sold_tickets: int
    remaining_tickets: int
    price_per_ticket: int
    currency: str = "CZK"


class OrderResponse(BaseModel):
    id: str
    order_number: str
    customer_name: str
    customer_email: str
    ticket_count: int
    amount: int
    currency: str
    status: str
    provider: str
    checkout_url: str | None = None
    created_at: str
    updated_at: str


class PaymentResponse(BaseModel):
    id: str
    order_id: str
    provider: str
    status: str
    amount: int
    redirect_url: str | None = None
    provider_payment_id: str | None = None


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
        sold = conn.execute(
            "SELECT COALESCE(SUM(ticket_count), 0) FROM orders WHERE status IN ('pending', 'paid')"
        ).fetchone()[0]

    return TicketStats(
        total_tickets=TOTAL_TICKETS,
        sold_tickets=int(sold),
        remaining_tickets=max(TOTAL_TICKETS - int(sold), 0),
        price_per_ticket=TICKET_PRICE_CZK,
    )


@app.post("/api/tickets/orders", response_model=OrderResponse)
def create_order(payload: OrderCreate) -> OrderResponse:
    if payload.ticket_count < 1:
        raise HTTPException(status_code=400, detail="Počet vstupenek musí být kladný.")

    with get_connection() as conn:
        sold = conn.execute(
            "SELECT COALESCE(SUM(ticket_count), 0) FROM orders WHERE status IN ('pending', 'paid')"
        ).fetchone()[0]
        if payload.ticket_count + int(sold) > TOTAL_TICKETS:
            raise HTTPException(status_code=409, detail="Není dostatek volných vstupenek.")

        now = utc_now()
        order_id = f"ord-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
        order_number = generate_order_number()
        amount = payload.ticket_count * TICKET_PRICE_CZK

        conn.execute(
            """
            INSERT INTO orders (
                id, order_number, customer_name, customer_email, ticket_count, amount, status,
                provider, checkout_url, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?)
            """,
            (
                order_id,
                order_number,
                payload.customer_name.strip(),
                payload.customer_email,
                payload.ticket_count,
                amount,
                payload.payment_provider,
                now,
                now,
            ),
        )
        conn.commit()

    return OrderResponse(
        id=order_id,
        order_number=order_number,
        customer_name=payload.customer_name.strip(),
        customer_email=str(payload.customer_email),
        ticket_count=payload.ticket_count,
        amount=amount,
        currency="CZK",
        status="pending",
        provider=payload.payment_provider,
        created_at=now,
        updated_at=now,
    )


@app.get("/api/tickets/orders/{order_id}", response_model=OrderResponse)
def get_order(order_id: str) -> OrderResponse:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM orders WHERE id = ?",
            (order_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Objednávka nebyla nalezena.")

    return OrderResponse(
        id=row["id"],
        order_number=row["order_number"],
        customer_name=row["customer_name"],
        customer_email=row["customer_email"],
        ticket_count=row["ticket_count"],
        amount=row["amount"],
        currency="CZK",
        status=row["status"],
        provider=row["provider"],
        checkout_url=row["checkout_url"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@app.get("/api/payments/providers")
def payment_providers() -> dict[str, object]:
    client_id = os.getenv("GOPAY_CLIENT_ID")
    secret = os.getenv("GOPAY_CLIENT_SECRET")
    return {
        "providers": [
            {
                "name": "gopay",
                "enabled": bool(client_id and secret),
                "mode": "sandbox" if client_id and secret else "demo",
                "base_url": os.getenv("GOPAY_BASE_URL", "https://gw.sandbox.gopay.com/api"),
            }
        ]
    }


@app.post("/api/tickets/orders/{order_id}/payment", response_model=PaymentResponse)
def create_payment(order_id: str, payload: PaymentCreate) -> PaymentResponse:
    with get_connection() as conn:
        order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if order is None:
            raise HTTPException(status_code=404, detail="Objednávka nebyla nalezena.")

    provider = payload.provider.lower()
    payment_id = f"pay-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    now = utc_now()
    redirect_url = None

    client_id = os.getenv("GOPAY_CLIENT_ID")
    secret = os.getenv("GOPAY_CLIENT_SECRET")
    if provider == "gopay" and client_id and secret:
        try:
            redirect_url = create_gopay_payment_session(
                order_id=order_id,
                order_number=order["order_number"],
                amount=int(order["amount"]),
                customer_name=order["customer_name"],
                customer_email=order["customer_email"],
                client_id=client_id,
                client_secret=secret,
                return_url=os.getenv("GOPAY_RETURN_URL") or os.getenv("APP_BASE_URL") or "http://localhost:5173",
                notification_url=os.getenv("GOPAY_NOTIFICATION_URL"),
            )
        except Exception:
            redirect_url = None

    if redirect_url is None:
        redirect_url = f"https://example.com/payments/demo/{order_id}?provider={provider}"

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO payments (id, order_id, provider, provider_payment_id, status, amount, redirect_url, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
            """,
            (payment_id, order_id, provider, payment_id, order["amount"], redirect_url, now, now),
        )
        conn.execute(
            "UPDATE orders SET provider = ?, checkout_url = ?, updated_at = ? WHERE id = ?",
            (provider, redirect_url, now, order_id),
        )
        conn.commit()

    return PaymentResponse(
        id=payment_id,
        order_id=order_id,
        provider=provider,
        status="pending",
        amount=order["amount"],
        redirect_url=redirect_url,
        provider_payment_id=payment_id,
    )


@app.post("/api/tickets/orders/{order_id}/confirm")
def confirm_payment(order_id: str, payment_id: str | None = Query(default=None)) -> dict[str, str | int]:
    with get_connection() as conn:
        order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if order is None:
            raise HTTPException(status_code=404, detail="Objednávka nebyla nalezena.")

        payment_row = None
        if payment_id:
            payment_row = conn.execute(
                "SELECT * FROM payments WHERE order_id = ? AND id = ?",
                (order_id, payment_id),
            ).fetchone()
        else:
            payment_row = conn.execute(
                "SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1",
                (order_id,),
            ).fetchone()

        settled = False
        if order["provider"] == "gopay":
            provider_payment_id = (payment_row["provider_payment_id"] if payment_row else None) or payment_id
            gopay_status = get_gopay_payment_status(provider_payment_id or order_id) if provider_payment_id else None
            settled = normalize_gopay_status(gopay_status or {}) == "paid"

        if settled or order["status"] == "paid":
            conn.execute(
                "UPDATE orders SET status = 'paid', updated_at = ? WHERE id = ?",
                (utc_now(), order_id),
            )
            conn.execute(
                "UPDATE payments SET status = 'paid', updated_at = ? WHERE order_id = ? AND (? IS NULL OR id = ?)",
                (utc_now(), order_id, payment_id, payment_id),
            )
            conn.execute(
                "INSERT OR IGNORE INTO ticket_sales (id, order_id, ticket_count, amount, created_at) VALUES (?, ?, ?, ?, ?)",
                (f"sale-{int(datetime.now(timezone.utc).timestamp() * 1000)}", order_id, order["ticket_count"], order["amount"], utc_now()),
            )
            conn.commit()
            return {"status": "paid", "order_id": order_id, "message": "Platba byla potvrzena."}

        conn.execute(
            "UPDATE payments SET status = 'pending', updated_at = ? WHERE order_id = ? AND (? IS NULL OR id = ?)",
            (utc_now(), order_id, payment_id, payment_id),
        )
        conn.commit()
        return {"status": "pending", "order_id": order_id, "message": "Platba zatím nebyla dokončena."}


@app.get("/api/tickets/orders")
def list_orders() -> list[dict[str, object]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM orders ORDER BY created_at DESC LIMIT 50"
        ).fetchall()
    return [
        {
            "id": row["id"],
            "order_number": row["order_number"],
            "customer_name": row["customer_name"],
            "customer_email": row["customer_email"],
            "ticket_count": row["ticket_count"],
            "amount": row["amount"],
            "status": row["status"],
            "provider": row["provider"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]
