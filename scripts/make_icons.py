"""Draws the extension icons: an open ring (a circle with a piece left out).

Usage: python3 scripts/make_icons.py   (needs Pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "extension" / "icons"
TEAL = (15, 118, 110, 255)

for size in (16, 48, 128):
    s = size * 8  # supersample, then downscale for smooth edges
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = s * 0.12
    width = int(s * 0.17)
    d.arc([pad, pad, s - pad, s - pad], start=-30, end=270, fill=TEAL, width=width)
    r = s * 0.09
    d.ellipse([s / 2 - r, s / 2 - r, s / 2 + r, s / 2 + r], fill=TEAL)
    img.resize((size, size), Image.LANCZOS).save(OUT / f"icon{size}.png")
    print("wrote", OUT / f"icon{size}.png")
