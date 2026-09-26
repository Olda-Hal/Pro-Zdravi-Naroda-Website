from __future__ import annotations

from pathlib import Path

from PIL import Image
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FALLBACK_REGULAR = "Helvetica"
FALLBACK_BOLD = "Helvetica-Bold"


def _register_ticket_fonts() -> None:
    if not Path(FONT_REGULAR).exists() or not Path(FONT_BOLD).exists():
        return

    registered = set(pdfmetrics.getRegisteredFontNames())
    if "DejaVuSans" not in registered:
        pdfmetrics.registerFont(TTFont("DejaVuSans", FONT_REGULAR))
    if "DejaVuSans-Bold" not in registered:
        pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", FONT_BOLD))


def _resolve_ticket_fonts() -> tuple[str, str]:
    registered = set(pdfmetrics.getRegisteredFontNames())
    regular = "DejaVuSans" if "DejaVuSans" in registered else FALLBACK_REGULAR
    bold = "DejaVuSans-Bold" if "DejaVuSans-Bold" in registered else FALLBACK_BOLD
    return regular, bold


def _find_ticket_portrait() -> Path | None:
    backend_root = Path(__file__).resolve().parents[1]
    repo_root = backend_root.parent
    search_dirs = [
        # Preferred location: backend data directory (mounted and outside tickets folder).
        backend_root / "data",
        # Backward-compatible fallback.
        repo_root / "frontend" / "public" / "images",
    ]

    for directory in search_dirs:
        for file_name in ("karel-iv.png", "karel-iv.jpg", "karel-iv.jpeg"):
            candidate = directory / file_name
            if candidate.exists():
                return candidate
    return None


def _build_faded_portrait(source: Path, output: Path) -> None:
    try:
        with Image.open(source) as image:
            rgba = image.convert('RGBA')
            width, height = rgba.size
            fade_px = max(18, min(width, height) // 8)
            alpha = Image.new('L', (width, height), 255)
            pixels = alpha.load()

            for y in range(height):
                for x in range(width):
                    px = min(x, width - 1 - x, y, height - 1 - y)
                    if px >= fade_px:
                        pixels[x, y] = 255
                    else:
                        pixels[x, y] = int(round(255 * (px / max(fade_px, 1))))

            rgba.putalpha(alpha)
            rgba.save(output, format='PNG')
    except Exception:
        # Keep the original source when processing fails so the PDF still renders.
        output.write_bytes(source.read_bytes())


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
    _register_ticket_fonts()
    font_regular, font_bold = _resolve_ticket_fonts()

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

    portrait_path = _find_ticket_portrait()
    if portrait_path is not None:
        assets_cache_dir = output_path.parent.parent / '.ticket-assets'
        assets_cache_dir.mkdir(parents=True, exist_ok=True)
        portrait_fd = assets_cache_dir / 'karel-iv-faded.png'
        _build_faded_portrait(portrait_path, portrait_fd)

        portrait_w = 42 * mm
        portrait_h = 52 * mm
        portrait_x = card_x + card_w - 14 * mm - portrait_w
        portrait_y = card_y + card_h - 16 * mm - portrait_h
        c.drawImage(str(portrait_fd), portrait_x, portrait_y, width=portrait_w, height=portrait_h, preserveAspectRatio=True, mask='auto')

    c.setFillColor(colors.Color(0.13, 0.16, 0.22))
    c.setFont(font_bold, 13)
    c.drawString(card_x + 16 * mm, card_y + card_h - 20 * mm, app_name)

    c.setFont(font_bold, 28)
    c.drawString(card_x + 16 * mm, card_y + card_h - 36 * mm, "VSTUPENKA")

    c.setFont(font_regular, 13)
    c.drawString(card_x + 16 * mm, card_y + card_h - 48 * mm, event_title)

    c.setFillColor(colors.Color(0.34, 0.28, 0.15))
    c.setFont(font_bold, 12)
    c.drawString(card_x + 16 * mm, card_y + card_h - 64 * mm, f"Datum: {event_date}   Čas: {event_time}")
    c.drawString(card_x + 16 * mm, card_y + card_h - 74 * mm, f"Místo: {event_location}")

    c.setFillColor(colors.Color(0.15, 0.15, 0.15))
    c.setFont(font_regular, 11)
    c.drawString(card_x + 16 * mm, card_y + card_h - 92 * mm, f"Objednávka: {order_number}")
    c.drawString(card_x + 16 * mm, card_y + card_h - 102 * mm, f"Jméno: {customer_name}")
    c.drawString(card_x + 16 * mm, card_y + card_h - 112 * mm, f"Počet vstupenek: {ticket_count}")
    c.drawString(card_x + 16 * mm, card_y + card_h - 122 * mm, f"Uhrazeno: {amount_czk / 100:.2f} CZK")
    c.drawString(card_x + 16 * mm, card_y + card_h - 132 * mm, f"VS platby: {variable_symbol}")

    c.setStrokeColor(colors.Color(0.12, 0.12, 0.12, alpha=0.3))
    c.setLineWidth(0.8)
    c.line(card_x + 16 * mm, card_y + 72 * mm, card_x + card_w - 16 * mm, card_y + 72 * mm)

    c.setFillColor(colors.Color(0.12, 0.12, 0.12))
    c.setFont(font_bold, 12)
    c.drawString(card_x + 16 * mm, card_y + 60 * mm, "Kontrola vstupu")
    c.setFont(font_regular, 10)
    c.drawString(card_x + 16 * mm, card_y + 52 * mm, "Předložte tuto vstupenku v mobilu nebo vytištěnou.")

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

    c.setFont(font_regular, 9)
    c.drawString(bar_x, bar_y - 6 * mm, f"{order_number}  |  {variable_symbol}")

    c.showPage()
    c.save()
