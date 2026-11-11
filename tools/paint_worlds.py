"""Invented painted panoramas (v2.20): canyons, deserts, bay cities, glaciers, forests.

Painted offline with numpy/PIL in the style of the reference paintings: painted skies (from
the references, re-lit), layered relief with light and shadow faces facing the sun, snow
caps, rock strata, dunes with a lit and a shaded side, forests drawn tree by tree, water
with reflections, cities with lit windows, mist between the layers (atmospheric perspective)
and a thin ink line on the near ridges. Rendered at 2x then downsampled.

Run:  python3 tools/paint_worlds.py            (all)   |   python3 tools/paint_worlds.py canyon.3
"""
from __future__ import annotations
import json, math, os, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art", "source")
OUT = os.path.join(ROOT, "public", "res", "pano")
OW, OH = 1280, 512
SS = 2
W, H = OW * SS, OH * SS

# ------------------------------------------------------------------ helpers
def hexc(h):
    h = h.lstrip("#"); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255

def lerp(a, b, t): return a + (b - a) * t
def norm(a): return (a - a.mean()) / (a.std() + 1e-6)
def smooth(t): t = np.clip(t, 0, 1); return t * t * (3 - 2 * t)

class Noise:
    def __init__(self, seed): self.rng = np.random.default_rng(seed)
    def n1(self, n, cells, seed_off=0):
        """1D value noise on n samples, `cells` lattice cells, smooth (cosine)."""
        g = self.rng.random(cells + 3)
        x = np.linspace(0, cells, n, endpoint=False)
        i = np.floor(x).astype(int); f = x - i
        f = (1 - np.cos(f * np.pi)) / 2
        return g[i] * (1 - f) + g[i + 1] * f
    def fbm1(self, n, cells, oct=5, gain=0.5):
        acc = np.zeros(n); amp = 1; tot = 0
        for o in range(oct):
            acc += self.n1(n, cells * 2 ** o) * amp; tot += amp; amp *= gain
        return acc / tot
    def n2(self, h, w, cy, cx):
        g = self.rng.random((cy + 2, cx + 2)).astype(np.float32)
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((int(w * (cx + 2) / cx), int(h * (cy + 2) / cy)), Image.BICUBIC)
        return np.asarray(im).astype(np.float32)[:h, :w] / 255
    def fbm2(self, h, w, cy, cx, oct=4, gain=0.5):
        acc = np.zeros((h, w), np.float32); amp = 1; tot = 0
        for o in range(oct):
            acc += self.n2(h, w, cy * 2 ** o, cx * 2 ** o) * amp; tot += amp; amp *= gain
        return acc / tot

# ------------------------------------------------------------------ painted skies
_SKY = None
def sky_src():
    global _SKY
    if _SKY is None:
        _SKY = Image.open(os.path.join(SRC, "ref-forest.jpg")).convert("RGB").crop((0, 200, 1536, 720))
    return _SKY

