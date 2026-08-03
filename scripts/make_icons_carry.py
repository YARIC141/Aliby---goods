#!/usr/bin/env python3
"""Generate Alliby Carry brand icons — bigger 'A' matching the main Alliby
icon's proportions, with italic 'carry' underneath, centered as one unit.

Produces:
  - carry/icons/icon-192.png, icon-512.png   (PWA icons)
  - google-play-carry/icon-512.png           (Play Store listing icon)
  - carry/favicon.svg                        (browser tab icon)
  - Native shell Carry/android/app/src/main/res/mipmap-*/               (Android app icon — legacy + round + adaptive foreground)
"""

from PIL import Image, ImageDraw, ImageFont
import os

ROOT = r"C:\Users\Yarich\Desktop\Aliby - foods"
ANDROID_RES = os.path.join(ROOT, "Native shell Carry", "android", "app", "src", "main", "res")

FONT_ITALIC = r"C:\Windows\Fonts\georgiai.ttf"   # Georgia Italic
FONT_BOLD   = r"C:\Windows\Fonts\arialbi.ttf"    # Arial Bold Italic ("carry" label)

BG_TEAL   = (20, 184, 166, 255)   # #14b8a6 — same flat color as favicon.svg
CARRY_TXT = (255, 255, 255, 255)  # white

# Same font-size ratio as client/favicon.svg's "A" (font-size 21 on a 32 canvas)
A_FONT_RATIO = 21 / 32
CARRY_FONT_RATIO = 7.5 / 32
GAP_RATIO = 0.05  # gap between "A" and "carry"

# Android adaptive icons: only the inner ~66dp of the 108dp canvas is safely
# visible across all launcher mask shapes — shrink the glyph block to fit.
ADAPTIVE_SAFE_RATIO = 0.60


def _fonts(size):
    try:
        font_a = ImageFont.truetype(FONT_ITALIC, int(size * A_FONT_RATIO))
    except Exception:
        font_a = ImageFont.load_default()
    try:
        font_c = ImageFont.truetype(FONT_BOLD, int(size * CARRY_FONT_RATIO))
    except Exception:
        font_c = ImageFont.load_default()
    return font_a, font_c


def draw_glyphs(img, size, scale=1.0):
    """Draw the centered 'A' + italic 'carry' block onto img (size x size),
    shrunk to `scale` of the canvas (used for the adaptive-icon safe zone)."""
    draw = ImageDraw.Draw(img)
    render_size = int(size * scale)
    font_a, font_c = _fonts(render_size)

    a_bbox = draw.textbbox((0, 0), "A", font=font_a)
    a_w, a_h = a_bbox[2] - a_bbox[0], a_bbox[3] - a_bbox[1]
    c_bbox = draw.textbbox((0, 0), "carry", font=font_c)
    c_w, c_h = c_bbox[2] - c_bbox[0], c_bbox[3] - c_bbox[1]

    gap = int(render_size * GAP_RATIO)
    total_h = a_h + gap + c_h
    top = (size - total_h) // 2

    ax = (size - a_w) // 2 - a_bbox[0]
    ay = top - a_bbox[1]
    draw.text((ax, ay), "A", font=font_a, fill=(255, 255, 255, 255))

    cx = (size - c_w) // 2 - c_bbox[0]
    cy = top + a_h + gap - c_bbox[1]
    draw.text((cx, cy), "carry", font=font_c, fill=CARRY_TXT)


def make_square_icon(size, shape="rounded"):
    """shape: 'rounded' (app icon), 'circle' (ic_launcher_round), or None (flat, no mask)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(img).rectangle([0, 0, size, size], fill=BG_TEAL)

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


# ── PWA / Play Store icons ──────────────────────────────────────────────
for size, out in [
    (192, os.path.join(ROOT, "carry", "icons", "icon-192.png")),
    (512, os.path.join(ROOT, "carry", "icons", "icon-512.png")),
    (512, os.path.join(ROOT, "google-play-carry", "icon-512.png")),
]:
    make_square_icon(size, shape="rounded").save(out)
    print(f"Saved {out} ({size}x{size})")

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
_font_c = ImageFont.truetype(FONT_BOLD, int(_PROBE * CARRY_FONT_RATIO))
_a_bbox = _draw.textbbox((0, 0), "A", font=_font_a)
_a_h = _a_bbox[3] - _a_bbox[1]
_c_bbox = _draw.textbbox((0, 0), "carry", font=_font_c)
_c_h = _c_bbox[3] - _c_bbox[1]
_gap = _PROBE * GAP_RATIO
_top = (_PROBE - (_a_h + _gap + _c_h)) / 2
_ay = _top - _a_bbox[1]           # same top-left y PIL would draw "A" at
_cy = _top + _a_h + _gap - _c_bbox[1]
_ascent_a, _ = _font_a.getmetrics()
_ascent_c, _ = _font_c.getmetrics()
# SVG's y is the baseline, not the top-left — add each font's ascent
_a_baseline = (_ay + _ascent_a) / _SCALE
_c_baseline = (_cy + _ascent_c) / _SCALE

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#14b8a6"/>
  <text x="16" y="{_a_baseline:.2f}"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="21"
        font-style="italic"
        fill="white"
        text-anchor="middle">A</text>
  <text x="16" y="{_c_baseline:.2f}"
        font-family="Arial, sans-serif"
        font-size="7.5"
        font-weight="700"
        font-style="italic"
        fill="white"
        text-anchor="middle">carry</text>
</svg>
'''
favicon_path = os.path.join(ROOT, "carry", "favicon.svg")
with open(favicon_path, "w", encoding="utf-8") as f:
    f.write(svg)
print(f"Saved {favicon_path}")
