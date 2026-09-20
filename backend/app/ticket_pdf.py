from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas


def build_ticket_pdf(
    *,
    output_path: Path,
    app_name: str,
    event_title: str,
    event_date: str,
    event_time: str,
    event_location: str,
    order_number: str,
    customer_name: str,
    ticket_count: int,
    amount_czk: int,
    variable_symbol: str,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    c = canvas.Canvas(str(output_path), pagesize=A4)
    width, height = A4

    # background
    c.setFillColor(colors.Color(0.07, 0.11, 0.18))
    c.rect(0, 0, width, height, stroke=0, fill=1)

    c.setFillColor(colors.Color(0.88, 0.60, 0.22, alpha=0.22))
    c.circle(width - 35 * mm, height - 40 * mm, 42 * mm, stroke=0, fill=1)

    # main card
    card_x = 18 * mm
    card_y = 28 * mm
    card_w = width - 36 * mm
    card_h = height - 56 * mm

    c.setFillColor(colors.Color(0.96, 0.95, 0.92))
    c.roundRect(card_x, card_y, card_w, card_h, 10 * mm, stroke=0, fill=1)

    c.setStrokeColor(colors.Color(0.12, 0.12, 0.12, alpha=0.16))
    c.setLineWidth(1)
    c.roundRect(card_x + 6, card_y + 6, card_w - 12, card_h - 12, 9 * mm, stroke=1, fill=0)

    c.setFillColor(colors.Color(0.13, 0.16, 0.22))
    c.setFont("Helvetica-Bold", 13)
    c.drawString(card_x + 16 * mm, card_y + card_h - 20 * mm, app_name)

    c.setFont("Helvetica-Bold", 28)
    c.drawString(card_x + 16 * mm, card_y + card_h - 36 * mm, "VSTUPENKA")

    c.setFont("Helvetica", 13)
    c.drawString(card_x + 16 * mm, card_y + card_h - 48 * mm, event_title)

    c.setFillColor(colors.Color(0.34, 0.28, 0.15))
    c.setFont("Helvetica-Bold", 12)
    c.drawString(card_x + 16 * mm, card_y + card_h - 64 * mm, f"Datum: {event_date}   Cas: {event_time}")
    c.drawString(card_x + 16 * mm, card_y + card_h - 74 * mm, f"Misto: {event_location}")

    c.setFillColor(colors.Color(0.15, 0.15, 0.15))
    c.setFont("Helvetica", 11)
    c.drawString(card_x + 16 * mm, card_y + card_h - 92 * mm, f"Objednavka: {order_number}")
    c.drawString(card_x + 16 * mm, card_y + card_h - 102 * mm, f"Jmeno: {customer_name}")
    c.drawString(card_x + 16 * mm, card_y + card_h - 112 * mm, f"Pocet vstupenek: {ticket_count}")
    c.drawString(card_x + 16 * mm, card_y + card_h - 122 * mm, f"Uhrazeno: {amount_czk / 100:.2f} CZK")
    c.drawString(card_x + 16 * mm, card_y + card_h - 132 * mm, f"VS platby: {variable_symbol}")

    c.setStrokeColor(colors.Color(0.12, 0.12, 0.12, alpha=0.3))
    c.setLineWidth(0.8)
    c.line(card_x + 16 * mm, card_y + 72 * mm, card_x + card_w - 16 * mm, card_y + 72 * mm)

    c.setFillColor(colors.Color(0.12, 0.12, 0.12))
    c.setFont("Helvetica-Bold", 12)
    c.drawString(card_x + 16 * mm, card_y + 60 * mm, "Kontrola vstupu")
    c.setFont("Helvetica", 10)
    c.drawString(card_x + 16 * mm, card_y + 52 * mm, "Predlozte tuto vstupenku v mobilu nebo vytistenou.")

    # stylized barcode blocks
    bar_x = card_x + 16 * mm
    bar_y = card_y + 26 * mm
    bar_h = 18 * mm
    c.setFillColor(colors.Color(0.08, 0.08, 0.08))
    widths = [1, 2, 1, 3, 2, 1, 1, 4, 1, 3, 2, 1, 2, 4, 1, 2, 3, 1, 2, 1, 3, 2, 1, 4]
    offset = 0
    for w in widths:
        c.rect(bar_x + offset * mm, bar_y, w * mm, bar_h, stroke=0, fill=1)
        offset += w + 0.8

    c.setFont("Helvetica", 9)
    c.drawString(bar_x, bar_y - 6 * mm, f"{order_number}  |  {variable_symbol}")

    c.showPage()
    c.save()
