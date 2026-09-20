from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx


def _find_column_value(tx: dict[str, Any], name_contains: str) -> str | None:
    name_contains = name_contains.lower()
    for value in tx.values():
        if not isinstance(value, dict):
            continue
        label = str(value.get("name", "")).lower()
        if name_contains in label:
            raw = value.get("value")
            if raw is None:
                return None
            return str(raw)
    return None


def _to_minor_units(amount: str | None) -> int:
    if amount is None:
        return 0
    normalized = amount.replace(" ", "").replace(",", ".")
    try:
        return int((Decimal(normalized) * 100).quantize(Decimal("1")))
    except (InvalidOperation, ValueError):
        return 0


def extract_fio_transactions(payload: dict[str, Any]) -> list[dict[str, Any]]:
    statement = payload.get("accountStatement") or {}
    tx_list = statement.get("transactionList") or {}
    rows = tx_list.get("transaction") or []
    if not isinstance(rows, list):
        return []

    output: list[dict[str, Any]] = []
    for tx in rows:
        if not isinstance(tx, dict):
            continue

        tx_id = _find_column_value(tx, "id pohybu") or _find_column_value(tx, "id transakce")
        if not tx_id:
            continue

        output.append(
            {
                "id": tx_id,
                "date": _find_column_value(tx, "datum"),
                "amount_minor": _to_minor_units(_find_column_value(tx, "objem") or _find_column_value(tx, "amount")),
                "currency": _find_column_value(tx, "měna") or _find_column_value(tx, "mena"),
                "variable_symbol": _find_column_value(tx, "vs") or _find_column_value(tx, "variabil"),
                "constant_symbol": _find_column_value(tx, "ks") or _find_column_value(tx, "konstant"),
                "specific_symbol": _find_column_value(tx, "ss") or _find_column_value(tx, "specif"),
                "sender_account": _find_column_value(tx, "protiúčet") or _find_column_value(tx, "protiucet"),
                "sender_name": _find_column_value(tx, "název protiúčtu") or _find_column_value(tx, "nazev protiuctu"),
                "message": _find_column_value(tx, "zpráva") or _find_column_value(tx, "poznámka") or _find_column_value(tx, "poznamka"),
                "raw": tx,
            }
        )

    return output


def fetch_fio_transactions(
    token: str,
    *,
    date_from: date,
    date_to: date,
    timeout_s: float = 20.0,
) -> list[dict[str, Any]]:
    base = "https://www.fio.cz/ib_api/rest/periods"
    url = f"{base}/{token}/{date_from.isoformat()}/{date_to.isoformat()}/transactions.json"
    response = httpx.get(url, timeout=timeout_s)
    response.raise_for_status()
    payload = response.json()
    return extract_fio_transactions(payload)
