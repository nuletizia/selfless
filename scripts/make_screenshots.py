"""Turns browser captures into 1280x800 Chrome Web Store screenshots: a caption band on
top, the capture below (cropped to fit, never scaled up).

Usage: python3 scripts/make_screenshots.py CAPTURE "Caption" OUT.png [CAPTURE "Caption" OUT.png ...]
(needs Pillow; uses the macOS Helvetica font)
"""
import sys
from PIL import Image, ImageDraw, ImageFont

W, H, BAND = 1280, 800, 124
TEAL = (15, 118, 110)
FONT = "/System/Library/Fonts/Helvetica.ttc"

args = sys.argv[1:]
if not args or len(args) % 3:
    sys.exit(__doc__)
for cap, caption, out in zip(args[0::3], args[1::3], args[2::3]):
    shot = Image.open(cap).convert("RGB")
    if shot.width != W:
        shot = shot.resize((W, round(shot.height * W / shot.width)), Image.LANCZOS)
    shot = shot.crop((0, 0, W, min(shot.height, H - BAND)))
    img = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, BAND], fill=TEAL)
    font = ImageFont.truetype(FONT, 38, index=1)
    tw = d.textlength(caption, font=font)
    d.text(((W - tw) / 2, (BAND - 44) / 2), caption, fill=(255, 255, 255), font=font)
    img.paste(shot, (0, BAND))
    d.line([0, BAND, W, BAND], fill=(220, 220, 220))
    img.save(out)
    print("wrote", out, img.size)
