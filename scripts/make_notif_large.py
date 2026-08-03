from PIL import Image, ImageDraw, ImageFont
import os

FONT_I = r"C:\Windows\Fonts\georgiai.ttf"
C_TOP = (240, 149, 96)
C_BOT = (191,  79, 26)

def make_icon(size):
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(size - 1, 1)
        r = int(C_TOP[0] + (C_BOT[0] - C_TOP[0]) * t)
        g = int(C_TOP[1] + (C_BOT[1] - C_TOP[1]) * t)
        b = int(C_TOP[2] + (C_BOT[2] - C_TOP[2]) * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))
    rx = int(size * 0.219)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size-1, size-1], radius=rx, fill=255)
    img.putalpha(mask)
    fs = int(size * 0.656)
    try:
        font = ImageFont.truetype(FONT_I, fs)
    except Exception:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), "A", font=font)
    tw = bbox[2] - bbox[0]
    x  = (size - tw) // 2 - bbox[0]
    y2 = int(size * 0.25) - bbox[1]
    draw.text((x, y2), "A", font=font, fill=(255, 255, 255, 237))
    return img

out = r"C:\Users\Yarich\Desktop\Aliby - foods\client\icons\notification-large.png"
icon = make_icon(256)
rgb  = Image.new("RGB", (256, 256), tuple(
    int(C_TOP[i] + (C_BOT[i] - C_TOP[i]) * 0.5) for i in range(3)
))
rgb.paste(icon, mask=icon.split()[3])
rgb.save(out, optimize=True)
print("Saved:", out)
