import os
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATABASE_PATH = Path(
    os.getenv("DATABASE_PATH", str(BASE_DIR / "data" / "pzn.sqlite3")))
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def _column_exists(connection: sqlite3.Connection, table: str, column: str) -> bool:
    rows = connection.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row[1] == column for row in rows)


def _ensure_column(
    connection: sqlite3.Connection,
    table: str,
    column: str,
    definition: str,
) -> None:
    if _column_exists(connection, table, column):
        return
    connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db() -> None:
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                order_number TEXT NOT NULL UNIQUE,
                customer_name TEXT NOT NULL,
                customer_email TEXT NOT NULL,
                ticket_count INTEGER NOT NULL,
                amount INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'awaiting_payment',
                variable_symbol TEXT,
                bank_account TEXT,
                bank_iban TEXT,
                bank_code TEXT,
                bank_message TEXT,
                expires_at TEXT,
                paid_at TEXT,
                ticket_file_path TEXT,
                ticket_download_token TEXT,
                payment_matched_tx_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )

        _ensure_column(connection, "orders", "variable_symbol", "TEXT")
        _ensure_column(connection, "orders", "bank_account", "TEXT")
        _ensure_column(connection, "orders", "bank_iban", "TEXT")
        _ensure_column(connection, "orders", "bank_code", "TEXT")
        _ensure_column(connection, "orders", "bank_message", "TEXT")
        _ensure_column(connection, "orders", "expires_at", "TEXT")
        _ensure_column(connection, "orders", "paid_at", "TEXT")
        _ensure_column(connection, "orders", "ticket_file_path", "TEXT")
        _ensure_column(connection, "orders", "ticket_download_token", "TEXT")
        _ensure_column(connection, "orders", "payment_matched_tx_id", "TEXT")

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS payments (
                id TEXT PRIMARY KEY,
                order_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'paid',
                amount INTEGER NOT NULL,
                variable_symbol TEXT,
                bank_tx_id TEXT,
                raw_payload TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(order_id) REFERENCES orders(id)
            )
            """
        )

        _ensure_column(connection, "payments", "variable_symbol", "TEXT")
        _ensure_column(connection, "payments", "bank_tx_id", "TEXT")
        _ensure_column(connection, "payments", "raw_payload", "TEXT")

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS ticket_sales (
                id TEXT PRIMARY KEY,
                order_id TEXT NOT NULL,
                ticket_count INTEGER NOT NULL,
                amount INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(order_id) REFERENCES orders(id)
            )
            """
        )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS bank_transactions (
                id TEXT PRIMARY KEY,
                tx_date TEXT,
                amount INTEGER NOT NULL,
                currency TEXT,
                variable_symbol TEXT,
                constant_symbol TEXT,
                specific_symbol TEXT,
                sender_account TEXT,
                sender_name TEXT,
                message TEXT,
                raw_json TEXT NOT NULL,
                match_status TEXT NOT NULL DEFAULT 'unmatched',
                matched_order_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(matched_order_id) REFERENCES orders(id)
            )
            """
        )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS system_state (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS email_outbox (
                id TEXT PRIMARY KEY,
                order_id TEXT,
                recipient_email TEXT NOT NULL,
                subject TEXT NOT NULL,
                body_text TEXT NOT NULL,
                attachment_path TEXT,
                attachment_name TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                retries INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                sent_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(order_id) REFERENCES orders(id)
            )
            """
        )

        connection.commit()
