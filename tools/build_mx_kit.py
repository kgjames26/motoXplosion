"""Measure the pieces of the dirt park kit (public/low-poly_dirt_park_modular_kit.glb).

The kit is one sheet of pieces merged by material. This cuts it into modules exactly like the
game does at load time (connected triangles, then pieces whose footprints touch), and for each
module samples the height along its long axis (the line a bike rides over it). The result goes
to src/mx/kitData.ts: the track is then built from the modules that make good jumps, and the
physics rides the very profile of the piece that is shown.

Run:  python3 tools/build_mx_kit.py
"""
import json, os, struct, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
f = open(os.path.join(ROOT, "public", "low-poly_dirt_park_modular_kit.glb"), "rb")
f.read(12)
n, _ = struct.unpack("<II", f.read(8)); J = json.loads(f.read(n))
n2, _ = struct.unpack("<II", f.read(8)); BIN = f.read(n2)

def accessor(i):
    a = J["accessors"][i]; bv = J["bufferViews"][a["bufferView"]]
    comp = {5126: ("f4", 4), 5123: ("u2", 2), 5125: ("u4", 4), 5121: ("u1", 1)}[a["componentType"]]
    ncomp = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = bv.get("byteStride", comp[1] * ncomp)
    raw = np.frombuffer(BIN, dtype=np.uint8, count=stride * (a["count"] - 1) + comp[1] * ncomp, offset=off)
    out = np.zeros((a["count"], ncomp), dtype=comp[0])
    for k in range(a["count"]):
        out[k] = np.frombuffer(raw[k * stride:k * stride + comp[1] * ncomp].tobytes(), dtype=comp[0])
    return out

def node_matrix(nd):
    if "matrix" in nd: return np.array(nd["matrix"], float).reshape(4, 4).T
    return np.eye(4)

pieces = []  # (material name, tris Nx3x3, box)
def walk(i, M):
    nd = J["nodes"][i]; M = M @ node_matrix(nd)
    if "mesh" in nd:
        for p in J["meshes"][nd["mesh"]]["primitives"]:
            name = J["materials"][p["material"]]["name"]
            if name in ("Grass",): continue
            P = accessor(p["attributes"]["POSITION"]).astype(float)
            P = (np.c_[P, np.ones(len(P))] @ M.T)[:, :3]
            I = accessor(p["indices"]).reshape(-1).astype(int) if "indices" in p else np.arange(len(P))
            T = P[I].reshape(-1, 3, 3)
            # connected components by welded vertices
            parent = list(range(len(T)))
            def find(a):
                while parent[a] != a:
                    parent[a] = parent[parent[a]]; a = parent[a]
                return a
            seen = {}
            for t in range(len(T)):
                for v in range(3):
                    k = tuple(np.round(T[t, v] * 8).astype(int))
                    if k in seen: parent[find(t)] = find(seen[k])
                    else: seen[k] = t
            groups = {}
            for t in range(len(T)): groups.setdefault(find(t), []).append(t)
            for lst in groups.values():
                tt = T[lst]
                pieces.append((name, tt, (tt.reshape(-1, 3).min(0), tt.reshape(-1, 3).max(0))))
    for c in nd.get("children", []): walk(c, M)
for r in J["scenes"][0]["nodes"]: walk(r, np.eye(4))

par = list(range(len(pieces)))
def find(a):
    while par[a] != a:
        par[a] = par[par[a]]; a = par[a]
    return a
gap = 0.35
for i in range(len(pieces)):
    a0, a1 = pieces[i][2]
    for j in range(i + 1, len(pieces)):
        b0, b1 = pieces[j][2]
        if a0[0] - gap <= b1[0] and b0[0] - gap <= a1[0] and a0[2] - gap <= b1[2] and b0[2] - gap <= a1[2]: par[find(i)] = find(j)
mods = {}
for i, p in enumerate(pieces): mods.setdefault(find(i), []).append(p)

