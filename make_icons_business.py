#!/usr/bin/env python3
"""Generate Alliby Business brand icons — big italic 'A' matching the main
Alliby icon's proportions, with bold italic 'business' underneath, centered
as one unit. Same layout as make_icons_carry.py, blue instead of teal.

Produces:
  - google-play-business/icon-512.png        (Play Store listing icon, for later)
  - Native shell Business/favicon.svg         (reference / browser-tab-style icon)
  - Native shell Business/android/app/src/main/res/mipmap-*/  (Android app icon — legacy + round + adaptive foreground)
"""

from PIL import Image, ImageDraw, ImageFont
import os

ROOT = r"C:\Users\Yarich\Desktop\Aliby - foods"
ANDROID_RES = os.path.join(ROOT, "Native shell Business", "android", "app", "src", "main", "res")

FONT_ITALIC = r"C:\Windows\Fonts\georgiai.ttf"   # Georgia Italic
FONT_BOLD   = r"C:\Windows\Fonts\arialbi.ttf"    # Arial Bold Italic ("business" label)

BG_BLUE     = (120, 180, 224, 255)  # #78b4e0
BUSINESS_TXT = (255, 255, 255, 255)  # white

# Same font-size ratio as client/favicon.svg's "A" (font-size 21 on a 32 canvas)
A_FONT_RATIO = 21 / 32
LABEL_FONT_RATIO = 6.2 / 32  # "business" is longer than "carry" — slightly smaller to fit
GAP_RATIO = 0.05  # gap between "A" and "business"

# Android adaptive icons: only the inner ~66dp of the 108dp canvas is safely
# visible across all launcher mask shapes — shrink the glyph block to fit.
ADAPTIVE_SAFE_RATIO = 0.60


def _fonts(size):
    try:
        font_a = ImageFont.truetype(FONT_ITALIC, int(size * A_FONT_RATIO))
    except Exception:
        font_a = ImageFont.load_default()
    try:
        font_b = ImageFont.truetype(FONT_BOLD, int(size * LABEL_FONT_RATIO))
    except Exception:
        font_b = ImageFont.load_default()
    return font_a, font_b


def draw_glyphs(img, size, scale=1.0):
    """Draw the centered 'A' + italic 'business' block onto img (size x size),
    shrunk to `scale` of the canvas (used for the adaptive-icon safe zone)."""
    draw = ImageDraw.Draw(img)
    render_size = int(size * scale)
    font_a, font_b = _fonts(render_size)

    a_bbox = draw.textbbox((0, 0), "A", font=font_a)
    a_w, a_h = a_bbox[2] - a_bbox[0], a_bbox[3] - a_bbox[1]
    b_bbox = draw.textbbox((0, 0), "business", font=font_b)
    b_w, b_h = b_bbox[2] - b_bbox[0], b_bbox[3] - b_bbox[1]

    gap = int(render_size * GAP_RATIO)
    total_h = a_h + gap + b_h
    top = (size - total_h) // 2

    ax = (size - a_w) // 2 - a_bbox[0]
    ay = top - a_bbox[1]
    draw.text((ax, ay), "A", font=font_a, fill=(255, 255, 255, 255))

    bx = (size - b_w) // 2 - b_bbox[0]
    by = top + a_h + gap - b_bbox[1]
    draw.text((bx, by), "business", font=font_b, fill=BUSINESS_TXT)


def make_square_icon(size, shape="rounded"):
    """shape: 'rounded' (app icon), 'circle' (ic_launcher_round), or None (flat, no mask)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(img).rectangle([0, 0, size, size], fill=BG_BLUE)

    if shape == "rounded":
        rx = int(size * 7 / 32)  # matches rx="7" on a 32-unit canvas
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=rx, fill=255)
        img.putalpha(mask)
    elif shape == "circle":
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
        img.putalpha(mask)

    draw_glyphs(img, size, scale=1.0)
    return img


def make_foreground(size):
    """Adaptive-icon foreground layer: transparent bg, content shrunk to the safe zone."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_glyphs(img, size, scale=ADAPTIVE_SAFE_RATIO)
    return img


# ── Play Store listing icon (asset prepared now, listing itself comes later) ──
play_dir = os.path.join(ROOT, "google-play-business")
os.makedirs(play_dir, exist_ok=True)
make_square_icon(512, shape="rounded").save(os.path.join(play_dir, "icon-512.png"))
print(f"Saved {os.path.join(play_dir, 'icon-512.png')} (512x512)")

# ── Android app icon (legacy + round + adaptive foreground, all densities) ──
DENSITIES = {
    "mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192,
}
if os.path.isdir(ANDROID_RES):
    for density, legacy_size in DENSITIES.items():
        d = os.path.join(ANDROID_RES, f"mipmap-{density}")
        os.makedirs(d, exist_ok=True)

        make_square_icon(legacy_size, shape="rounded").convert("RGB").save(
            os.path.join(d, "ic_launcher.png"))
        make_square_icon(legacy_size, shape="circle").convert("RGB").save(
            os.path.join(d, "ic_launcher_round.png"))

        fg_size = int(legacy_size * 2.25)  # 108dp adaptive canvas / 48dp legacy = 2.25
        make_foreground(fg_size).save(os.path.join(d, "ic_launcher_foreground.png"))

        print(f"Saved Android mipmap-{density} (legacy {legacy_size}px, foreground {fg_size}px)")
else:
    print(f"Skipped Android icons — {ANDROID_RES} not found")

# ── favicon.svg — same layout computed via a real render, so the tiny SVG
# baselines match the PNG icons above rather than being guessed separately.
_PROBE = 320
_SCALE = _PROBE / 32
_probe = Image.new("RGBA", (_PROBE, _PROBE), (0, 0, 0, 0))
_draw = ImageDraw.Draw(_probe)
_font_a = ImageFont.truetype(FONT_ITALIC, int(_PROBE * A_FONT_RATIO))
_font_b = ImageFont.truetype(FONT_BOLD, int(_PROBE * LABEL_FONT_RATIO))
_a_bbox = _draw.textbbox((0, 0), "A", font=_font_a)
_a_h = _a_bbox[3] - _a_bbox[1]
_b_bbox = _draw.textbbox((0, 0), "business", font=_font_b)
_b_h = _b_bbox[3] - _b_bbox[1]
_gap = _PROBE * GAP_RATIO
_top = (_PROBE - (_a_h + _gap + _b_h)) / 2
_ay = _top - _a_bbox[1]           # same top-left y PIL would draw "A" at
_by = _top + _a_h + _gap - _b_bbox[1]
_ascent_a, _ = _font_a.getmetrics()
_ascent_b, _ = _font_b.getmetrics()
# SVG's y is the baseline, not the top-left — add each font's ascent
_a_baseline = (_ay + _ascent_a) / _SCALE
_b_baseline = (_by + _ascent_b) / _SCALE

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#78b4e0"/>
  <text x="16" y="{_a_baseline:.2f}"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="21"
        font-style="italic"
        fill="white"
        text-anchor="middle">A</text>
  <text x="16" y="{_b_baseline:.2f}"
        font-family="Arial, sans-serif"
        font-size="6.2"
        font-weight="700"
        font-style="italic"
        fill="white"
        text-anchor="middle">business</text>
</svg>
'''
favicon_path = os.path.join(ROOT, "Native shell Business", "favicon.svg")
with open(favicon_path, "w", encoding="utf-8") as f:
    f.write(svg)
print(f"Saved {favicon_path}")
