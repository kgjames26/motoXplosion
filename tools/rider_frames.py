"""Shared helpers: cut the rider sprite sheets into clean frames and locate the wheels.

Each sheet is a 10 x 5 grid of poses on a transparent background, with a small frame
number printed in the corner of each cell. Numbers are removed, then each frame's axles
are located so every pose can be aligned on the physics chassis.
"""
from __future__ import annotations

import numpy as np
from PIL import Image
from scipy import ndimage

COLS, ROWS = 10, 5


def frames(path: str):
    """Yield (index, rgba_array) for every bike blob, ordered row by row.

    The sheets are not a strict grid, so bikes are found as large connected components;
    small detached bits close to a bike are merged into it, frame numbers are dropped.
    """
    im = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    a = im[..., 3] > 24
    lab, n = ndimage.label(a, structure=np.ones((3, 3)))
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    objs = ndimage.find_objects(lab)
    big = [i for i in range(n) if sizes[i] > 4000]
    boxes = []
    for i in big:
        ys, xs = objs[i]
        boxes.append([ys.start, ys.stop, xs.start, xs.stop, [i + 1]])
    # merge small components lying inside (or touching) a bike box, unless number-like
    for i in range(n):
        if i in big or sizes[i] < 6:
            continue
        ys, xs = objs[i]
        cy, cx = (ys.start + ys.stop) / 2, (xs.start + xs.stop) / 2
        for bx in boxes:
            if bx[0] - 3 <= cy <= bx[1] + 3 and bx[2] - 3 <= cx <= bx[3] + 3:
                comp = im[ys, xs][lab[ys, xs] == i + 1]
                lum = (comp[:, :3] @ np.array([0.299, 0.587, 0.114])).mean()
                if cy < bx[0] + 0.15 * (bx[1] - bx[0]) and lum < 60 and sizes[i] > 40:
                    break  # a frame number glued near the helmet
                bx[4].append(i + 1)
                bx[0], bx[1] = min(bx[0], ys.start), max(bx[1], ys.stop)
                bx[2], bx[3] = min(bx[2], xs.start), max(bx[3], xs.stop)
                break
    # order: rows by centre y (row height ~ sheet/5), then x
    rowh = im.shape[0] / 5
    boxes.sort(key=lambda b: (int(((b[0] + b[1]) / 2) // rowh), b[2]))
    pad = 4
    for k, (y0, y1, x0, x1, ids) in enumerate(boxes):
        y0, x0 = max(0, y0 - pad), max(0, x0 - pad)
        y1, x1 = min(im.shape[0], y1 + pad), min(im.shape[1], x1 + pad)
        sub = im[y0:y1, x0:x1].copy()
        keep = np.isin(lab[y0:y1, x0:x1], ids)
        keep = ndimage.binary_dilation(keep, iterations=1)
        sub[..., 3] = np.where(keep, sub[..., 3], 0)
        yield k, sub


def axles(cell: np.ndarray):
    """Return ((rx, ry, rr), (fx, fy, fr)): rear/front wheel centres and radii (cell px)."""
    rgb = cell[..., :3]
    a = cell[..., 3]
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    solid = a > 128
    ys, xs = np.nonzero(solid)
    bx0, bx1, by0, by1 = xs.min(), xs.max(), ys.min(), ys.max()
    bw, bh = bx1 - bx0, by1 - by0
    dark = solid & (lum < 95)
    res = []
    for side in ("rear", "front"):
        m = dark.copy()
        m[: int(by0 + bh * 0.45)] = False
        if side == "rear":
            m[:, int(bx0 + bw * 0.45):] = False
        else:
            m[:, : int(bx0 + bw * 0.55)] = False
        yy, xx = np.nonzero(m)
        bottom = yy.max()
        if side == "rear":
            edge = xx.min()
            rows = yy[xx <= edge + 1]
        else:
            edge = xx.max()
            rows = yy[xx >= edge - 1]
        cy = float(np.median(rows))
        r = float(bottom - cy)
        cx = edge + r if side == "rear" else edge - r
        res.append((float(cx), cy, r))
    return res[0], res[1]