def paint_sky(look, sun, rng, mirror):
    """Painted clouds from the reference, re-lit: look = (top, bottom, cloud tint, cloud amount)."""
    top, bot, ctint, camount = look
    sk = sky_src()
    sh = int(H * 0.82)
    sw = int(sk.width * sh / sk.height)
    im = sk.resize((sw, sh), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255
    x0 = rng.randint(0, max(0, sw - W)) if sw > W else 0
    a = a[:, x0:x0 + W] if sw >= W else np.concatenate([a, a[:, ::-1]], 1)[:, :W]
    if mirror: a = a[:, ::-1]
    full = np.zeros((H, W, 3), np.float32)
    full[:sh] = a
    full[sh:] = a[-1]
    lum = full.mean(-1, keepdims=True)
    cloud = smooth((lum - 0.58) * 2.6) * camount
    yy = (np.arange(H) / H)[:, None, None]
    grad = lerp(hexc(top), hexc(bot), smooth(yy / 0.75))
    out = grad * (1 - cloud) + hexc(ctint) * (0.72 + 0.4 * lum) * cloud
    if sun:
        sx, sy, col, power = sun
        X, Y = np.meshgrid(np.arange(W) / W, np.arange(H) / H)
        d = np.sqrt(((X - sx) * W / H) ** 2 + (Y - sy) ** 2)[..., None]
        glow = np.exp(-d * 2.2) * hexc(col) * power
        out = 1 - (1 - out) * (1 - glow)
        disc = smooth((0.045 - d) * 120)
        out = out * (1 - disc) + hexc("#fff8e6") * disc
    return out

# ------------------------------------------------------------------ painting context
class Canvas:
    def __init__(self, sky, seed, sun_x, light, haze_col):
        self.a = sky.copy()
        self.N = Noise(seed)
        self.rng = random.Random(seed)
        self.sun_x = sun_x  # 0..1, light comes from this side
        self.light = hexc(light)  # colour of the sunlight
        self.haze = hexc(haze_col)
        self.depth_layers = []

    def blend(self, mask, col):
        m = mask[..., None]
        self.a = self.a * (1 - m) + col * m

    def mist(self, y, thick, alpha):
        y -= LIFT
        yy = np.arange(H)[:, None, None] / H
        k = np.exp(-((yy - y) / thick) ** 2) * alpha
        noise = self.N.fbm2(H, W, 3, 12, 3)[..., None]
        k = k * (0.6 + 0.8 * noise)
        self.a = self.a * (1 - k) + self.haze * k

    # ---------------- relief layer
    def relief(self, ridge, base_col, depth, kind="hills", snow=0.0, outline=True, rock=0.5, strata=None, tex=1.0):
        """ridge: array W of top y (pixels). depth 0 (far) .. 1 (near)."""
        yy = np.arange(H)[:, None]
        inside = smooth((yy - ridge[None, :]) / 1.5 + 0.5)
        if inside.max() <= 0: return
        # pseudo surface: height field under the ridge for faceted shading
        h_ = H; w_ = W
        if kind == "peaks":
            f = self.N.fbm2(h_, w_, 4, 22, 5)
            f = 1 - np.abs(f - 0.5) * 2  # ridged
        elif kind == "mesa":
            f = self.N.fbm2(h_, w_, 2, 60, 3) * 0.6 + self.N.fbm2(h_, w_, 1, 200, 2) * 0.4
        elif kind == "dunes":
            f = self.N.fbm2(h_, w_, 2, 8, 3)
        else:
            f = self.N.fbm2(h_, w_, 4, 14, 4)
        gx = np.gradient(f, axis=1) * W / 30
        gy = np.gradient(f, axis=0) * H / 30
        # light from the sun side, a bit from above
        lx = -1 if self.sun_x < 0.5 else 1
        lam = np.clip(0.55 + (-gx * lx * 0.9 + -gy * 0.5) * (1.4 if kind == "peaks" else 0.8), 0, 1)
        # slope of the ridge itself: faces turned to the sun are lit
        dr = np.gradient(ridge)
        face = np.clip(0.5 - dr * lx * 0.06, 0, 1)
        face = np.convolve(face, np.ones(31) / 31, mode="same")
        dist = np.clip((yy - ridge[None, :]) / (H * 0.25), 0, 1)
        shade = lam * (0.55 + 0.45 * (1 - dist)) * 0.7 + face[None, :] * 0.3 * (1 - dist * 0.6)
        if kind in ("peaks",):
            shade = np.round(shade * 4) / 4 * 0.6 + shade * 0.4  # cel facets
        col = hexc(base_col)
        dark = col * np.array([0.55, 0.55, 0.72])  # cool shadow
        lit = 1 - (1 - col) * (1 - self.light * 0.45)
        c = dark[None, None] * (1 - shade[..., None]) + lit[None, None] * shade[..., None]
        if strata is not None:
            band_h, pal = strata
            wob = self.N.fbm1(W, 6)[None, :] * band_h * 1.6
            idx = ((yy + wob + f * band_h * 0.8) / band_h).astype(int) % len(pal)
            pc = np.stack([hexc(p) for p in pal])[idx]
            c = c * 0.55 + pc * 0.45 * (0.6 + 0.6 * shade[..., None])
            # vertical erosion grooves
            gro = self.N.n1(W, 140)[None, :]
            c *= (0.88 + 0.2 * gro[..., None])
        if tex:
            t = self.N.fbm2(H, W, 30, 120, 2)
            c *= (0.92 + 0.16 * t[..., None] * tex)
        if snow > 0:
            alt = 1 - np.clip((yy - ridge.min()) / (H * 0.32), 0, 1)
            flat = np.clip(1 - np.abs(gx) * 1.2, 0, 1)
            s = smooth((alt * snow * 1.6 + f * 0.5 - 0.75) * 3.5) * (0.4 + 0.6 * flat)
            scol = lerp(np.array([0.72, 0.78, 0.92]), 1 - (1 - np.array([0.98, 0.98, 1.0])) * (1 - self.light * 0.3), shade[..., None])
            c = c * (1 - s[..., None]) + scol * s[..., None]
        # rim light along the ridge
        rim = np.exp(-np.clip(yy - ridge[None, :], 0, None) / (3 * SS)) * face[None, :] * 0.5
        c = 1 - (1 - c) * (1 - self.light * rim[..., None])
        # atmospheric perspective
        hz = (1 - depth) ** 1.6 * 0.75
        c = c * (1 - hz) + self.haze * hz
        self.blend(inside, c)
        if outline and depth > 0.45:
            ink = np.exp(-((yy - ridge[None, :]) / (0.9 * SS)) ** 2) * (depth - 0.35) * 0.8
            self.blend(ink, hexc("#1d2433") * 0.6 + self.haze * 0.15)

    # ---------------- trees
    def forest(self, ridge, depth, density, kind="pine", col="#2f6b3a", y_band=(0, 1)):
        img = Image.fromarray((np.clip(self.a, 0, 1) * 255).astype(np.uint8)).convert("RGBA")
        d = ImageDraw.Draw(img, "RGBA")
        base = hexc(col)
        hz = (1 - depth) ** 1.6 * 0.75
        lx = -1 if self.sun_x < 0.5 else 1
        size = (4 + depth * 26) * SS
        n = int(W / size * density * 3)
        pts = []
        for _ in range(n):
            x = self.rng.uniform(0, W)
            xi = int(min(W - 1, max(0, x)))
            y0 = ridge[xi]
            y = y0 + self.rng.uniform(y_band[0], y_band[1]) * size * 3
            if y > H: continue
            pts.append((y, x))
        pts.sort()
        for y, x in pts:
            s = size * self.rng.uniform(0.7, 1.3)
            v = self.rng.uniform(0.85, 1.15)
            c0 = np.clip(base * v, 0, 1)
            cd = c0 * np.array([0.55, 0.6, 0.72]); cl = 1 - (1 - c0) * (1 - self.light * 0.35)
            cd = cd * (1 - hz) + self.haze * hz; cl = cl * (1 - hz) + self.haze * hz
            to = lambda c: tuple(int(v * 255) for v in np.clip(c, 0, 1)) + (255,)
            if kind == "pine":
                hgt = s * 2.4
                for k in range(3):
                    ty = y - hgt + k * hgt * 0.28
                    wd = s * (0.45 + k * 0.28)
                    by = ty + hgt * 0.42
                    d.polygon([(x, ty), (x - wd, by), (x + wd, by)], fill=to(cd))
                    if lx < 0: d.polygon([(x, ty), (x - wd, by), (x - wd * 0.1, by)], fill=to(cl))
                    else: d.polygon([(x, ty), (x + wd * 0.1, by), (x + wd, by)], fill=to(cl))
                d.rectangle((x - s * 0.08, y - s * 0.25, x + s * 0.08, y), fill=to(cd * 0.7))
            elif kind == "round":
                r = s * 0.9
                d.ellipse((x - r, y - r * 2.1, x + r, y - r * 0.2), fill=to(cd))
                d.ellipse((x - r * 0.75 + lx * r * 0.2, y - r * 2.0, x + r * 0.55 + lx * r * 0.2, y - r * 0.8), fill=to(cl))
            elif kind == "palm":
                hgt = s * 3.2
                lean = self.rng.uniform(-0.3, 0.3) * s
                d.line((x, y, x + lean, y - hgt), fill=to(cd * 0.8), width=max(2, int(s * 0.18)))
                tx, ty = x + lean, y - hgt
                for a in range(7):
                    ang = math.pi * (0.1 + a / 6 * 0.8)
                    ex, ey = tx + math.cos(ang) * s * 1.6 * (1 if a % 2 else -1) * (0.6 + 0.4 * (a / 6)), ty + math.sin(ang) * s * 0.6
                    d.line((tx, ty, ex, ey), fill=to(cl if a % 2 == (lx > 0) else cd), width=max(2, int(s * 0.22)))
            elif kind == "cactus":
                hgt = s * 2.2
                w2 = s * 0.18
                d.rounded_rectangle((x - w2, y - hgt, x + w2, y), radius=w2, fill=to(cd))
                for side in (-1, 1):
                    if self.rng.random() < 0.7:
                        ay = y - hgt * self.rng.uniform(0.35, 0.6)
                        xa, xb = sorted((x + side * w2, x + side * s * 0.6))
                        d.rounded_rectangle((xa, ay - w2 * 0.8, xb, ay + w2 * 0.8), radius=w2 * 0.8, fill=to(cd))
                        d.rounded_rectangle((x + side * s * 0.6 - w2 * 0.9, ay - hgt * 0.35, x + side * s * 0.6 + w2 * 0.9, ay + w2 * 0.8), radius=w2 * 0.9, fill=to(cd))
                d.rounded_rectangle((x - w2 * (1 if lx < 0 else -0.2), y - hgt, x + w2 * (0.2 if lx < 0 else 1), y), radius=w2, fill=to(cl))
        self.a = np.asarray(img.convert("RGB")).astype(np.float32) / 255

    # ---------------- water
    def water(self, y, col, depth, reflect=True, sparkle=0.6):
        y -= LIFT * H
        yi = int(y)
        if yi >= H: return
        src = self.a[max(0, 2 * yi - H):yi][::-1]
        n = H - yi
        refl = np.zeros((n, W, 3), np.float32)
        m = min(n, src.shape[0])
        if reflect and m > 0:
            wob = (self.N.n2(m, W, 30, 6) - 0.5) * 18 * SS
            xs = np.clip(np.arange(W)[None, :] + wob.astype(int), 0, W - 1)
            refl[:m] = src[np.arange(m)[:, None], xs]
        base = hexc(col)
        t = np.linspace(0, 1, n)[:, None, None]
        wcol = lerp(base * 1.15, base * 0.7, t)
        k = 0.55 if reflect else 0
        c = refl * k + wcol * (1 - k)
        c[m:] = wcol[m:]
        lines = self.N.n2(n, W, n // (4 * SS) + 2, 40)
        c *= (0.9 + 0.18 * lines[..., None])
        if sparkle:
            sp = (self.N.n2(n, W, n // (2 * SS) + 2, 300) > 0.86) * np.exp(-np.abs(np.arange(W)[None, :] / W - self.sun_x) * 4) * sparkle
            c = 1 - (1 - c) * (1 - sp[..., None] * self.light)
        hz = (1 - depth) ** 1.6 * 0.6
        c = c * (1 - hz) + self.haze * hz
        self.a[yi:] = c
        # shore line
        self.a[yi:yi + SS] = self.a[yi:yi + SS] * 0.6 + 0.4

    # ---------------- city
    def city(self, base_y, depth, hmax, col, lights=0.0, style="mixed", density=1.0):
        img = Image.fromarray((np.clip(self.a, 0, 1) * 255).astype(np.uint8)).convert("RGBA")
        d = ImageDraw.Draw(img, "RGBA")
        hz = (1 - depth) ** 1.6 * 0.7
        lx = -1 if self.sun_x < 0.5 else 1
        x = -10
        base = hexc(col)
        to = lambda c, a=255: tuple(int(v * 255) for v in np.clip(c, 0, 1)) + (a,)
        while x < W:
            bw = self.rng.uniform(14, 46) * SS * (0.5 + depth)
            tall = self.rng.random() ** 2.2
            bh = (0.15 + tall * 0.85) * hmax * self.rng.uniform(0.7, 1.1)
            v = self.rng.uniform(0.82, 1.18)
            c0 = np.clip(base * v, 0, 1)
            cl = 1 - (1 - c0) * (1 - self.light * 0.4); cd = c0 * np.array([0.6, 0.62, 0.75])
            cl = cl * (1 - hz) + self.haze * hz; cd = cd * (1 - hz) + self.haze * hz
            top = base_y - bh
            d.rectangle((x, top, x + bw, base_y + 40 * SS), fill=to(cd))
            side = bw * 0.3
            if lx < 0: d.rectangle((x, top, x + bw - side, base_y + 40 * SS), fill=to(cl))
            else: d.rectangle((x + side, top, x + bw, base_y + 40 * SS), fill=to(cl))
            if tall > 0.6 and self.rng.random() < 0.5:
                d.polygon([(x + bw * 0.2, top), (x + bw * 0.5, top - bh * 0.12), (x + bw * 0.8, top)], fill=to(cd))
            if tall > 0.85 and self.rng.random() < 0.6:
                d.line((x + bw / 2, top - bh * 0.12, x + bw / 2, top - bh * 0.25), fill=to(cd), width=SS)
            # windows
            wy = top + 4 * SS
            ww = max(SS, int(2.2 * SS * (0.5 + depth)))
            while wy < base_y - 2 * SS and depth > 0.25:
                wx = x + 3 * SS
                while wx < x + bw - 3 * SS:
                    if lights > 0 and self.rng.random() < lights:
                        d.rectangle((wx, wy, wx + ww, wy + ww * 1.3), fill=to(np.array([1.0, 0.85, 0.5]) * (1 - hz * 0.6) + self.haze * hz * 0.6, 230))
                    elif self.rng.random() < 0.5:
                        d.rectangle((wx, wy, wx + ww, wy + ww * 1.3), fill=to(cd * 0.82, 160))
                    wx += ww * 2.2
                wy += ww * 2.6
            x += bw + self.rng.uniform(0, 6) * SS / density
        self.a = np.asarray(img.convert("RGB")).astype(np.float32) / 255

    def bridge(self, deck_y, x0, x1, tower_h, col, depth):
        deck_y -= LIFT * H; tower_h *= 1.2
        img = Image.fromarray((np.clip(self.a, 0, 1) * 255).astype(np.uint8)).convert("RGBA")
        d = ImageDraw.Draw(img, "RGBA")
        hz = (1 - depth) ** 1.6 * 0.6
        c = hexc(col) * (1 - hz) + self.haze * hz
        to = lambda c: tuple(int(v * 255) for v in np.clip(c, 0, 1)) + (255,)
        span = x1 - x0
        t1, t2 = x0 + span * 0.18, x1 - span * 0.18
        tw = max(3, span * 0.012)
        for tx in (t1, t2):
            d.rectangle((tx - tw, deck_y - tower_h, tx + tw, deck_y + tower_h * 0.25), fill=to(c))
            for k in range(3):
                yb = deck_y - tower_h * (0.35 + k * 0.25)
                d.rectangle((tx - tw * 2.2, yb, tx + tw * 2.2, yb + tw * 0.8), fill=to(c))
        d.rectangle((x0, deck_y, x1, deck_y + tw * 1.4), fill=to(c * 0.85))
        def cable(a, b, sag, top_a, top_b):
            pts = []
            for i in range(41):
                t = i / 40
                x = a + (b - a) * t
                y = top_a + (top_b - top_a) * t + sag * (4 * t * (1 - t))
                pts.append((x, y))
            d.line(pts, fill=to(c), width=max(2, int(tw * 0.5)))
            for i in range(1, 40, 2):
                d.line((pts[i][0], pts[i][1], pts[i][0], deck_y), fill=to(c * 0.9), width=1)
        top = deck_y - tower_h
        cable(t1, t2, tower_h * 0.85, top, top)
        cable(x0, t1, tower_h * 0.6, deck_y - tower_h * 0.1, top)
        cable(t2, x1, tower_h * 0.6, top, deck_y - tower_h * 0.1)
        self.a = np.asarray(img.convert("RGB")).astype(np.float32) / 255

    def finish(self, grade=None):
        a = np.clip(self.a, 0, 1)
        if grade: a = np.clip((a - 0.5) * grade + 0.5, 0, 1)
        im = Image.fromarray((a * 255).astype(np.uint8)).resize((OW, OH), Image.LANCZOS)
        return im.filter(ImageFilter.UnsharpMask(1.2, 40, 2))

# ------------------------------------------------------------------ ridge shapes
def ridge_peaks(N, base, amp, cells=5, sharp=1.0):
    r = N.fbm1(W, cells, 6, 0.55)
    r = 1 - np.abs(r - 0.5) * 2 * sharp
    return base * H - (r - r.min()) / (np.ptp(r) + 1e-6) * amp * H

def ridge_hills(N, base, amp, cells=3):
    r = N.fbm1(W, cells, 4, 0.45)
    return base * H - (r - r.min()) / (np.ptp(r) + 1e-6) * amp * H

def ridge_mesa(N, base, amp, n_mesas=4, rng=None):
    x = np.arange(W) / W
    y = np.zeros(W)
    for _ in range(n_mesas):
        c = rng.uniform(0, 1); w = rng.uniform(0.06, 0.22); h = rng.uniform(0.4, 1.0)
        steep = rng.uniform(60, 140)
        prof = 1 / (1 + np.exp(-(x - (c - w)) * steep)) - 1 / (1 + np.exp(-(x - (c + w)) * steep))
        # a step half-way down some sides
        prof = np.maximum(prof * h, (1 / (1 + np.exp(-(x - (c - w * 1.4)) * steep * 0.7)) - 1 / (1 + np.exp(-(x - (c + w * 1.4)) * steep * 0.7))) * h * rng.uniform(0.3, 0.55))
        y = np.maximum(y, prof)
    y += N.fbm1(W, 40, 3) * 0.04
    return base * H - y * amp * H

def ridge_dunes(N, base, amp, n=5, rng=None):
    x = np.arange(W) / W
    y = np.zeros(W)
    for k in range(n):
        c = rng.uniform(-0.1, 1.1); w = rng.uniform(0.12, 0.3); h = rng.uniform(0.4, 1.0)
        u = (x - c) / w
        prof = np.where(u < 0, np.exp(-u * u * 1.2), np.exp(-u * u * 6))  # long windward, steep lee
        y = np.maximum(y, prof * h)
    return base * H - y * amp * H

def ridge_city_hills(N, base, amp): return ridge_hills(N, base, amp, 2)


# ------------------------------------------------------------------ v2 primitives
# the game hides the lower 30 % behind its hills: lift the whole landscape and make it taller
LIFT, HG = 0.1, 1.4

YY = np.arange(H, dtype=np.float32)[:, None]
XX = np.arange(W, dtype=np.float32)[None, :]

def haze_of(c, depth): return (1 - depth) ** 1.5 * 0.78

def lay(c, ridge, col, depth, outline=0.0, soft=1.2):
    """Blend a colour field `col` (HxWx3) under `ridge`, with atmospheric perspective."""
    inside = smooth((YY - ridge[None, :]) / soft + 0.5)
    hz = haze_of(c, depth)
    col = col * (1 - hz) + c.haze * hz
    c.blend(inside, col)
    if outline > 0:
        ink = np.exp(-((YY - ridge[None, :]) / (0.8 * SS)) ** 2) * outline
        c.blend(ink, hexc("#1a2030") * 0.7 + c.haze * 0.3 * (1 - depth))

def lit_dark(c, col, k_shadow=(0.5, 0.52, 0.7)):
    base = hexc(col) if isinstance(col, str) else col
    lit = 1 - (1 - base) * (1 - c.light * 0.5)
    dark = base * np.array(k_shadow, np.float32)
    return lit, dark

def mountains(c, base_y, height, n, col, depth, snow=0.55, outline=0.0, seed_shift=0):
    """A range of pyramid peaks: lit face / shadow face split on the crest, gullies running
    down from the summits, jagged snow line, rim light."""
    base_y -= LIFT; height *= HG
    r = c.rng; N = c.N
    peaks = []
    for k in range(n):
        px = (k + r.uniform(0.1, 0.9)) / n * W * 1.1 - W * 0.05
        ph = height * H * r.uniform(0.55, 1.0)
        sl = r.uniform(0.75, 1.5); sr = r.uniform(0.75, 1.5)  # slopes left / right (y per x)
        peaks.append((px, base_y * H - ph, sl, sr))
    prof = np.full(W, 1e9)
    owner = np.zeros(W, int)
    xs = np.arange(W)
    for k, (px, py, sl, sr) in enumerate(peaks):
        y = np.where(xs < px, py + (px - xs) * sl * 0.55, py + (xs - px) * sr * 0.55)
        better = y < prof
        prof = np.where(better, y, prof); owner = np.where(better, k, owner)
    detail = norm(N.fbm1(W, 14, 5, 0.6)) * 0.022 * H * height / 0.3 + norm(N.fbm1(W, 90, 3)) * 0.006 * H + norm(N.fbm1(W, 400, 2)) * 0.0015 * H
    ridge = np.minimum(prof + detail, base_y * H + 0.08 * H)
    lit, dark = lit_dark(c, col)
    sunleft = c.sun_x < 0.5
    pk = np.array(peaks)
    px = pk[owner, 0][None, :]; py = pk[owner, 1][None, :]
    left = XX < px
    face_lit = left if sunleft else ~left
    dy = np.maximum(YY - py, 1)
    ang = (XX - px) / dy  # constant along lines from the summit
    gul = np.clip(norm(N.fbm1(4096, 70, 3)) * 0.3 + 0.5, 0, 1)
    gidx = np.clip(((ang + 3) / 6 * 4095).astype(int), 0, 4095)
    gully = gul[gidx]
    t = smooth((gully - 0.35) * 3)
    shade = np.where(face_lit, 0.62 + 0.38 * t, 0.1 + 0.32 * t)
    # crest blend so the split follows the ridge, softly
    shade = shade * (1 - np.exp(-np.abs(XX - px) / (3 * SS)) * 0.3)
    low = np.clip((YY - ridge[None, :]) / (H * 0.3), 0, 1)
    shade = shade * (1 - low * 0.35)
    colf = dark[None, None] * (1 - shade[..., None]) + lit[None, None] * shade[..., None]
    if snow > 0:
        hgt = (base_y * H - py)
        line = py + hgt * snow * (0.55 + 0.45 * N.n2(1, W, 1, 90)[0][None, :]) + (gully - 0.5) * hgt * 0.7
        sm = smooth((line - YY) / (1.5 * SS))
        slit, sdark = lit_dark(c, np.array([0.97, 0.98, 1.0], np.float32), (0.66, 0.74, 0.92))
        scol = sdark[None, None] * (1 - shade[..., None]) + slit[None, None] * shade[..., None]
        colf = colf * (1 - sm[..., None]) + scol * sm[..., None]
    rim = np.exp(-np.clip(YY - ridge[None, :], 0, None) / (2.5 * SS)) * np.where(face_lit, 0.6, 0.15)
    colf = 1 - (1 - colf) * (1 - c.light[None, None] * rim[..., None])
    lay(c, ridge, colf, depth, outline)
    return ridge

def mesas(c, base_y, height, n, pal, depth, outline=0.0):
    """Canyon buttes: cap rock, vertical cliff with horizontal strata, talus skirt; shadow side."""
    base_y -= LIFT; height *= HG
    r = c.rng; N = c.N
    ridge = np.full(W, base_y * H + 0.02 * H)
    xs = np.arange(W)
    owner_l = np.zeros(W); owner_r = np.zeros(W); top_y = np.full(W, 1e9)
    for _ in range(n):
        cx = r.uniform(-0.05, 1.05) * W; hw = r.uniform(0.05, 0.16) * W
        ty = base_y * H - height * H * r.uniform(0.5, 1)
        talus = r.uniform(0.04, 0.09) * W
        cliff_y = ty + (base_y * H - ty) * r.uniform(0.45, 0.7)
        d = np.abs(xs - cx) + norm(N.fbm1(W, 40, 3)) * hw * 0.06
        # tiers: cap, a ledge part-way down, then the talus skirt
        ledge_y = ty + (cliff_y - ty) * r.uniform(0.35, 0.6)
        lw = hw * r.uniform(0.1, 0.25)
        y = np.where(d < hw, ty, np.where(d < hw + 2 * SS, ty + (d - hw) / (2 * SS) * (ledge_y - ty),
            np.where(d < hw + lw, ledge_y, np.where(d < hw + lw + 2 * SS, ledge_y + (d - hw - lw) / (2 * SS) * (cliff_y - ledge_y),
            cliff_y + (d - hw - lw - 2 * SS) / talus * (base_y * H - cliff_y)))))
        y = np.minimum(y, base_y * H + 0.02 * H)
        y += norm(N.fbm1(W, 120, 3)) * 0.0025 * H
        better = y < ridge
        ridge = np.where(better, y, ridge)
        owner_l = np.where(better, cx - hw, owner_l); owner_r = np.where(better, cx + hw, owner_r)
        top_y = np.where(better, ty, top_y)
    # strata: horizontal bands with gentle wobble
    band = 5 * SS * (0.6 + depth)
    wob = (N.fbm2(H, W, 3, 20, 3) - 0.5) * band * 1.5
    bi = np.floor((YY + wob) / band).astype(int)
    hsh = (np.sin(bi * 12.9898 + 3.1) * 43758.5453) % 1
    P = np.stack([hexc(p) for p in pal])
    # mostly the main rock colour, the other strata now and then (calm, readable layers)
    idx = np.where(hsh < 0.55, 0, 1 + (hsh * 97).astype(int) % (len(pal) - 1))
    base = P[idx]
    lit, dark = lit_dark(c, base, (0.55, 0.45, 0.55))
    sunleft = c.sun_x < 0.5
    mid = (owner_l + owner_r)[None, :] / 2
    halfw = np.maximum((owner_r - owner_l)[None, :] / 2, 1)
    u = (XX - mid) / halfw  # -1..1 across the butte
    side = -u if sunleft else u
    shade = np.clip(0.62 + side * 0.32, 0, 1)
    # the shadow side beyond the cliff edge, and soft vertical erosion
    shade = np.where(np.abs(u) > 1, np.where(side > 0, 0.72, 0.38), shade)
    ero = np.clip(norm(N.fbm1(W, 45, 3)) * 0.35 + 0.5, 0, 1)[None, :]
    shade = np.clip(shade * np.where(np.abs(u) <= 1, 0.86 + 0.24 * ero, 1.0), 0, 1)
    colf = dark * (1 - shade[..., None]) + lit * shade[..., None]
    # cap rock: darker band right under the top, with a lit edge
    cap = smooth((top_y[None, :] + 4 * SS * (0.5 + depth) - YY) / SS) * (YY >= ridge[None, :] - 1)
    colf = colf * (1 - cap[..., None] * 0.35)
    rim = np.exp(-np.clip(YY - ridge[None, :], 0, None) / (2 * SS)) * 0.55
    colf = 1 - (1 - colf) * (1 - c.light[None, None] * rim[..., None])
    # talus texture: speckled scree below the cliffs
    scr = (N.n2(H, W, H // (3 * SS), W // (3 * SS)) > 0.7) * 0.12
    colf = colf * (1 - scr[..., None])
    lay(c, ridge, colf, depth, outline)
    return ridge

def dunes(c, base_y, height, n, col, depth, outline=0.0):
    """Dunes: long windward slope and a steep slip face; the crest is a sharp line, the slip
    face in shadow (or in light, depending on the sun side), wind ripples on the slopes."""
    base_y -= LIFT; height *= HG
    r = c.rng; N = c.N
    xs = np.arange(W, dtype=np.float32)
    lit, dark = lit_dark(c, col, (0.66, 0.52, 0.56))
    sunleft = c.sun_x < 0.5
    first = None
    items = []
    for _ in range(n):
        cx = r.uniform(-0.1, 1.1) * W; wl = r.uniform(0.14, 0.32) * W; wr = wl * r.uniform(0.22, 0.4)
        hh = height * H * r.uniform(0.35, 1)
        flip = r.random() < 0.5
        items.append((hh, cx, wl, wr, flip))
    items.sort(key=lambda t: -t[0])  # tallest first (behind), smaller ones in front lower
    for j, (hh, cx, wl, wr, flip) in enumerate(items):
        u = xs - cx
        a, b = (wr, wl) if flip else (wl, wr)
        prof = np.where(u < 0, np.exp(-(u / a) ** 2 * 2.0), np.exp(-(u / b) ** 2 * 2.0))
        yb = base_y * H + j * 0.012 * H
        ridge = yb - hh * prof
        cy = yb - hh
        # slip face (steep side): bounded by a line slanting down from the crest
        steep_right = not flip
        k = 0.55
        bound = cx + (YY - cy) * (k if steep_right else -k)
        on_slip = (XX > bound) if steep_right else (XX < bound)
        slip_lit = (not steep_right) == sunleft  # slip face turned to the sun?
        lightness = np.where(on_slip, 0.88 if slip_lit else 0.22, 0.32 if slip_lit else 0.82)
        under = np.clip((YY - ridge[None, :]) / (hh + 1), 0, 1)
        lightness = lightness * (1 - under * 0.25) + 0.08
        rip = np.sin((YY * 1.3 + XX * 0.22 + N.fbm2(H, W, 3, 10, 2) * 80) / (1.6 * SS))
        lightness = lightness + (~on_slip) * rip * 0.05
        colf = dark[None, None] * (1 - lightness[..., None]) + lit[None, None] * lightness[..., None]
        crest = np.exp(-((XX - bound) / (1.2 * SS)) ** 2) * (YY < cy + hh * 0.9) * 0.25
        colf = 1 - (1 - colf) * (1 - c.light[None, None] * crest[..., None])
        sel = prof[None, :] > 0.01
        rr = np.where(prof > 0.01, ridge, H + 10)
        lay(c, rr, colf, depth, outline)
        if first is None: first = ridge
    return first

def treeline(c, base_y, amp, col, depth, tip=1.0, outline=0.0, cells=3, autumn=0.0, rows=3):
    """A forest wall: several rows of pine tips, the top row catching the light, each tip lit
    on the sun side; rows below darker (dense forest)."""
    base_y -= LIFT; amp *= HG
    r = c.rng; N = c.N
    hill = base_y * H - (N.fbm1(W, cells, 4) - 0.3) * amp * H
    sz = (3 + depth * 13) * SS * tip
    xs = np.arange(W, dtype=np.float32)
    sunleft = c.sun_x < 0.5
    base = hexc(col)
    pal = [hexc("#d8862a"), hexc("#c24a26"), hexc("#e2b23a"), hexc("#b8a030"), base]
    first = None
    for row in range(rows):
        tips = np.zeros(W, np.float32); tx = np.zeros(W, np.float32); th = np.ones(W, np.float32); tc = np.zeros(W, int)
        x = -sz * r.uniform(0, 1)
        while x < W + sz:
            w = sz * r.uniform(1.0, 1.6); h = sz * r.uniform(1.1, 1.8)
            u = np.abs(xs - x) / w
            t = np.clip(1 - u, 0, 1) ** 0.9 * h
            better = t > tips
            tips = np.where(better, t, tips); tx = np.where(better, x, tx); th = np.where(better, h, th)
            k = (r.randint(0, 3) if (autumn > 0 and r.random() < autumn) else 4)
            tc = np.where(better, k, tc)
            x += w * r.uniform(0.8, 1.2)
        ridge = hill + row * sz * 1.5 - tips
        crown = np.stack(pal)[tc][None, :, :]
        lit, dark = lit_dark(c, crown, (0.42, 0.52, 0.62))
        side = (XX < tx[None, :]) if sunleft else (XX > tx[None, :])
        into = np.clip((YY - ridge[None, :]) / np.maximum(th[None, :] * 1.6, 1), 0, 1)
        k_row = 1 - row / rows * 0.5
        var = (np.sin(tx * 12.9898) * 43758.5453) % 1  # per tree
        tree = (0.8 - into * 0.5 + np.where(side, 0.1, -0.08) + (var[None, :] - 0.5) * 0.25)
        mass = 0.22 + (N.fbm2(H, W, 12, 50, 3) - 0.5) * 0.25
        w_t = 1 - smooth((into - 0.75) * 4)
        shade = np.clip((tree * w_t + mass * (1 - w_t)) * k_row, 0, 1)
        colf = dark * (1 - shade[..., None]) + lit * shade[..., None]
        lay(c, ridge, colf, depth, outline * (1 if row == 0 else 0.4), soft=0.8)
        if first is None: first = ridge
    return first

def meadow(c, base_y, amp, col, depth, cells=2, outline=0.0):
    base_y -= LIFT; amp *= HG
    N = c.N
    ridge = base_y * H - (N.fbm1(W, cells, 4) - 0.3) * amp * H
    lit, dark = lit_dark(c, col, (0.6, 0.7, 0.72))
    under = np.clip((YY - ridge[None, :]) / (H * 0.18), 0, 1)
    blot = N.fbm2(H, W, 4, 12, 4)
    shade = np.clip(0.85 - under * 0.45 + norm(blot) * 0.12, 0, 1)
    stripes = N.fbm2(H, W, 40, 30, 2)
    shade = np.clip(shade + (stripes - 0.5) * 0.12, 0, 1)
    colf = dark[None, None] * (1 - shade[..., None]) + lit[None, None] * shade[..., None]
    rim = np.exp(-np.clip(YY - ridge[None, :], 0, None) / (2 * SS)) * 0.4
    colf = 1 - (1 - colf) * (1 - c.light[None, None] * rim[..., None])
    lay(c, ridge, colf, depth, outline)
    return ridge

def houses(c, ridge, depth, density, pal, lights=0.0, rows=5):
    """Hillsides covered in small houses (pastel walls, roofs), rows following the hill."""
    img = Image.fromarray((np.clip(c.a, 0, 1) * 255).astype(np.uint8)).convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    hz = haze_of(c, depth)
    sz = (2 + depth * 6) * SS
    sunleft = c.sun_x < 0.5
    to = lambda col, a=255: tuple(int(v * 255) for v in np.clip(col, 0, 1)) + (a,)
    for row in range(rows):
        x = c.rng.uniform(-sz, 0)
        while x < W:
            xi = int(min(W - 1, max(0, x)))
            y = ridge[xi] + sz * (0.8 + row * 1.25) + c.rng.uniform(-0.2, 0.2) * sz
            if y > H: break
            if c.rng.random() < density:
                w = sz * c.rng.uniform(0.9, 1.5); h = sz * c.rng.uniform(0.8, 1.2)
                wall = hexc(c.rng.choice(pal))
                lit, dark = lit_dark(c, wall, (0.6, 0.6, 0.72))
                fc = (lit if sunleft else dark) * (1 - hz) + c.haze * hz
                sc = (dark if sunleft else lit) * (1 - hz) + c.haze * hz
                roof = hexc(c.rng.choice(["#6a4a40", "#8a5a48", "#4a5060", "#a8604a"])) * (1 - hz) + c.haze * hz
                d.rectangle((x, y - h, x + w * 0.65, y), fill=to(fc))
                d.rectangle((x + w * 0.65, y - h, x + w, y), fill=to(sc))
                d.polygon([(x - w * 0.05, y - h), (x + w * 0.5, y - h - h * 0.45), (x + w * 1.05, y - h)], fill=to(roof))
                if depth > 0.4:
                    win = np.array([1, 0.85, 0.5]) if c.rng.random() < lights else wall * 0.55
                    win = win * (1 - hz) + c.haze * hz
                    d.rectangle((x + w * 0.2, y - h * 0.7, x + w * 0.35, y - h * 0.4), fill=to(win))
            x += sz * c.rng.uniform(1.2, 2.2) * (1 + 1.5 * (c.N.n1(1, 1)[0] if False else 0)) + (sz * 4 if c.rng.random() < 0.08 else 0)
    c.a = np.asarray(img.convert("RGB")).astype(np.float32) / 255

def towers(c, cx, width, base_y, hmax, depth, col, lights=0.0):
    """A downtown cluster: towers of various shapes, tallest in the middle, lit windows."""
    base_y -= LIFT * H; hmax *= HG
    img = Image.fromarray((np.clip(c.a, 0, 1) * 255).astype(np.uint8)).convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    hz = haze_of(c, depth)
    to = lambda col, a=255: tuple(int(v * 255) for v in np.clip(col, 0, 1)) + (a,)
    sunleft = c.sun_x < 0.5
    items = []
    for _ in range(int(width / (14 * SS))):
        x = cx + c.rng.gauss(0, width / 3.2)
        dist = abs(x - cx) / (width / 2)
        h = hmax * max(0.18, (1 - dist ** 1.6)) * c.rng.uniform(0.55, 1.05)
        w = c.rng.uniform(10, 24) * SS * (0.6 + depth * 0.6)
        items.append((h, x, w))
    items.sort(key=lambda t: -t[0])
    for h, x, w in items[: max(1, len(items))]:
        tint = hexc(c.rng.choice([col, "#a8b4c8", "#c8c0b0", "#8a96a8", "#d8d0c4"]))
        lit, dark = lit_dark(c, tint, (0.55, 0.58, 0.72))
        fl = lit * (1 - hz) + c.haze * hz; fd = dark * (1 - hz) + c.haze * hz
        top = base_y - h
        split = x + w * (0.35 if sunleft else 0.65)
        d.rectangle((x, top, x + w, base_y + 20 * SS), fill=to(fd))
        if sunleft: d.rectangle((x, top, split, base_y + 20 * SS), fill=to(fl))
        else: d.rectangle((split, top, x + w, base_y + 20 * SS), fill=to(fl))
        shape = c.rng.random()
        if shape < 0.25: d.polygon([(x, top), (x + w / 2, top - w * 1.3), (x + w, top)], fill=to(fd))
        elif shape < 0.4: d.rectangle((x + w * 0.25, top - h * 0.08, x + w * 0.75, top), fill=to(fd))
        if shape < 0.55: d.line((x + w / 2, top - w * (1.3 if shape < 0.25 else 0.4), x + w / 2, top - w * 2.2), fill=to(fd), width=max(1, SS))
        # window rows
        if depth > 0.2:
            for wy in np.arange(top + 3 * SS, base_y, 3.2 * SS * (0.6 + depth * 0.5)):
                for wx in np.arange(x + 2 * SS, x + w - 2 * SS, 2.6 * SS):
                    if lights > 0 and c.rng.random() < lights:
                        d.rectangle((wx, wy, wx + SS * 1.2, wy + SS * 1.4), fill=to(np.array([1, 0.86, 0.5]) * (1 - hz * 0.5) + c.haze * hz * 0.5, 235))
                    elif c.rng.random() < 0.35:
                        d.rectangle((wx, wy, wx + SS * 1.2, wy + SS * 1.4), fill=to(fd * 0.85 + fl * 0.15, 140))
    c.a = np.asarray(img.convert("RGB")).astype(np.float32) / 255

# ------------------------------------------------------------------ moods
MOODS = {
    #           sky top    sky bottom  cloud tint  clouds  light      haze       sun (y, glow colour, power)
    "midi":     ("#1f6fe0", "#bfe0ff", "#ffffff", 1.0, "#fff6e0", "#c8dcf0", (0.18, "#fff2c8", 0.35)),
    "matin":    ("#5a7ad8", "#ffd8c4", "#ffe8e0", 0.9, "#ffd8b8", "#f0d8d0", (0.55, "#ffcfa0", 0.7)),
    "dore":     ("#3a6ad0", "#ffe0a0", "#fff0d0", 0.9, "#ffd890", "#f4dcb0", (0.5, "#ffc870", 0.8)),
    "couchant": ("#3a2a80", "#ff9a5a", "#ffb090", 0.95, "#ff9a60", "#e8a090", (0.6, "#ff8a40", 1.0)),
    "crepuscule": ("#1a1840", "#e06a5a", "#c07a90", 0.8, "#c88a9a", "#8a6a90", (0.72, "#ff7050", 0.8)),
    "chaud":    ("#3a8ae0", "#fff0cc", "#fff8ec", 0.45, "#fff0c8", "#f2e2c4", (0.22, "#fff0c0", 0.5)),
    "gris":     ("#7d8794", "#c8ccd0", "#d8dce0", 1.0, "#e0e4ea", "#c4c8cc", None),
    "orage":    ("#3a4050", "#8a929e", "#7a808c", 1.0, "#c0c8d0", "#8a929a", None),
    "nuit":     ("#0a1030", "#2a3a70", "#3a4870", 0.5, "#8aa0d0", "#2a3460", (0.25, "#dfe6ff", 0.25)),
}

def sky_for(mood, rng, sun_x, mirror):
    t, b, ct, ca, *_ = MOODS[mood]
    sun = MOODS[mood][6]
    s = (sun_x, sun[0], sun[1], sun[2]) if sun else None
    a = paint_sky((t, b, ct, ca), s, rng, mirror)
    if mood == "nuit":
        st = np.random.default_rng(rng.randint(0, 1 << 30)).random((H, W)) > 0.9985
        a[st] = 1
    return a

def canvas_for(mood, seed):
    rng = random.Random(seed)
    sun_x = rng.choice([rng.uniform(0.12, 0.35), rng.uniform(0.65, 0.88)])
    sky = sky_for(mood, rng, sun_x, rng.random() < 0.5)
    c = Canvas(sky, seed, sun_x, MOODS[mood][4], MOODS[mood][5])
    return c, rng

# ------------------------------------------------------------------ worlds
def canyon(i):
    mood = ["couchant", "dore", "midi", "matin", "crepuscule", "chaud", "orage", "dore", "couchant", "midi",
            "matin", "nuit", "dore", "couchant", "midi", "crepuscule", "chaud", "dore", "matin", "couchant"][i]
    c, r = canvas_for(mood, 7000 + i)
    far = ["#c99aa6", "#dcb4b4", "#b88a98"]
    mid = ["#dc7c46", "#f2c08a", "#c8643c", "#e89a62"]
    near = ["#a8442a", "#e0a070", "#8a3420", "#c25a34"]
    mesas(c, 0.6, 0.2, r.randint(2, 4), far, 0.1)
    c.mist(0.6, 0.035, 0.22)
    if i % 4 == 1:
        mesas(c, 0.67, 0.22, r.randint(2, 3), mid, 0.5, 0.3)
        c.water(0.67 * H, "#3a8ab0" if mood not in ("couchant", "crepuscule", "nuit") else "#5a5a90", 0.6)
        mesas(c, 0.86, 0.3, 2, near, 0.9, 0.6)
    elif i % 4 == 3:
        mesas(c, 0.66, 0.2, r.randint(2, 3), mid, 0.5, 0.3)
        # hoodoos: thin spires in front
        sp = np.zeros(W); x = np.arange(W) / W
        for _ in range(r.randint(10, 18)):
            cx = r.uniform(0, 1); w = r.uniform(0.004, 0.011); hgt = r.uniform(0.3, 1)
            sp = np.maximum(sp, np.exp(-((x - cx) / w) ** 4) * hgt)
        ridge = (0.8 - LIFT) * H - sp * 0.26 * HG * H - c.N.fbm1(W, 20, 3) * 0.04 * H
        band = 6 * SS
        bi = np.floor((YY + (c.N.fbm2(H, W, 3, 20, 2) - 0.5) * band) / band).astype(int)
        idx = np.where((np.sin(bi * 12.9898) * 43758.5453) % 1 < 0.6, 0, 3)
        base = np.stack([hexc(p) for p in near])[idx]
        lit, dark = lit_dark(c, base, (0.55, 0.45, 0.55))
        sh = np.clip(0.55 + (c.N.n2(1, W, 1, 400)[0][None, :] - 0.5) * 0.8, 0, 1)
        lay(c, ridge, dark * (1 - sh[..., None]) + lit * sh[..., None], 0.8, 0.5)
    else:
        mesas(c, 0.68, 0.24, r.randint(2, 3), mid, 0.5, 0.3)
        c.mist(0.69, 0.03, 0.12)
        mesas(c, 0.84, 0.24, r.randint(2, 3), near, 0.88, 0.55)
    return c.finish(1.05)

def desert(i):
    mood = ["dore", "chaud", "couchant", "midi", "matin", "crepuscule", "chaud", "nuit", "dore", "couchant",
            "midi", "matin", "chaud", "couchant", "dore", "crepuscule", "midi", "matin", "chaud", "couchant"][i]
    c, r = canvas_for(mood, 8000 + i)
    if i % 3 == 0:
        mesas(c, 0.6, 0.1, r.randint(2, 3), ["#e0b8a4", "#e8c8b0"], 0.1)
    dunes(c, 0.62, 0.1, 7, "#efcf94", 0.25)
    c.mist(0.63, 0.03, 0.18)
    if i % 4 == 2:
        c.water(0.69 * H, "#2fa0c0", 0.6)
        c.forest(np.full(W, (0.69 - LIFT) * H), 0.55, 0.45, "palm", "#3a7a3a", (-0.1, 0.1))
    dunes(c, 0.73, 0.15, 6, "#ebbd78", 0.55, 0.2)
    dunes(c, 0.86, 0.16, 5, "#e2a860", 0.9, 0.45)
    if i % 2:
        c.forest(np.full(W, (0.66 - LIFT) * H), 0.5, 0.04, "cactus", "#4a7a40", (0.0, 0.2))
    return c.finish(1.05)

def sf(i):
    mood = ["couchant", "dore", "midi", "matin", "nuit", "crepuscule", "gris", "dore", "couchant", "midi",
            "matin", "nuit", "orage", "dore", "couchant", "crepuscule", "midi", "matin", "nuit", "dore"][i]
    c, r = canvas_for(mood, 9000 + i)
    lights = {"nuit": 0.6, "crepuscule": 0.45, "couchant": 0.15}.get(mood, 0)
    pastel = ["#d8b8a0", "#c89888", "#a8b8c8", "#d8c890", "#b8a8c8", "#a8c0a8", "#d8d0c0", "#c88a78"]
    far = meadow(c, 0.56, 0.1, "#8a9ab4", 0.12)
    houses(c, far, 0.15, 0.35, pastel, lights * 0.5, 2)
    c.water(0.61 * H, "#2f6a9a" if mood not in ("nuit", "crepuscule") else "#283868", 0.4)
    if i % 2 == 0:
        x0 = r.uniform(-0.15, 0.35) * W
        c.bridge(0.6 * H, x0, x0 + r.uniform(0.55, 0.75) * W, 0.17 * H, "#c8402a", 0.5)
    if mood in ("gris", "matin", "orage"): c.mist(0.6, 0.04, 0.6)
    hill = meadow(c, 0.7, 0.12, "#5f7f5a", 0.55, 2, 0.2)
    c.forest(hill, 0.5, 0.35, "round", "#3f6a42", (0.2, 2.2))
    towers(c, r.uniform(0.25, 0.75) * W, W * 0.3, 0.71 * H, 0.22 * H, 0.55, "#b8c0d0", lights)
    houses(c, hill, 0.6, 0.6, pastel, lights, 4)
    near = meadow(c, 0.82, 0.07, "#5f8a55", 0.85, 2, 0.35)
    houses(c, near, 0.88, 0.6, pastel, lights, 3)
    return c.finish(1.04)

def alpes(i):
    mood = ["matin", "midi", "couchant", "dore", "crepuscule", "midi", "matin", "dore", "gris", "nuit"][i]
    c, r = canvas_for(mood, 6000 + i)
    mountains(c, 0.6, 0.34, r.randint(3, 5), "#6f80a8", 0.15, 0.36)
    c.mist(0.6, 0.035, 0.3)
    mountains(c, 0.66, 0.22, r.randint(4, 6), "#56658a", 0.45, 0.18, 0.2)
    if i % 3 == 1:
        c.water(0.68 * H, "#3a7ab8", 0.6)
    treeline(c, 0.74, 0.06, "#2f6a44", 0.6, 0.9, 0.2)
    c.mist(0.76, 0.02, 0.12)
    m = meadow(c, 0.84, 0.05, "#62a04c", 0.9, 2, 0.35)
    c.forest(m, 0.9, 0.12, "pine", "#2a6040", (0.1, 0.6))
    return c.finish(1.04)

def foret(i):
    mood = ["matin", "dore", "midi", "couchant", "gris", "matin", "dore", "crepuscule", "midi", "orage"][i]
    c, r = canvas_for(mood, 5000 + i)
    autumn = 1.0 if i % 2 == 1 else 0.0
    mountains(c, 0.6, 0.16, r.randint(3, 5), "#8496b4", 0.12, 0.4) if i % 3 == 0 else meadow(c, 0.58, 0.12, "#8aa0b8", 0.1)
    c.mist(0.6, 0.04, 0.4)
    treeline(c, 0.64, 0.1, "#3f6e58", 0.3, 0.8)
    c.mist(0.66, 0.035, 0.35)
    treeline(c, 0.71, 0.1, "#2f6a46", 0.55, 1.0, 0.15, autumn=autumn * 0.6)
    if i % 3 == 2:
        c.water(0.76 * H, "#3a7a9a", 0.7)
    c.mist(0.76, 0.03, 0.2)
    treeline(c, 0.82, 0.08, "#2a5e3a", 0.85, 1.2, 0.4, autumn=autumn)
    return c.finish(1.04)

WORLDS = {"canyon": (canyon, 20), "desert": (desert, 20), "sf": (sf, 20), "alpes": (alpes, 10), "foret": (foret, 10)}

def main():
    os.makedirs(OUT, exist_ok=True)
    want = sys.argv[1:]
    idx_path = os.path.join(OUT, "index.json")
    meta = json.load(open(idx_path)) if os.path.exists(idx_path) else {}
    for world, (fn, n) in WORLDS.items():
        for i in range(n):
            name = f"{world}.p{i}"
            if want and name not in want and world not in want: continue
            im = fn(i)
            im.save(os.path.join(OUT, name + ".webp"), "WEBP", quality=84, method=6)
            a = np.asarray(im).astype(np.float32) / 255
            top = a[:6].reshape(-1, 3).mean(0); bot = a[int(OH * 0.72):int(OH * 0.76)].reshape(-1, 3).mean(0)
            meta[name] = {"skyTop": "#%02x%02x%02x" % tuple(int(v * 255) for v in top), "ground": "#%02x%02x%02x" % tuple(int(v * 255) for v in bot), "horizon": 0.7}
            print(name, flush=True)
    json.dump(meta, open(idx_path, "w"), indent=1)

if __name__ == "__main__":
    main()
