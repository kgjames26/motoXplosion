"""Build painted backdrops and seamless textures.

Backdrops are cut from the reference paintings (art/source/ref-*.{jpg,png}) and made
seamless by appending a mirrored copy. Textures are generated procedurally (wrap-around
noise and strokes) except the dirt, which starts from a painted dirt patch.

Run:  python3 tools/build_backdrops.py
"""
from __future__ import annotations

import json
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art", "source")
OUT = os.path.join(ROOT, "public", "res")

BACKDROPS = {
    # name: (source, crop box, horizon (fraction of crop height where the far hills end))
    "alps-forest": ("ref-forest.jpg", (290, 215, 1290, 1010), 0.70),
}


def seamless_mirror(im: Image.Image) -> Image.Image:
    w, h = im.size
    out = Image.new("RGB", (w * 2, h))
    out.paste(im, (0, 0))
    out.paste(ImageOps.mirror(im), (w, 0))
    return out


def build_backdrops(meta: dict) -> None:
    for name, (src, box, horizon) in BACKDROPS.items():
        im = Image.open(os.path.join(SRC, src)).convert("RGB").crop(box)
        if im.width < 900:  # bring the smaller painting to a comparable resolution
            k = 1000 / im.width
            im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        tile = seamless_mirror(im)
        tile.save(os.path.join(OUT, f"backdrop-{name}.webp"), "WEBP", quality=86, method=6)
        arr = np.asarray(im).astype(np.float32)
        top = arr[:6].reshape(-1, 3).mean(0)
        bottom = arr[-6:].reshape(-1, 3).mean(0)
        meta[name] = {
            "w": tile.width,
            "h": tile.height,
            "horizon": horizon,
            "skyTop": "#%02x%02x%02x" % tuple(int(v) for v in top),
            "ground": "#%02x%02x%02x" % tuple(int(v) for v in bottom),
        }


# ------------------------------------------------------------------ noise helpers

def periodic_noise(size: int, cells: int, seed: int) -> np.ndarray:
    """Tileable value noise in [0,1] (bicubic upsampling of a periodic random grid)."""
    rng = np.random.default_rng(seed)
    g = rng.random((cells, cells)).astype(np.float32)
    g = np.tile(g, (3, 3))
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((size * 3, size * 3), Image.BICUBIC)
    a = np.asarray(im).astype(np.float32)[size : 2 * size, size : 2 * size] / 255
    return a


def fbm(size: int, seed: int, octaves=(4, 8, 16, 32, 64), weights=(0.5, 0.25, 0.13, 0.07, 0.05)) -> np.ndarray:
    acc = np.zeros((size, size), np.float32)
    for i, (c, w) in enumerate(zip(octaves, weights)):
        acc += periodic_noise(size, c, seed + i * 31) * w
    return acc / sum(weights)


def colorize(n: np.ndarray, stops: list[tuple[float, tuple[int, int, int]]]) -> np.ndarray:
    out = np.zeros(n.shape + (3,), np.float32)
    xs = [s[0] for s in stops]
    for ch in range(3):
        out[..., ch] = np.interp(n, xs, [s[1][ch] for s in stops])
    return out


def wrap_draw(draw_fn, size: int, x: float, y: float, r: float):
    """Draw at (x, y) and at wrapped copies when near an edge."""
    for dx in (-size, 0, size):
        for dy in (-size, 0, size):
            if -r * 2 < x + dx < size + r * 2 and -r * 2 < y + dy < size + r * 2:
                draw_fn(x + dx, y + dy)


# ------------------------------------------------------------------ textures

