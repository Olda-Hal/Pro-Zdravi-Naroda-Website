import base64
import os
from typing import Any

import httpx


def _get_gopay_base_url() -> str:
    return os.getenv("GOPAY_BASE_URL", "https://gw.sandbox.gopay.com/api").rstrip("/")


def _get_basic_auth_header(client_id: str, client_secret: str) -> str:
    raw = f"{client_id}:{client_secret}".encode("utf-8")
    return "Basic " + base64.b64encode(raw).decode("utf-8")


def normalize_gopay_status(payload: Any) -> str:
    if not isinstance(payload, dict):
        return "pending"

    state = payload.get("state") or payload.get(
        "status") or payload.get("payment_status")
    if not isinstance(state, str):
        return "pending"

    normalized = state.strip().upper()
    if normalized in {"PAID", "AUTHORIZED", "COMPLETED", "SUCCESS", "SETTLED"}:
        return "paid"
    return "pending"


def request_gopay_access_token(
    client_id: str,
    client_secret: str,
    base_url: str | None = None,
    client: httpx.Client | None = None,
) -> str | None:
    if not client_id or not client_secret:
        return None

    base_url = (base_url or _get_gopay_base_url()).rstrip("/")
    _client = client or httpx.Client(timeout=15.0)
    close_client = client is None

    try:
        response = _client.post(
            f"{base_url}/oauth2/token",
            data={"grant_type": "client_credentials"},
            headers={"Authorization": _get_basic_auth_header(
                client_id, client_secret)},
        )
        response.raise_for_status()
        payload = response.json()
        return payload.get("access_token")
    except (httpx.HTTPError, ValueError):
        return None
    finally:
        if close_client:
            _client.close()


def create_gopay_payment_session(
    *,
    order_id: str,
    order_number: str,
    amount: int,
    customer_name: str,
    customer_email: str,
    client_id: str | None = None,
    client_secret: str | None = None,
    base_url: str | None = None,
    return_url: str | None = None,
    notification_url: str | None = None,
    client: httpx.Client | None = None,
) -> str | None:
    client_id = (client_id or os.getenv("GOPAY_CLIENT_ID", "")).strip()
    client_secret = (client_secret or os.getenv(
        "GOPAY_CLIENT_SECRET", "")).strip()
    if not client_id or not client_secret:
        return None

    base_url = (base_url or _get_gopay_base_url()).rstrip("/")
    return_url = return_url or os.getenv("GOPAY_RETURN_URL") or os.getenv(
        "APP_BASE_URL") or "http://localhost:5173"
    notification_url = notification_url or os.getenv("GOPAY_NOTIFICATION_URL")

    access_token = request_gopay_access_token(
        client_id, client_secret, base_url, client=client)
    if not access_token:
        return None

    _client = client or httpx.Client(timeout=15.0)
    close_client = client is None
    try:
        payload = {
            "amount": int(amount),
            "currency": "CZK",
            "order_number": order_number,
            "items": [
                {
                    "name": f"Vstupenka {customer_name}",
                    "amount": int(amount),
                    "count": 1,
                    "pay": True,
                }
            ],
            "lang": "cs",
            "payer": {"email": customer_email},
        }
        if return_url:
            payload["callback"] = {"return_url": return_url}
        if notification_url:
            payload["callback"] = payload.get("callback", {})
            payload["callback"]["notification_url"] = notification_url

        response = _client.post(
            f"{base_url}/payments",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
        return data.get("gw_url") or data.get("payment_url") or data.get("redirect_url")
    except (httpx.HTTPError, ValueError):
        return None
    finally:
        if close_client:
            _client.close()


def get_gopay_payment_status(
    payment_id: str,
    *,
    client_id: str | None = None,
    client_secret: str | None = None,
    base_url: str | None = None,
    client: httpx.Client | None = None,
) -> dict[str, Any] | None:
    client_id = (client_id or os.getenv("GOPAY_CLIENT_ID", "")).strip()
    client_secret = (client_secret or os.getenv(
        "GOPAY_CLIENT_SECRET", "")).strip()
    if not client_id or not client_secret or not payment_id:
        return None

    base_url = (base_url or _get_gopay_base_url()).rstrip("/")
    access_token = request_gopay_access_token(
        client_id, client_secret, base_url, client=client)
    if not access_token:
        return None

    _client = client or httpx.Client(timeout=15.0)
    close_client = client is None
    try:
        response = _client.get(
            f"{base_url}/payments/{payment_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError):
        return None
    finally:
        if close_client:
            _client.close()
