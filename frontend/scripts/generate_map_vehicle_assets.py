#!/usr/bin/env python3
"""Generate Nexryde map vehicle PNGs from design tokens (keep under 100KB)."""
from __future__ import annotations

import os
import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TOKENS_FILE = ROOT / "src" / "constants" / "designSystem.ts"
OUT = ROOT / "assets" / "images" / "map"


def read_token(name: str) -> str:
    text = TOKENS_FILE.read_text()
    m = re.search(rf"{name}:\s*'([^']+)'", text)
    if not m:
        raise SystemExit(f"Missing token {name} in designSystem.ts")
    return m.group(1)


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def draw_car(scale: int, accent_hex: str, body_opacity: float = 1.0) -> Image.Image:
    body = hex_rgb(read_token("mapVehicleBody"))
    window = hex_rgb(read_token("mapVehicleWindow"))
    outline_rgb = hex_rgb(read_token("mapVehicleOutline"))
    W, H = 64 * scale, 128 * scale
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = scale
    ba = int(255 * body_opacity)
    accent = hex_rgb(accent_hex)
    aa = int(255 * body_opacity)
    win = (*window, 90)
    outline = (*outline_rgb, 235)

    def rr(box, fill=None, outline_c=None, width=1, radius=None):
        r = radius if radius is not None else max(2, 5 * s)
        d.rounded_rectangle(box, radius=r, fill=fill, outline=outline_c, width=width)

    d.ellipse([14 * s, 112 * s, 50 * s, 122 * s], fill=(0, 0, 0, int(35 * body_opacity)))
    hull = [12 * s, 16 * s, 52 * s, 112 * s]
    outline_w = max(1, round(1.5 * s))
    rr(
        [hull[0] - outline_w, hull[1] - outline_w, hull[2] + outline_w, hull[3] + outline_w],
        fill=outline,
        radius=max(3, 8 * s),
    )
    rr(hull, fill=(*body, ba), radius=max(3, 7 * s))
    rr([18 * s, 34 * s, 46 * s, 70 * s], fill=(*accent, aa), radius=max(2, 4 * s))
    d.rectangle([28 * s, 72 * s, 36 * s, 96 * s], fill=(*accent, int(220 * body_opacity)))
    rr([20 * s, 20 * s, 44 * s, 32 * s], fill=win, radius=max(2, 3 * s))
    rr([22 * s, 98 * s, 42 * s, 108 * s], fill=win, radius=max(2, 3 * s))
    rr(
        [22 * s, 38 * s, 42 * s, 66 * s],
        fill=(*window, 50),
        radius=max(2, 3 * s),
    )
    wheel = (20, 24, 32, ba)
    for y0, y1 in [(26 * s, 40 * s), (86 * s, 100 * s)]:
        rr(
            [7 * s, y0, 15 * s, y1],
            fill=wheel,
            outline_c=(*outline_rgb, 180),
            width=max(1, s // 2),
            radius=max(1, 2 * s),
        )
        rr(
            [49 * s, y0, 57 * s, y1],
            fill=wheel,
            outline_c=(*outline_rgb, 180),
            width=max(1, s // 2),
            radius=max(1, 2 * s),
        )
    d.ellipse([18 * s, 14 * s, 26 * s, 20 * s], fill=(255, 255, 255, int(220 * body_opacity)))
    d.ellipse([38 * s, 14 * s, 46 * s, 20 * s], fill=(255, 255, 255, int(220 * body_opacity)))
    rr(hull, fill=None, outline_c=outline, width=max(1, round(1.25 * s)), radius=max(3, 7 * s))
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    variants = {
        "available": (read_token("mapVehicleAccentAvailable"), 1.0),
        "on_trip": (read_token("mapVehicleAccentOnTrip"), 1.0),
        "offline": (read_token("mapVehicleAccentOffline"), 0.6),
    }
    for name, (accent, opacity) in variants.items():
        for scale, suffix in [(1, ""), (2, "@2x"), (3, "@3x")]:
            img = draw_car(scale, accent, opacity)
            path = OUT / f"car-nexryde-{name}{suffix}.png"
            img.save(path, "PNG", optimize=True)
            size = path.stat().st_size
            assert size < 100_000, (path, size)
            print(f"{path.relative_to(ROOT)} {img.size} {size}B")
    # legacy aliases → available
    for suffix in ["", "@2x", "@3x"]:
        src = OUT / f"car-nexryde-available{suffix}.png"
        dst = OUT / f"car-top{suffix}.png"
        Image.open(src).save(dst, "PNG", optimize=True)
    Image.open(OUT / "car-nexryde-available@2x.png").save(OUT / "car-top.android.png", "PNG", optimize=True)
    print("ok")


if __name__ == "__main__":
    main()
