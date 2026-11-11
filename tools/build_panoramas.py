"""Painted panoramas (v2.19): cut from the painted references, re-framed and re-lit.

Sources: art/source/ref-forest.jpg, ref-meadow.png (same painted sky and mountain range),
splash-clean.png (lake, hills, sunset). Each panorama = a crop window (offset, zoom, mirror)
+ a "grade" (time of day, season, weather) applied to sky and land separately, with a soft
sky mask. Output: public/res/pano/<world>.<n>.webp (1280x512, mirrored at runtime).

Run:  python3 tools/build_panoramas.py
"""
from __future__ import annotations
import colorsys, json, math, os, random
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art", "source")
OUT = os.path.join(ROOT, "public", "res", "pano")
W, H = 1280, 512

def load(name, box):
    return Image.open(os.path.join(SRC, name)).convert("RGB").crop(box)

# landscape sources: (image, horizon fraction = where the far hills meet the lower band)
SOURCES = {
    # forest valley: sky, mountain range, rolling forested hills (no rider, no tall foreground pines)
    "valley": (lambda: load("ref-forest.jpg", (240, 200, 1470, 1290)), 0.74, 470, 650),
    # meadow: same sky and range, open green hills
    "meadow": (lambda: load("ref-meadow.png", (150, 130, 941, 600)), 0.80, 280, 420),
}
SKY = lambda: load("ref-forest.jpg", (0, 200, 1536, 720))  # painted blue sky with clouds

def to_arr(im): return np.asarray(im).astype(np.float32) / 255
def to_img(a): return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))

