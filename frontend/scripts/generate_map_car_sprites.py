#!/usr/bin/env python3
"""Generate the NEXRYDE top-down map car sprites in brand colours.

Silhouette is built from a width profile rather than a rounded rectangle, so the
car keeps a tapered nose and shoulders at the 36–44px size it actually renders at.
Drawn at 8x and downsampled. Canvas is 64x128 at 1x, nose pointing north.
"""
import math
from PIL import Image, ImageDraw, ImageFilter

W, H = 64, 128
SS = 8

LIME = (144, 192, 72, 255)        # #90C048
NAVY = (17, 20, 39, 255)          # #111427
WHITE = (255, 255, 255, 255)
GLASS_COOL = (214, 226, 240, 255)
GREY = (154, 160, 166, 255)
GREY_DARK = (120, 126, 133, 255)
TAIL = (229, 72, 77, 240)

STATES = {
    # body, glass, roof accent
    'available': (LIME, NAVY, LIME),
    'on_trip': (NAVY, GLASS_COOL, LIME),
    'offline': (GREY, GLASS_COOL, GREY_DARK),
}


def width_at(t: float) -> float:
    """Half-width factor (0..1) along the body, t=0 nose, t=1 tail.

    Circular caps at both ends; a real top-down car stays wide almost to the
    bumpers, so the taper is short and the corners are round rather than chamfered.
    """
    nose, tail = 0.17, 0.13
    if t < nose:
        k = (nose - t) / nose
        return 0.70 + 0.30 * math.sqrt(max(0.0, 1.0 - k * k))
    if t > 1.0 - tail:
        k = (t - (1.0 - tail)) / tail
        return 0.74 + 0.26 * math.sqrt(max(0.0, 1.0 - k * k))
    return 1.0 - 0.025 * math.sin((t - nose) / (1.0 - nose - tail) * math.pi)


def silhouette(cx, top, bottom, half_w, inset=0.0):
    """Closed polygon of the body outline, optionally inset by `inset` px."""
    pts_r, pts_l = [], []
    steps = 220
    length = bottom - top
    for i in range(steps + 1):
        t = i / steps
        y = top + t * length
        hw = half_w * width_at(t) - inset
        pts_r.append((cx + hw, y))
        pts_l.append((cx - hw, y))
    return pts_r + pts_l[::-1]


def trapezoid(cx, y0, y1, half_top, half_bottom):
    return [
        (cx - half_top, y0), (cx + half_top, y0),
        (cx + half_bottom, y1), (cx - half_bottom, y1),
    ]


def draw_car(body, glass, accent):
    w, h = W * SS, H * SS
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    cx = w / 2
    top, bottom = 8 * SS, 120 * SS
    half_w = 20.5 * SS

    # Contact shadow on its own layer so the blur never softens the body edge.
    shadow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).polygon(
        silhouette(cx + 1.2 * SS, top + 4 * SS, bottom + 4 * SS, half_w),
        fill=(17, 20, 39, 80),
    )
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(radius=2.8 * SS)))

    d = ImageDraw.Draw(img)
    # White keyline: the car must stay legible over the route line and park fills.
    d.polygon(silhouette(cx, top - 1.7 * SS, bottom + 1.7 * SS, half_w + 1.7 * SS), fill=WHITE)
    d.polygon(silhouette(cx, top, bottom, half_w), fill=body)

    # A single canopy — windshield, roof and rear glass as one shape. Three separate
    # panels turn into visual noise once the sprite is 36px tall on the map.
    d.polygon(trapezoid(cx, 31 * SS, 44 * SS, 11.0 * SS, 14.5 * SS), fill=glass)
    d.rounded_rectangle((cx - 14.5 * SS, 42 * SS, cx + 14.5 * SS, 82 * SS),
                        radius=5 * SS, fill=glass)
    d.polygon(trapezoid(cx, 80 * SS, 92 * SS, 14.5 * SS, 11.5 * SS), fill=glass)
    # Brand bar across the roof, the one accent that survives downscaling.
    d.rounded_rectangle((cx - 12 * SS, 56 * SS, cx + 12 * SS, 68 * SS),
                        radius=2.6 * SS, fill=accent)

    # Lights.
    d.rounded_rectangle((cx - 13.5 * SS, 11.5 * SS, cx - 6.5 * SS, 16 * SS), radius=2 * SS, fill=WHITE)
    d.rounded_rectangle((cx + 6.5 * SS, 11.5 * SS, cx + 13.5 * SS, 16 * SS), radius=2 * SS, fill=WHITE)
    d.rounded_rectangle((cx - 12.5 * SS, 112 * SS, cx - 6 * SS, 116 * SS), radius=1.6 * SS, fill=TAIL)
    d.rounded_rectangle((cx + 6 * SS, 112 * SS, cx + 12.5 * SS, 116 * SS), radius=1.6 * SS, fill=TAIL)

    # Mirrors.
    d.rounded_rectangle((cx - half_w - 2.6 * SS, 49 * SS, cx - half_w + 1.2 * SS, 54 * SS),
                        radius=1.4 * SS, fill=body)
    d.rounded_rectangle((cx + half_w - 1.2 * SS, 49 * SS, cx + half_w + 2.6 * SS, 54 * SS),
                        radius=1.4 * SS, fill=body)
    return img


def main():
    out_dir = '/workspace/frontend/assets/images/map'
    for state, (body, glass, accent) in STATES.items():
        big = draw_car(body, glass, accent)
        for scale, suffix in ((1, ''), (2, '@2x'), (3, '@3x')):
            img = big.resize((W * scale, H * scale), Image.LANCZOS)
            img.save(f'{out_dir}/car-nexryde-{state}{suffix}.png', optimize=True)
        print('wrote', state)


if __name__ == '__main__':
    main()
