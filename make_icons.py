#!/usr/bin/env python3
"""Generate Alliby (client) brand icons for Android mipmap + notification
directories — same flat-background + centered-"A" style as Carry/Business
(make_icons_carry.py / make_icons_business.py), just with the client's own
orange instead of teal/blue, and no second word under the "A" (client has
no short brand suffix to print, unlike "carry"/"business")."""

from PIL import Image, ImageDraw, ImageFont
import os

BASE   = r"C:\Users\Yarich\Desktop\Aliby - foods\Native shell\android\app\src\main\res"
FONT_I = r"C:\Windows\Fonts\georgiai.ttf"   # Georgia Italic

BG_ORANGE = (232, 116, 59, 255)  # #e8743b — client's own brand orange (capacitor StatusBar color)

# Same ratio Carry/Business use for the "A" (21/32 canvas)
A_FONT_RATIO = 21 / 32


def _a_font(size):
    try:
        return ImageFont.truetype(FONT_I, int(size * A_FONT_RATIO))
    except Exception:
        return ImageFont.load_default()


def draw_a(img, size, scale=1.0):
    """Draw a single centered 'A' onto img (size x size), shrunk to `scale`
    of the canvas (used for the adaptive-icon safe zone) — same centering
    method as Carry/Business's draw_glyphs(), just without a second line."""
    draw = ImageDraw.Draw(img)
    render_size = int(size * scale)
    font = _a_font(render_size)
    bbox = draw.textbbox((0, 0), "A", font=font)
    a_w, a_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - a_w) // 2 - bbox[0]
    y = (size - a_h) // 2 - bbox[1]
    draw.text((x, y), "A", font=font, fill=(255, 255, 255, 255))


def make_square_icon(size, shape="rounded"):
    """shape: 'rounded' (app icon) or 'circle' (ic_launcher_round)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(img).rectangle([0, 0, size, size], fill=BG_ORANGE)

    mask = Image.new("L", (size, size), 0)
    if shape == "rounded":
        rx = int(size * 7 / 32)  # same ratio as Carry/Business
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=rx, fill=255)
    else:
        ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    img.putalpha(mask)

    draw_a(img, size, scale=1.0)
    return img


def make_foreground(size):
    """Adaptive-icon foreground: white A on transparent, full 108dp canvas,
    shrunk to the safe zone like Carry/Business's foreground layer."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_a(img, size, scale=0.60)
    return img


def make_notif(size):
    """Notification small icon: white A, centered, transparent bg."""
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    fs   = int(size * 0.85)
    try:
        font = ImageFont.truetype(FONT_I, fs)
    except Exception:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), "A", font=font)
    tw   = bbox[2] - bbox[0]
    th   = bbox[3] - bbox[1]
    x    = (size - tw) // 2 - bbox[0]
    y    = (size - th) // 2 - bbox[1]
    draw.text((x, y), "A", font=font, fill=(255, 255, 255, 255))
    return img


# ── mipmap: (launcher_px, foreground_px) ──────────────────────────────────────
MIPMAP = {
    "mipmap-mdpi":    (48,  108),
    "mipmap-hdpi":    (72,  162),
    "mipmap-xhdpi":   (96,  216),
    "mipmap-xxhdpi":  (144, 324),
    "mipmap-xxxhdpi": (192, 432),
}

for d, (ls, fs) in MIPMAP.items():
    p = os.path.join(BASE, d)
    os.makedirs(p, exist_ok=True)

    make_square_icon(ls, shape="rounded").convert("RGB").save(os.path.join(p, "ic_launcher.png"), optimize=True)
    make_square_icon(ls, shape="circle").convert("RGB").save(os.path.join(p, "ic_launcher_round.png"), optimize=True)

    fg = make_foreground(fs)
    fg.save(os.path.join(p, "ic_launcher_foreground.png"), optimize=True)
    print(f"  {d}: {ls}px launcher  {fs}px foreground")

# ── notification icons in drawable-* ─────────────────────────────────────────
NOTIF = {
    "drawable-mdpi":    24,
    "drawable-hdpi":    36,
    "drawable-xhdpi":   48,
    "drawable-xxhdpi":  72,
    "drawable-xxxhdpi": 96,
}

for d, sz in NOTIF.items():
    p = os.path.join(BASE, d)
    os.makedirs(p, exist_ok=True)
    make_notif(sz).save(os.path.join(p, "ic_notification.png"), optimize=True)
    print(f"  {d}: {sz}px notification")

print("\nAll icons generated.")