def source_mask(im, sure_sky, sure_land):
    """Sky mask of a source painting (GrabCut seeded with rows that are surely sky / land)."""
    import cv2
    bgr = cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)
    h, w = bgr.shape[:2]
    m = np.full((h, w), cv2.GC_PR_FGD, np.uint8)
    m[:sure_sky] = cv2.GC_FGD  # foreground = sky here
    m[sure_land:] = cv2.GC_BGD
    a = np.asarray(im).astype(np.float32) / 255
    mid = a[sure_sky:sure_land]
    # in the uncertain band: saturated bright blue / white is probably sky, the rest land
    r, g, b = mid[..., 0], mid[..., 1], mid[..., 2]
    sat = (mid.max(-1) - mid.min(-1)) / (mid.max(-1) + 1e-6)
    prob_sky = ((b > r + 0.15) & (sat > 0.5) & (mid.max(-1) > 0.7)) | (mid.min(-1) > 0.85)
    band = m[sure_sky:sure_land]
    band[~prob_sky] = cv2.GC_PR_BGD
    bg = np.zeros((1, 65)); fg = np.zeros((1, 65))
    cv2.grabCut(bgr, m, None, bg, fg, 6, cv2.GC_INIT_WITH_MASK)
    sky = np.where((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    # keep only sky connected to the top, fill holes in it
    n, lab = cv2.connectedComponents(sky)
    top_labels = set(lab[0][lab[0] > 0].tolist())
    sky = np.isin(lab, list(top_labels)).astype(np.uint8) * 255
    inv = 255 - sky
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_TOP] + st[i, cv2.CC_STAT_HEIGHT] < sure_land - 10 and st[i, cv2.CC_STAT_AREA] < 4000:
            sky[lab == i] = 255  # small land islands up in the sky = clouds
    sky = cv2.GaussianBlur(sky, (0, 0), 1.6)
    return Image.fromarray(sky)

def hsv_shift(a, fn):
    """Apply fn(h, s, v) -> (h, s, v) vectorised via numpy."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(-1); mn = a.min(-1); d = mx - mn + 1e-6
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    s = np.where(mx > 0, d / (mx + 1e-6), 0); v = mx
    h, s, v = fn(h, s, v)
    h = (h % 1) * 6; i = np.floor(h).astype(int) % 6; f = h - np.floor(h)
    p = v * (1 - s); q = v * (1 - s * f); t = v * (1 - s * (1 - f))
    out = np.stack([np.choose(i, [v, q, p, p, t, v]), np.choose(i, [t, v, v, q, p, p]), np.choose(i, [p, p, t, v, v, q])], -1)
    return out

def grade(a, sm, g):
    """g: dict of the look. sky and land graded separately, blended by the sky mask."""
    land = a.copy(); sky = a.copy()
    hh = a.shape[0]
    yy = (np.arange(hh) / hh)[:, None, None]
    if g.get("season") == "autumn":
        def f(h, s, v):
            green = np.exp(-((h - 0.27) / 0.09) ** 2)
            patch = np.sin(np.arange(h.shape[1])[None, :] / 29.0 + np.cos(np.arange(h.shape[0])[:, None] / 17.0) * 2) ** 2
            k = green * (0.45 + 0.55 * patch)
            return h - k * 0.24, np.clip(s * (1 + 0.35 * green), 0, 1), np.clip(v * (1 + 0.1 * k), 0, 1)
        land = hsv_shift(land, f)
    if g.get("season") == "winter":
        lum = land.mean(-1, keepdims=True)
        snow = np.clip((lum - 0.35) * 2.2, 0, 1) * 0.85
        land = land * (1 - snow) + np.array([0.93, 0.95, 1.0]) * snow
        land = land * 0.9 + lum * 0.1
    if g.get("season") == "spring":
        land = hsv_shift(land, lambda h, s, v: (h, np.clip(s * 1.12, 0, 1), np.clip(v * 1.04, 0, 1)))
    # light: multiply land and sky by tints, add a warm/cool gradient
    lt = np.array(g.get("land", (1, 1, 1)), np.float32)
    land = land * lt
    if "sky" in g:
        top, bot = np.array(g["sky"][0], np.float32) / 255, np.array(g["sky"][1], np.float32) / 255
        grad = top * (1 - yy) + bot * yy
        lum = sky.mean(-1, keepdims=True)
        cloud = np.clip((lum - 0.55) * 2.5, 0, 1)
        ccol = np.array(g.get("cloud", (255, 255, 255)), np.float32) / 255
        sky = grad * (1 - cloud) + (ccol * (0.75 + 0.35 * lum)) * cloud
    if "sun" in g:
        sx, sy, col = g["sun"]
        h_, w_ = a.shape[:2]
        X, Y = np.meshgrid(np.arange(w_) / w_, np.arange(h_) / h_)
        d = np.sqrt(((X - sx) * w_ / h_) ** 2 + (Y - sy) ** 2)
        glow = np.exp(-d * 2.6)[..., None] * np.array(col, np.float32) / 255
        sky = 1 - (1 - sky) * (1 - glow * 0.9)
        land = 1 - (1 - land) * (1 - glow * 0.35 * (1 - yy))
        disc = np.clip((0.035 - d) * 200, 0, 1)[..., None]
        sky = sky * (1 - disc) + np.array([1, 0.97, 0.88]) * disc
    if g.get("haze"):
        hz = np.array(g.get("hazeColor", (220, 230, 240)), np.float32) / 255
        k = g["haze"] * np.clip(1 - np.abs(yy - g.get("hazeAt", 0.72)) * 3.2, 0, 1)
        land = land * (1 - k) + hz * k
    out = sky * sm + land * (1 - sm)
    if g.get("contrast"):
        out = (out - 0.5) * g["contrast"] + 0.5
    return out

def frame(src_im, x0, zoom, mirror, horizon, mask=None):
    """Crop a W:H window (wide) from the source; the horizon line is kept at ~0.78 of H."""
    sw, sh = src_im.size
    ch = sh / zoom
    cw = min(sw, ch * W / H)
    ch = cw * H / W
    left = (sw - cw) * x0
    top = max(0, min(sh - ch, horizon * sh - 0.74 * ch))
    box = (int(left), int(top), int(left + cw), int(top + ch))
    im = src_im.crop(box).resize((W, H), Image.LANCZOS)
    mk = mask.crop(box).resize((W, H), Image.BILINEAR) if mask is not None else None
    if mirror:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
        if mk is not None: mk = mk.transpose(Image.FLIP_LEFT_RIGHT)
    return im, mk

LOOKS = {
    "jour": {},
    "matin": {"sky": ((92, 140, 220), (250, 214, 190)), "cloud": (255, 236, 226), "land": (1.02, 0.98, 0.96), "sun": (0.18, 0.62, (255, 210, 170)), "haze": 0.35, "hazeColor": (240, 220, 210)},
    "dore": {"sky": ((60, 120, 210), (255, 224, 160)), "cloud": (255, 240, 205), "land": (1.08, 1.0, 0.86), "sun": (0.82, 0.55, (255, 200, 120)), "haze": 0.2, "hazeColor": (250, 226, 180)},
    "couchant": {"sky": ((60, 50, 130), (255, 150, 90)), "cloud": (255, 170, 140), "land": (0.98, 0.78, 0.7), "sun": (0.7, 0.66, (255, 150, 80)), "haze": 0.3, "hazeColor": (230, 150, 130), "contrast": 1.05},
    "crepuscule": {"sky": ((26, 30, 80), (230, 120, 110)), "cloud": (200, 130, 150), "land": (0.62, 0.6, 0.78), "haze": 0.25, "hazeColor": (150, 120, 170)},
    "gris": {"sky": ((140, 150, 162), (205, 210, 214)), "cloud": (225, 228, 232), "land": (0.86, 0.9, 0.92), "haze": 0.45, "hazeColor": (200, 206, 212), "contrast": 0.92},
    "brume": {"land": (0.98, 1.0, 1.02), "haze": 0.65, "hazeColor": (226, 234, 240), "hazeAt": 0.7},
    "orage": {"sky": ((60, 66, 82), (150, 158, 170)), "cloud": (120, 126, 140), "land": (0.72, 0.78, 0.8), "haze": 0.3, "hazeColor": (130, 140, 150), "contrast": 1.08},
}

def build():
    os.makedirs(OUT, exist_ok=True)
    srcs = {}
    for k, (f, hz, ss, sl) in SOURCES.items():
        im = f()
        mk = source_mask(im, ss, sl)
        mk.save(os.path.join(ROOT, "art", f"mask-{k}.png")) if os.environ.get("PANO_DEBUG") else None
        srcs[k] = (im, hz, mk)
    sky_src = SKY()
    plan = {
        # world: list of (source, look, season)
        "alpes": [("valley", "jour", None), ("meadow", "jour", None), ("valley", "jour", None), ("valley", "dore", None), ("meadow", "couchant", None),
                  ("meadow", "couchant", None), ("valley", "matin", None), ("meadow", "matin", "spring"), ("valley", "jour", "winter"), ("meadow", "gris", "winter"),
                  ("valley", "dore", None), ("valley", "crepuscule", None), ("meadow", "dore", None), ("meadow", "matin", None), ("valley", "orage", None),
                  ("meadow", "jour", "winter"), ("valley", "jour", "winter"), ("valley", "brume", None), ("meadow", "crepuscule", None), ("meadow", "gris", None)],
        "foret": [("valley", "jour", "spring"), ("valley", "jour", "autumn"), ("valley", "jour", "autumn"), ("meadow", "dore", "autumn"), ("valley", "brume", None),
                  ("meadow", "brume", None), ("valley", "matin", "autumn"), ("meadow", "jour", "spring"), ("valley", "couchant", "autumn"), ("valley", "dore", "spring"),
                  ("valley", "gris", None), ("meadow", "brume", "autumn"), ("meadow", "couchant", "autumn"), ("valley", "dore", None), ("meadow", "orage", None),
                  ("valley", "crepuscule", "autumn"), ("valley", "matin", "spring"), ("meadow", "matin", None), ("valley", "jour", None), ("meadow", "orage", "autumn")],
    }
    meta = {}
    for world, items in plan.items():
        rnd = random.Random(world)
        for i, (src, look, season) in enumerate(items):
            im, hz, mk = srcs[src]
            x0 = rnd.uniform(0, 1); zoom = rnd.uniform(1.0, 1.12); mirror = rnd.random() < 0.5
            fr, fm = frame(im, x0, zoom, mirror, hz, mk)
            a = to_arr(fr)
            sm = np.asarray(fm).astype(np.float32)[..., None] / 255
            # the poster's band has little sky: paint the painted sky in behind it
            if src == "lake":
                s = to_arr(sky_src.resize((W, int(H * 0.7)), Image.LANCZOS))
                if mirror: s = s[:, ::-1]
                full = np.ones_like(a) * s[-1:, :, :]
                full[: s.shape[0]] = s
                a = full * sm + a * (1 - sm)
            g = dict(LOOKS[look]); g["season"] = season
            out = grade(a, sm, g)
            name = f"{world}.{i}"
            to_img(out).save(os.path.join(OUT, name + ".webp"), "WEBP", quality=82, method=6)
            top = out[:6].reshape(-1, 3).mean(0); bot = out[-6:].reshape(-1, 3).mean(0)
            meta[name] = {"look": look, "season": season or "", "src": src, "skyTop": "#%02x%02x%02x" % tuple(int(v * 255) for v in np.clip(top, 0, 1)), "ground": "#%02x%02x%02x" % tuple(int(v * 255) for v in np.clip(bot, 0, 1)), "horizon": 0.7}
    # painted skies alone (for the worlds painted procedurally: canyon, desert, San Francisco)
    sky = sky_src.resize((W, int(W * sky_src.height / sky_src.width)), Image.LANCZOS)
    sa = to_arr(sky)
    ones = np.ones(sa.shape[:2] + (1,), np.float32)
    LOOKS["chaud"] = {"sky": ((70, 140, 225), (255, 238, 205)), "cloud": (255, 248, 236), "sun": (0.75, 0.75, (255, 236, 190))}
    for look in ("jour", "matin", "dore", "couchant", "crepuscule", "gris", "orage", "chaud"):
        g = dict(LOOKS[look]); g.pop("haze", None)
        to_img(grade(sa, ones, g)).save(os.path.join(OUT, f"sky-{look}.webp"), "WEBP", quality=80, method=6)
    json.dump(meta, open(os.path.join(OUT, "index.json"), "w"), indent=1)
    print(len(meta), "panoramas")

if __name__ == "__main__":
    build()
