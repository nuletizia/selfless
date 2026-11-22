"""Draws the Chrome Web Store small promo tile (440x280): icon, name, one-line pitch.

Usage: python3 scripts/make_promo.py   (needs Pillow; uses the macOS Helvetica font)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
TEAL = (15, 118, 110)
W, H, S = 440, 280, 3  # draw at 3x, then downscale

img = Image.new("RGB", (W * S, H * S), (255, 255, 255))
d = ImageDraw.Draw(img)
font = lambda size, idx=0: ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size * S, index=idx)

icon = Image.open(ROOT / "extension/icons/icon128.png").convert("RGBA").resize((96 * S, 96 * S), Image.LANCZOS)
img.paste(icon, (40 * S, 52 * S), icon)
d.text((152 * S, 62 * S), "Selfless", fill=TEAL, font=font(44, 1))
d.text((154 * S, 118 * S), "Citation filters for Scholar profiles", fill=(60, 60, 60), font=font(17))
lines = ["Leave out self-citations and", "co-author citations, verified", "with OpenAlex."]
for i, line in enumerate(lines):
    d.text((40 * S, (178 + 24 * i) * S), line, fill=(90, 90, 90), font=font(18))
d.rectangle([0, (H - 6) * S, W * S, H * S], fill=TEAL)

out = ROOT / "store" / "promo-440x280.png"
img.resize((W, H), Image.LANCZOS).save(out)
print("wrote", out)
