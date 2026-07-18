#!/usr/bin/env python3
"""Generate Google Play Feature Graphic 1024x500 for Alliby Carry."""

from PIL import Image, ImageDraw, ImageFont
import os

HERE = os.path.dirname(__file__)
ICON = os.path.join(os.path.dirname(HERE), "carry", "icons", "icon-512.png")
OUT  = os.path.join(HERE, "feature-graphic.png")
W, H = 1024, 500

# Carry brand palette (teal, matches carry/icons/icon-512.png background)
C_TOP = (20, 184, 166)   # #14b8a6
C_BOT = (12, 122, 110)   # darker teal

FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
FONT_REG  = r"C:\Windows\Fonts\segoeui.ttf"

def gradient_bg(img):
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        r = int(C_TOP[0] + (C_BOT[0] - C_TOP[0]) * t)
        g = int(C_TOP[1] + (C_BOT[1] - C_TOP[1]) * t)
        b = int(C_TOP[2] + (C_BOT[2] - C_TOP[2]) * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b))

def center_text(draw, text, font, cx, cy, color=(255, 255, 255)):
    bbox = draw.textbbox((0, 0), text, font=font)
    x = cx - (bbox[2] - bbox[0]) // 2 - bbox[0]
    y = cy - (bbox[3] - bbox[1]) // 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=color)

canvas = Image.new("RGB", (W, H))
gradient_bg(canvas)
draw = ImageDraw.Draw(canvas)

# decorative circles, top-right / bottom-left for depth
for cx, cy, r, a in [
    (W - 40,  -40, 180, 18),
    (W + 20,  H // 2, 220, 12),
    (-60, H + 20, 160, 12),
]:
    circle_img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(circle_img)
    cd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, a))
    canvas.paste(Image.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 0)), circle_img).convert("RGB"),
                 mask=circle_img.split()[3])

# app icon tile — left side, vertically centered (reuse real carry icon asset)
ICON_SIZE = 200
icon = Image.open(ICON).convert("RGBA").resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
icon_x = 90
icon_y = (H - ICON_SIZE) // 2

# shadow under icon
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
rx = int(ICON_SIZE * 0.219)
for offset, alpha in [(8, 20), (5, 30), (3, 20)]:
    sd.rounded_rectangle(
        [icon_x + offset, icon_y + offset, icon_x + ICON_SIZE + offset, icon_y + ICON_SIZE + offset],
        radius=rx, fill=(0, 0, 0, alpha)
    )
canvas.paste(Image.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 0)), shadow).convert("RGB"),
             mask=shadow.split()[3])
canvas.paste(icon, (icon_x, icon_y), mask=icon.split()[3])

# text block — right of icon
TEXT_CX = icon_x + ICON_SIZE + (W - icon_x - ICON_SIZE) // 2
TEXT_CY = H // 2

try:   font_title = ImageFont.truetype(FONT_BOLD, 96)
except Exception: font_title = ImageFont.load_default()
center_text(draw, "Alliby Carry", font_title, TEXT_CX, TEXT_CY - 40)

try:   font_sub = ImageFont.truetype(FONT_REG, 28)
except Exception: font_sub = ImageFont.load_default()
center_text(draw, "Берите заказы на доставку рядом с собой", font_sub, TEXT_CX, TEXT_CY + 55,
            color=(224, 250, 245))

# thin separator line between icon and text
sep_x = icon_x + ICON_SIZE + 40
draw.line([(sep_x, H // 2 - 80), (sep_x, H // 2 + 80)], fill=(255, 255, 255, 60), width=1)

canvas.save(OUT, optimize=True)
print(f"Saved: {OUT}  ({W}x{H})")
