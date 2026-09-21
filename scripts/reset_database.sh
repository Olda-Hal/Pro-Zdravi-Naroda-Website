#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_FILE="$ROOT_DIR/backend/data/pzn.sqlite3"
TICKETS_DIR="$ROOT_DIR/backend/data/tickets"

cd "$ROOT_DIR"

echo "Zastavuju kontejnery..."
docker compose down

echo "Mazu SQLite databazi: $DB_FILE"
rm -f "$DB_FILE"

echo "Mazu vygenerovane vstupenky: $TICKETS_DIR"
mkdir -p "$TICKETS_DIR"
find "$TICKETS_DIR" -type f -name '*.pdf' -delete

echo "Startuju backend a frontend znovu..."
docker compose up -d --build

echo "Hotovo. Databaze je resetovana a vytvorena od nuly pri startu backendu."
