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