def height_at(T, x, z):
    """Highest point of the triangles above (x, z)."""
    a, b, c = T[:, 0], T[:, 1], T[:, 2]
    d = (b[:, 2] - c[:, 2]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 2] - c[:, 2])
    ok = np.abs(d) > 1e-9
    w0 = np.where(ok, ((b[:, 2] - c[:, 2]) * (x - c[:, 0]) + (c[:, 0] - b[:, 0]) * (z - c[:, 2])) / np.where(ok, d, 1), -1)
    w1 = np.where(ok, ((c[:, 2] - a[:, 2]) * (x - c[:, 0]) + (a[:, 0] - c[:, 0]) * (z - c[:, 2])) / np.where(ok, d, 1), -1)
    w2 = 1 - w0 - w1
    inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
    if not inside.any(): return 0.0
    y = w0 * a[:, 1] + w1 * b[:, 1] + w2 * c[:, 1]
    return float(y[inside].max())

out = []
for lst in mods.values():
    T = np.concatenate([p[1] for p in lst]); V = T.reshape(-1, 3)
    mn, mx = V.min(0), V.max(0); size = mx - mn
    if size[0] < 1 and size[2] < 1: continue
    cx, cz = (mn[0] + mx[0]) / 2, (mn[2] + mx[2]) / 2
    along_x = size[0] >= size[2]
    L = size[0] if along_x else size[2]; Wd = size[2] if along_x else size[0]
    N = 49
    prof = []
    for k in range(N):
        t = -L / 2 + L * k / (N - 1)
        hs = []
        for lat in (-0.18, -0.09, 0, 0.09, 0.18):
            x, z = (cx + t, cz + lat * Wd) if along_x else (cx + lat * Wd, cz + t)
            hs.append(height_at(T, x, z) - mn[1])
        prof.append(round(float(np.median(hs)), 2))
    # side closure: highest point on the outer 4% strips of both lateral edges (a cut piece shows its
    # cross-section there: the edge is as high as the middle)
    edge = 0.0
    for k in range(0, N, 2):
        t = -L / 2 + L * k / (N - 1)
        for lat in (-0.46, 0.46):
            x, z = (cx + t, cz + lat * Wd) if along_x else (cx + lat * Wd, cz + t)
            edge = max(edge, height_at(T, x, z) - mn[1])
    mats = sorted(set(p[0] for p in lst))
    # height grid of the jump pieces: 49 samples along x 17 across (-0.48..0.48 of the width), so the
    # physics sees the same lateral shape as the mesh (a mound is lower at its sides)
    grid = []
    if mats == ["Dirt"] and max(prof) >= 0.9 and Wd >= 6 and edge <= 0.3 * max(prof) and abs(prof[0]) < 0.3 and abs(prof[-1]) < 0.3:
        for k in range(N):
            t = -L / 2 + L * k / (N - 1)
            for j in range(17):
                lat = -0.48 + 0.96 * j / 16
                x, z = (cx + t, cz + lat * Wd) if along_x else (cx + lat * Wd, cz + t)
                grid.append(round(float(height_at(T, x, z) - mn[1]), 2))
    out.append({"grid": grid, "edge": round(float(edge), 2), "cx": round(cx, 2), "cz": round(cz, 2), "len": round(L, 2), "wid": round(Wd, 2), "h": round(size[1], 2), "alongX": bool(along_x), "mats": mats, "profile": prof, "tris": len(T)})
out.sort(key=lambda m: (m["cx"], m["cz"]))
if "--print" in sys.argv:
    for m in out: print(f'{m["cx"]:7.1f} {m["cz"]:7.1f} L{m["len"]:5.1f} W{m["wid"]:5.1f} H{m["h"]:4.1f} {"/".join(m["mats"]):28s} max{max(m["profile"]):4.1f} ends {m["profile"][0]:.1f},{m["profile"][-1]:.1f} mid {m["profile"][24]:.1f}')
    print(len(out), "modules")
open(os.path.join(ROOT, "src", "mx", "kitData.ts"), "w").write("// Generated by tools/build_mx_kit.py — the modules of the dirt park kit, measured.\nexport interface KitModule {\n  cx: number;\n  cz: number;\n  len: number;\n  wid: number;\n  h: number;\n  alongX: boolean;\n  mats: string[];\n  /** Height along the long axis (49 samples, kit metres). */\n  profile: number[];\n  /** 49x17 heights (along x across), jump pieces only. */\n  grid: number[];\n  /** Highest point at the lateral edges (m): ~0 = closed sides, high = cut piece. */\n  edge: number;\n  tris: number;\n}\nexport const KIT_MODULES: KitModule[] = " + json.dumps(out) + ";\n")
