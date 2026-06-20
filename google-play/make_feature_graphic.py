#!/usr/bin/env python3
"""Generate Google Play Feature Graphic 1024×500 for Alliby."""

from PIL import Image, ImageDraw, ImageFont
import math, os

OUT  = r"C:\Users\Yarich\Desktop\Aliby - foods\feature-graphic.png"
W, H = 1024, 500

# Brand palette (same as make_icons.py)
C_TOP = (240, 149, 96)   # #f09560
C_BOT = (191,  79, 26)   # #bf4f1a

FONT_ITALIC = r"C:\Windows\Fonts\georgiai.ttf"
FONT_BOLD   = r"C:\Windows\Fonts\segoeuib.ttf"
FONT_REG    = r"C:\Windows\Fonts\segoeui.ttf"

# ── helpers ──────────────────────────────────────────────────────────────────

def gradient_bg(img):
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        r = int(C_TOP[0] + (C_BOT[0] - C_TOP[0]) * t)
        g = int(C_TOP[1] + (C_BOT[1] - C_TOP[1]) * t)
        b = int(C_TOP[2] + (C_BOT[2] - C_TOP[2]) * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b))

def make_icon_tile(size):
    """Rounded square icon tile with gradient bg + white A (matches app icon)."""
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # gradient
    for y in range(size):
        t = y / max(size - 1, 1)
        r = int(C_TOP[0] + (C_BOT[0] - C_TOP[0]) * t)
        g = int(C_TOP[1] + (C_BOT[1] - C_TOP[1]) * t)
        b = int(C_TOP[2] + (C_BOT[2] - C_TOP[2]) * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))
    # rounded corners mask
    rx   = int(size * 0.219)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size-1, size-1], radius=rx, fill=255)
    img.putalpha(mask)
    # white "A"
    fs   = int(size * 0.656)
    try:   font = ImageFont.truetype(FONT_ITALIC, fs)
    except: font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), "A", font=font)
    x = (size - (bbox[2] - bbox[0])) // 2 - bbox[0]
    y = int(size * 0.25) - bbox[1]
    draw.text((x, y), "A", font=font, fill=(255, 255, 255, 237))
    return img

def center_text(draw, text, font, cx, cy, color=(255, 255, 255)):
    bbox = draw.textbbox((0, 0), text, font=font)
    x = cx - (bbox[2] - bbox[0]) // 2 - bbox[0]
    y = cy - (bbox[3] - bbox[1]) // 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=color)

# ── build ──────────────────────────────────────────────────────────────────

canvas = Image.new("RGB", (W, H))
gradient_bg(canvas)
draw   = ImageDraw.Draw(canvas)

# subtle dark vignette on edges for depth
for i in range(60):
    alpha = int(60 * (1 - i / 60))
    draw.rectangle([i, i, W-1-i, H-1-i], outline=(0, 0, 0, alpha) if False else None)

# decorative circles (semi-transparent, top-right)
for cx, cy, r, a in [
    (W - 40,  -40, 180, 18),
    (W + 20,  H//2, 220, 12),
    (W - 160, H + 20, 130, 10),
]:
    circle_img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(circle_img)
    cd.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(255, 255, 255, a))
    canvas.paste(Image.alpha_composite(Image.new("RGBA", (W, H), (0,0,0,0)), circle_img).convert("RGB"),
                 mask=circle_img.split()[3])

# app icon tile — left side, vertically centered
ICON_SIZE = 200
icon = make_icon_tile(ICON_SIZE)
icon_x = 90
icon_y = (H - ICON_SIZE) // 2
canvas.paste(icon, (icon_x, icon_y), mask=icon.split()[3])

# shadow under icon
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
for offset, alpha in [(8, 20), (5, 30), (3, 20)]:
    rx = int(ICON_SIZE * 0.219)
    sd.rounded_rectangle(
        [icon_x + offset, icon_y + offset,
         icon_x + ICON_SIZE + offset, icon_y + ICON_SIZE + offset],
        radius=rx, fill=(0, 0, 0, alpha)
    )
canvas.paste(Image.alpha_composite(Image.new("RGBA", (W, H), (0,0,0,0)), shadow).convert("RGB"),
             mask=shadow.split()[3])
canvas.paste(icon, (icon_x, icon_y), mask=icon.split()[3])  # re-paste over shadow

# text block — right of icon
TEXT_CX = icon_x + ICON_SIZE + (W - icon_x - ICON_SIZE) // 2  # center of right area
TEXT_CY = H // 2

# "Alliby" — large
try:   font_title = ImageFont.truetype(FONT_BOLD, 110)
except: font_title = ImageFont.load_default()
center_text(draw, "Alliby", font_title, TEXT_CX, TEXT_CY - 40)

# subtitle
try:   font_sub = ImageFont.truetype(FONT_REG, 30)
except: font_sub = ImageFont.load_default()
center_text(draw, "Заказ еды и услуг рядом с домом", font_sub, TEXT_CX, TEXT_CY + 70,
            color=(255, 235, 220))

# thin separator line between icon and text
sep_x = icon_x + ICON_SIZE + 40
draw.line([(sep_x, H//2 - 80), (sep_x, H//2 + 80)], fill=(255, 255, 255, 60), width=1)

canvas.save(OUT, optimize=True)
print(f"Saved: {OUT}  ({W}x{H})")