def tex_dirt(size=512) -> Image.Image:
    n = fbm(size, 11)
    streak = periodic_noise(size, 6, 5)
    # horizontal compaction streaks (tyre packed dirt)
    yy = np.arange(size)[:, None] / size
    bands = 0.5 + 0.5 * np.sin((yy * 9 + n * 1.5) * 2 * math.pi)
    v = np.clip(n * 0.75 + bands * 0.15 + streak * 0.1, 0, 1)
    col = colorize(v, [(0.0, (120, 72, 42)), (0.35, (160, 104, 62)), (0.6, (190, 130, 82)), (1.0, (222, 168, 112))])
    img = Image.fromarray(col.astype(np.uint8), "RGB").convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    rnd = random.Random(3)
    # pebbles with cel highlight + shadow
    for _ in range(260):
        x, y = rnd.uniform(0, size), rnd.uniform(0, size)
        r = rnd.choice([1.5, 2, 2.5, 3, 4, 5, 7]) * rnd.uniform(0.8, 1.2)
        base = rnd.choice([(150, 120, 98), (170, 140, 112), (128, 100, 80), (190, 164, 136)])

        k = rnd.randint(5, 7)
        shape = [(math.cos(2 * math.pi * i / k) * r * 1.3 * rnd.uniform(0.7, 1.1), math.sin(2 * math.pi * i / k) * r * 0.8 * rnd.uniform(0.7, 1.1)) for i in range(k)]

        def peb(px, py, r=r, base=base, shape=shape):
            d.polygon([(px + x + 1, py + y + r * 0.45) for x, y in shape], fill=(70, 40, 20, 80))
            d.polygon([(px + x, py + y) for x, y in shape], fill=base + (255,), outline=(70, 46, 30, 210))
            d.polygon([(px + x * 0.55 - r * 0.25, py + y * 0.5 - r * 0.3) for x, y in shape[: k // 2 + 1]], fill=(226, 206, 178, 140))

        wrap_draw(peb, size, x, y, r)
    # small dark specks / clods
    for _ in range(900):
        x, y = rnd.uniform(0, size), rnd.uniform(0, size)
        r = rnd.uniform(0.6, 1.6)
        c = rnd.choice([(90, 55, 32, 160), (230, 190, 140, 120)])
        wrap_draw(lambda px, py, r=r, c=c: d.ellipse((px - r, py - r * 0.7, px + r, py + r * 0.7), fill=c), size, x, y, r)
    return img.filter(ImageFilter.SMOOTH)


def tex_grass(size=512) -> Image.Image:
    n = fbm(size, 21)
    col = colorize(n, [(0.0, (52, 110, 38)), (0.45, (86, 150, 52)), (0.75, (118, 182, 66)), (1.0, (150, 206, 86))])
    img = Image.fromarray(col.astype(np.uint8), "RGB").convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    rnd = random.Random(7)
    palette = [(44, 96, 34), (64, 128, 44), (98, 168, 60), (132, 196, 76), (170, 220, 100), (196, 232, 120)]
    for i in range(9000):
        x, y = rnd.uniform(0, size), rnd.uniform(0, size)
        L = rnd.uniform(5, 14)
        ang = -math.pi / 2 + rnd.uniform(-0.5, 0.5)
        c = palette[min(len(palette) - 1, int(rnd.random() ** 0.8 * len(palette)))]
        a = rnd.randint(150, 255)

        def blade(px, py, L=L, ang=ang, c=c, a=a):
            d.line((px, py, px + math.cos(ang) * L, py + math.sin(ang) * L), fill=c + (a,), width=2)

        wrap_draw(blade, size, x, y, L)
    # tiny flowers
    for _ in range(70):
        x, y = rnd.uniform(0, size), rnd.uniform(0, size)
        c = rnd.choice([(255, 255, 255), (255, 226, 90), (255, 160, 200), (190, 170, 255)])
        wrap_draw(lambda px, py, c=c: d.ellipse((px - 1.8, py - 1.8, px + 1.8, py + 1.8), fill=c + (255,)), size, x, y, 3)
    return img


def tex_rock(size=512, warm=False) -> Image.Image:
    """Faceted cel-shaded rock: periodic Voronoi cells lit from the upper left."""
    rnd = np.random.default_rng(43 if warm else 41)
    npts = 90
    pts = rnd.random((npts, 2)) * size
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    best = np.full((size, size), 1e9, np.float32)
    second = np.full((size, size), 1e9, np.float32)
    cell = np.zeros((size, size), np.int32)
    for i, (px, py) in enumerate(pts):
        for dx in (-size, 0, size):
            for dy in (-size, 0, size):
                d2 = (xx - px - dx) ** 2 + ((yy - py - dy) * 1.6) ** 2  # flattened: layered rock
                closer = d2 < best
                second = np.where(closer, best, np.minimum(second, d2))
                cell = np.where(closer, i, cell)
                best = np.where(closer, d2, best)
    edge = np.sqrt(second) - np.sqrt(best)
    shade = rnd.random(npts)[cell]
    # facet tilt: brighter towards the upper-left inside each cell
    cx = pts[cell, 0]
    cy = pts[cell, 1]
    tilt = ((cx - xx + size / 2) % size - size / 2) * 0.004 + ((cy - yy + size / 2) % size - size / 2) * 0.006
    n = fbm(size, 47 if warm else 45)
    v = np.clip(0.35 + shade * 0.35 + tilt + (n - 0.5) * 0.3, 0, 1)
    stops = (
        [(0, (110, 56, 36)), (0.4, (176, 96, 60)), (0.7, (214, 134, 86)), (1, (242, 182, 128))]
        if warm
        else [(0, (78, 82, 96)), (0.4, (120, 124, 136)), (0.7, (160, 162, 170)), (1, (206, 208, 214))]
    )
    col = colorize(v, stops)
    dark = np.clip(1 - edge / 3.0, 0, 1)[..., None]
    col = col * (1 - dark * 0.55) + np.array([30, 26, 40]) * dark * 0.55
    return Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


def tex_stone(size=512) -> Image.Image:
    """Masonry blocks for stone bridges and viaducts."""
    base = np.asarray(tex_rock(size)).astype(np.float32)
    img = Image.fromarray(base.astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    rnd = random.Random(12)
    rows = 8
    rh = size / rows
    for r in range(rows):
        y0 = r * rh
        x = -rnd.uniform(0, 60) if r % 2 else 0
        while x < size:
            w = rnd.uniform(70, 120)
            shade = rnd.randint(-22, 22)
            fill = (150 + shade, 140 + shade, 128 + shade, 110)
            d.rectangle((x + 2, y0 + 2, x + w - 2, y0 + rh - 2), fill=fill)
            d.line((x + 3, y0 + 3, x + w - 3, y0 + 3), fill=(230, 226, 216, 150), width=2)
            d.line((x + 3, y0 + rh - 3, x + w - 3, y0 + rh - 3), fill=(50, 44, 50, 150), width=2)
            x += w
        d.line((0, y0, size, y0), fill=(40, 36, 44, 230), width=3)
    # vertical joints wrap: draw a joint at x=0 for continuity
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    meta: dict = {}
    build_backdrops(meta)
    tex_dirt().convert("RGB").save(os.path.join(OUT, "tex-dirt.webp"), "WEBP", quality=88, method=6)
    tex_grass().convert("RGB").save(os.path.join(OUT, "tex-grass.webp"), "WEBP", quality=86, method=6)
    tex_rock().convert("RGB").save(os.path.join(OUT, "tex-rock.webp"), "WEBP", quality=86, method=6)
    tex_rock(warm=True).convert("RGB").save(os.path.join(OUT, "tex-rock-warm.webp"), "WEBP", quality=86, method=6)
    tex_stone().convert("RGB").save(os.path.join(OUT, "tex-stone.webp"), "WEBP", quality=86, method=6)
    with open(os.path.join(OUT, "backdrops.json"), "w") as fh:
        json.dump(meta, fh, indent=1)
    print(json.dumps(meta))


if __name__ == "__main__":
    main()
