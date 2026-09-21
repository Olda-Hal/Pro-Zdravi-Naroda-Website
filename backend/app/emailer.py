from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage
from pathlib import Path


DEFAULT_AUDIT_BCC = "info@prozdravinaroda.cz"


def smtp_is_configured() -> bool:
    return bool(
        os.getenv("SMTP_HOST")
        and os.getenv("SMTP_PORT")
        and os.getenv("SMTP_USER")
        and os.getenv("SMTP_PASSWORD")
        and os.getenv("MAIL_FROM")
    )


def send_email(
    *,
    to_email: str,
    subject: str,
    body: str,
    attachment_path: str | None = None,
    attachment_name: str | None = None,
) -> None:
    host = os.getenv("SMTP_HOST", "").strip()
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip()
    mail_from = os.getenv("MAIL_FROM", "").strip()
    use_tls = os.getenv("SMTP_USE_TLS", "true").strip().lower() == "true"

    if not (host and user and password and mail_from):
        raise RuntimeError("SMTP není nakonfigurované.")

    msg = EmailMessage()
    msg["From"] = mail_from
    msg["To"] = to_email
    if to_email.strip().lower() != DEFAULT_AUDIT_BCC:
        msg["Bcc"] = DEFAULT_AUDIT_BCC
    msg["Subject"] = subject
    msg.set_content(body)

    if attachment_path:
        path = Path(attachment_path)
        if path.exists():
            msg.add_attachment(
                path.read_bytes(),
                maintype="application",
                subtype="pdf",
                filename=attachment_name or path.name,
            )

    if use_tls:
        with smtplib.SMTP(host, port, timeout=20) as client:
            client.starttls()
            client.login(user, password)
            client.send_message(msg)
        return

    with smtplib.SMTP_SSL(host, port, timeout=20) as client:
        client.login(user, password)
        client.send_message(msg)
