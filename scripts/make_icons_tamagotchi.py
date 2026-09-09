#!/usr/bin/env python3
"""PWA icons for the Tamagotchi web MVP — flat teal square with a centered
"Т", same style family as make_icons.py (client) but its own accent color
so it's visually distinct in a home-screen row of installed Alliby apps."""

from PIL import Image, ImageDraw, ImageFont
import os

BASE = r"C:\Users\Yarich\Desktop\Aliby - foods\tamagotchi\icons"
FONT = r"C:\Windows\Fonts\georgiab.ttf"  # Georgia Bold

BG = (13, 59, 54, 255)     # dark teal background
FG = (45, 212, 191, 255)   # accent teal letter, matches app's --accent


def make_icon(size):
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype(FONT, int(size * 0.6))
    except Exception:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), "Т", font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - w) // 2 - bbox[0]
    y = (size - h) // 2 - bbox[1]
    draw.text((x, y), "Т", font=font, fill=FG)
    return img


os.makedirs(BASE, exist_ok=True)
for size in (192, 512):
    make_icon(size).convert("RGB").save(os.path.join(BASE, f"icon-{size}.png"), optimize=True)
    print(f"  icon-{size}.png written")
