"""Build the rider/bike pose atlas from the two source sheets.

Output (public/res):
  rider-atlas.webp   all poses, wheels & ground shadow removed (wheels are drawn by the game
                     at the physics positions, so suspension travel is visible)
  rider-atlas.json   per frame: atlas rect, rear/front axle (atlas px), helmet position in
                     wheelbase units, swing-arm pivot and fork anchor

Run:  python3 tools/build_rider_atlas.py
"""
from __future__ import annotations

import json
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from rider_frames import axles, frames  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art", "source")
OUT = os.path.join(ROOT, "public", "res")

# Template geometry measured on sheet A frame 0, expressed in the axle frame
# (origin rear axle, x towards the front axle, unit = axle distance, y DOWN like images).
TEMPLATE_TILT = math.atan2(9, 108)  # perspective: the rear axle sits a little higher
PIVOT = (0.50, -0.075)  # swing-arm pivot
FORK_TOP = (-0.25, -0.46)  # a point up the fork leg, relative to the FRONT axle


def to_axle_frame(R, F):
    """Return functions converting between image px and the corrected axle frame."""
    dx, dy = F[0] - R[0], F[1] - R[1]
    L = math.hypot(dx, dy)
    ang = math.atan2(dy, dx)
    return L, ang


def process(sheet: str, tag: str):
    out = []
    for idx, cell in frames(os.path.join(SRC, sheet)):
        (rx, ry, rr), (fx, fy, fr) = axles(cell)
        L, ang = to_axle_frame((rx, ry), (fx, fy))
        if not (60 < L < 140) or rr < 15 or fr < 15:
            print("skip", tag, idx, "bad axles", L, rr, fr)
            continue
        # Straighten so every frame has the template perspective tilt.
        rot = TEMPLATE_TILT - ang
        img = Image.fromarray(cell.astype(np.uint8), "RGBA")
        pad = 24
        canvas = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
        canvas.paste(img, (pad, pad))
        mx, my = (rx + fx) / 2 + pad, (ry + fy) / 2 + pad
        canvas = canvas.rotate(-math.degrees(rot), resample=Image.BICUBIC, center=(mx, my))

        def rotp(px, py):
            px, py = px + pad - mx, py + pad - my
            c, s = math.cos(rot), math.sin(rot)
            return mx + px * c - py * s, my + px * s + py * c

        R = rotp(rx, ry)
        F = rotp(fx, fy)
        a = np.asarray(canvas).astype(np.float32)
        H, W = a.shape[:2]
        yy, xx = np.mgrid[0:H, 0:W]
        alpha = a[..., 3]
        r_rear = rr * 1.16
        r_front = fr * 1.16
        # erase wheels
        alpha[(xx - R[0]) ** 2 + (yy - R[1]) ** 2 < r_rear**2] = 0
        alpha[(xx - F[0]) ** 2 + (yy - F[1]) ** 2 < r_front**2] = 0
        # erase the swing arm (band from pivot to rear axle)
        ux, uy = (F[0] - R[0]) / L, (F[1] - R[1]) / L
        nx, ny = -uy, ux
        P = (R[0] + (PIVOT[0] * ux + PIVOT[1] * nx) * L, R[1] + (PIVOT[0] * uy + PIVOT[1] * ny) * L)
        sx, sy = P[0] - R[0], P[1] - R[1]
        slen = math.hypot(sx, sy)
        t = ((xx - R[0]) * sx + (yy - R[1]) * sy) / (slen * slen)
        d = np.abs((xx - R[0]) * (-sy) + (yy - R[1]) * sx) / slen
        alpha[(t > 0) & (t < 1.02) & (d < 0.055 * L)] = 0
        # erase the painted ground shadow under the bike
        line_y = R[1] + (xx - R[0]) * (F[1] - R[1]) / (F[0] - R[0])
        alpha[yy > line_y + 0.5 * (rr + fr) / 2] = 0
        a[..., 3] = alpha
        # helmet: centroid of the top 14 % of the opaque pixels
        solid = alpha > 128
        ys, xs = np.nonzero(solid)
        top = ys.min()
        bottom = ys.max()
        hmask = solid & (yy < top + 0.14 * (bottom - top))
        hy_, hx_ = np.nonzero(hmask)
        hxp, hyp = hx_.mean(), hy_.mean()
        # torso: opaque pixels between helmet and seat height
        tmask = solid & (yy > top + 0.18 * (bottom - top)) & (yy < top + 0.42 * (bottom - top))
        ty_, tx_ = np.nonzero(tmask)
        # express in axle frame (x forward, y UP), unit = axle distance
        def norm(px, py):
            vx, vy = px - R[0], py - R[1]
            return ((vx * ux + vy * uy) / L, -(vx * nx + vy * ny) / L)

        helmet = norm(hxp, hyp)
        torso = norm(tx_.mean(), ty_.mean()) if len(tx_) else helmet
        fork_top = (F[0] + (FORK_TOP[0] * ux + FORK_TOP[1] * nx) * L, F[1] + (FORK_TOP[0] * uy + FORK_TOP[1] * ny) * L)
        # crop to content
        ys, xs = np.nonzero(alpha > 4)
        x0, x1, y0, y1 = xs.min() - 2, xs.max() + 3, ys.min() - 2, ys.max() + 3
        crop = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA").crop((x0, y0, x1, y1))
        sh = lambda p: (p[0] - x0, p[1] - y0)  # noqa: E731
        out.append(
            dict(
                id=f"{tag}{idx}",
                img=crop,
                rear=sh(R),
                front=sh(F),
                rr=rr,
                fr=fr,
                pivot=sh(P),
                forkTop=sh(fork_top),
                helmet=helmet,
                torso=torso,
                L=L,
            )
        )
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    allf = process("rider-sheet-a.png", "a") + process("rider-sheet-b.png", "b")
    # pack in rows
    cols = 10
    cw = max(f["img"].width for f in allf) + 2
    ch = max(f["img"].height for f in allf) + 2
    rows = math.ceil(len(allf) / cols)
    atlas = Image.new("RGBA", (cols * cw, rows * ch), (0, 0, 0, 0))
    meta = []
    for i, f in enumerate(allf):
        ox, oy = (i % cols) * cw, (i // cols) * ch
        atlas.paste(f["img"], (ox, oy))
        p = lambda q: [round(q[0] + ox, 2), round(q[1] + oy, 2)]  # noqa: E731
        meta.append(
            dict(
                id=f["id"],
                x=ox,
                y=oy,
                w=f["img"].width,
                h=f["img"].height,
                rear=p(f["rear"]),
                front=p(f["front"]),
                rr=round(f["rr"], 2),
                fr=round(f["fr"], 2),
                pivot=p(f["pivot"]),
                forkTop=p(f["forkTop"]),
                helmet=[round(v, 4) for v in f["helmet"]],
                torso=[round(v, 4) for v in f["torso"]],
            )
        )
    atlas.save(os.path.join(OUT, "rider-atlas.webp"), "WEBP", quality=92, method=6)
    with open(os.path.join(OUT, "rider-atlas.json"), "w") as fh:
        json.dump({"frames": meta}, fh, separators=(",", ":"))
    print("frames", len(meta), "atlas", atlas.size)


if __name__ == "__main__":
    main()
