# Pro Zdravi Naroda Website

Ticket sales now use bank transfer to a transparent account with automatic matching via Fio API.

## Payment workflow

1. Customer creates order on the website.
2. Backend returns bank instructions (account, amount, variable symbol, deadline).
3. Customer sends bank transfer.
4. Backend sync worker loads incoming Fio transactions every `FIO_SYNC_INTERVAL_SECONDS`.
5. Matching rule: variable symbol + exact amount.
6. If matched, order is marked as `paid`, a PDF ticket is generated, and email with PDF attachment is sent.

## Environment setup

Copy and edit:

- `.env.example` -> `.env`
- `backend/.env.example` -> `backend/.env` (optional for local backend-only runs)

Required values:

- `BANK_ACCOUNT_NUMBER`
- `FIO_API_TOKEN`
- SMTP settings: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`

Storage defaults in Docker Compose:

- `DATABASE_PATH_CONTAINER=/app/data/pzn.sqlite3`
- `TICKETS_DIR_CONTAINER=/app/data/tickets`
- Host folder `./backend/data` is mounted to `/app/data` in backend container, so SQLite file is directly readable on host at `backend/data/pzn.sqlite3`.

Optional security:

- `FIO_SYNC_SECRET` protects manual sync endpoints via `x-sync-secret` header.

## API overview

- `POST /api/tickets/orders` creates order and returns payment instructions.
- `GET /api/tickets/orders/{order_id}` reads current order status.
- `GET /api/tickets/orders/{order_id}/ticket?token=...` downloads paid ticket PDF.
- `POST /api/payments/fio/sync` runs manual Fio sync.
- `POST /api/emails/process` processes pending email outbox.

## Statuses

- `awaiting_payment`
- `paid`
- `expired`
- `payment_mismatch`

## Local run

```bash
docker compose up --build
```

Frontend checkout now shows bank transfer instructions directly.

## Test scripts (fake order/payment)

Use these scripts to quickly test order flow without real bank transfer:

```bash
./scripts/submit_test_order.sh "Test User" "test@example.com" 2
./scripts/fake_mark_paid.sh
```

Details:

- `scripts/submit_test_order.sh` calls `POST /api/tickets/orders` and stores response in `.tmp-last-order.json`.
- `scripts/fake_mark_paid.sh` marks order as `paid` through backend runtime and then runs email outbox processing.
- Pay latest awaiting order globally: `./scripts/fake_mark_paid.sh`
- Pay latest awaiting order and set its recipient email: `./scripts/fake_mark_paid.sh --email test@example.com`
- Pay explicit order id: `./scripts/fake_mark_paid.sh --order-id ord-xxxxxxxx`
- Legacy explicit order id also works: `./scripts/fake_mark_paid.sh ord-xxxxxxxx`
- Script exits with non-zero status if ticket email was not sent successfully.

## Database reset (start from zero)

System is Fio-only and payment records are stored without any provider field.

```bash
./scripts/reset_database.sh
```

This command:

- stops containers,
- deletes `backend/data/pzn.sqlite3`,
- deletes generated PDF tickets in `backend/data/tickets`,
- starts containers again and backend creates a new clean DB schema.

## Ticket portrait source

Ticket PDF uses Karel IV portrait from `backend/data/karel-iv.png` (outside `backend/data/tickets`).
If this file is missing, backend falls back to `frontend/public/images/karel-iv.*`.
