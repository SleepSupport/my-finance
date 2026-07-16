"""One-off script to generate the PWA app icons (not needed at runtime)."""
from PIL import Image, ImageDraw
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)

ACCENT = (79, 124, 255, 255)  # matches css --accent
WHITE = (255, 255, 255, 255)


def rounded_square(size, radius_ratio, padding_ratio=0.0):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = int(size * padding_ratio)
    box = [pad, pad, size - pad, size - pad]
    radius = int((size - 2 * pad) * radius_ratio)
    draw.rounded_rectangle(box, radius=radius, fill=ACCENT)
    return img, draw, pad


def draw_trend_glyph(draw, size, pad, stroke_w):
    # upward trend line with dot markers, evoking the in-app charts
    inner = size - 2 * pad
    x0, y0 = pad + inner * 0.22, pad + inner * 0.62
    x1, y1 = pad + inner * 0.42, pad + inner * 0.48
    x2, y2 = pad + inner * 0.60, pad + inner * 0.58
    x3, y3 = pad + inner * 0.80, pad + inner * 0.30
    pts = [(x0, y0), (x1, y1), (x2, y2), (x3, y3)]
    draw.line(pts, fill=WHITE, width=stroke_w, joint="curve")
    r = stroke_w * 0.9
    for x, y in pts:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=WHITE)


def make_icon(path, size, radius_ratio, padding_ratio):
    img, draw, pad = rounded_square(size, radius_ratio, padding_ratio)
    stroke_w = max(2, int(size * 0.035))
    draw_trend_glyph(draw, size, pad + int(size * 0.06), stroke_w)
    img.save(path)
    print(f"wrote {path} ({size}x{size})")


make_icon(OUT / "icon-192.png", 192, radius_ratio=0.22, padding_ratio=0.0)
make_icon(OUT / "icon-512.png", 512, radius_ratio=0.22, padding_ratio=0.0)
# maskable: keep the glyph inside the safe zone (icon fills the whole canvas, no rounding needed - the OS applies its own mask)
make_icon(OUT / "icon-maskable-512.png", 512, radius_ratio=0.0, padding_ratio=0.0)
make_icon(OUT / "apple-touch-icon.png", 180, radius_ratio=0.22, padding_ratio=0.0)
make_icon(OUT / "favicon-32.png", 32, radius_ratio=0.28, padding_ratio=0.0)
