#!/usr/bin/env python3
"""Generate PNG + ICO favicons for site.alliby.ru and alliby.ru."""

from PIL import Image, ImageDraw, ImageFont
import os

BASE   = r"C:\Users\Yarich\Desktop\Aliby - foods"
FONT_I = r"C:\Windows\Fonts\georgiai.ttf"

C_TOP   = (240, 149, 96)
C_BOT   = (191,  79, 26)
ALPHA_A = 237

def gradient_bg(draw, size):
    for y in range(size):
        t = y / max(size - 1, 1)
        r = int(C_TOP[0] + (C_BOT[0] - C_TOP[0]) * t)
        g = int(C_TOP[1] + (C_BOT[1] - C_TOP[1]) * t)
        b = int(C_TOP[2] + (C_BOT[2] - C_TOP[2]) * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

def make_favicon(size):
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    gradient_bg(draw, size)
    fs = int(size * 0.656)
    try:
        font = ImageFont.truetype(FONT_I, fs)
    except Exception:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), "A", font=font)
    tw = bbox[2] - bbox[0]
    x  = (size - tw) // 2 - bbox[0]
    y  = int(size * 0.25) - bbox[1]
    draw.text((x, y), "A", font=font, fill=(255, 255, 255, ALPHA_A))
    return img

ICO_SIZES = [16, 32, 48]

# ── site/ ────────────────────────────────────────────────────────────────────
site_dir = os.path.join(BASE, "site")

img192 = make_favicon(192)
img192.convert("RGB").save(os.path.join(site_dir, "favicon-192.png"), optimize=True)
print("site/favicon-192.png")

ico_imgs = [make_favicon(s) for s in ICO_SIZES]
ico_imgs[0].save(
    os.path.join(site_dir, "favicon.ico"),
    format="ICO", sizes=[(s, s) for s in ICO_SIZES],
    append_images=ico_imgs[1:],
)
print("site/favicon.ico")

# ── client/ ──────────────────────────────────────────────────────────────────
client_dir = os.path.join(BASE, "client")
src = Image.open(os.path.join(client_dir, "icons", "icon-192.v2.png")).convert("RGBA")
ico_imgs_c = [src.resize((s, s), Image.LANCZOS) for s in ICO_SIZES]
ico_imgs_c[0].save(
    os.path.join(client_dir, "favicon.ico"),
    format="ICO", sizes=[(s, s) for s in ICO_SIZES],
    append_images=ico_imgs_c[1:],
)
print("client/favicon.ico")

print("\nDone.")
