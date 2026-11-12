/**
 * v2.26 — the motocross track ("Circuit de cross"), a single MXGP-style loop.
 *
 * Pure data, no rendering: the centre line in plan view (closed Catmull-Rom spline sampled
 * every metre: position, heading, curvature), the height profile along it (tables, doubles,
 * whoops and rollers on the straights, flat in the turns), and the path followed in each
 * game mode (lap from the start line; in cruising: entry lane → a lap and the main straight
 * → exit lane).
 *
 * Plan-view axes: X and Z in metres; heading θ measured from +X towards +Z, so a positive
 * curvature turns right (the rider's right is +Z when riding along +X).
 */

import { KIT_MODULES } from './kitData';

const CTRL: [number, number][] = [
  [-90, 0], [-30, 0], [30, 0], [90, 0], // main straight (start / finish)
  [124, 24], [92, 50], // first hairpin (right)
  [34, 46], [-14, 72], [30, 100], // esses
  [90, 102], [124, 130], [92, 158], // second hairpin (right)
  [24, 156], [-40, 152], [-88, 128], // back straight and sweeper
  [-112, 88], [-96, 52], [-122, 20], // long left-right back to the start
];

export const MX_HALF_WIDTH = 5;
/** Beyond the track edge: this much grass, then the fence. */
export const MX_RUNOFF = 4;

const px: number[] = [];
const pz: number[] = [];
const th: number[] = [];
const kp: number[] = [];

function build(): void {
  const n = CTRL.length;
  const raw: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = CTRL[(i + n - 1) % n];
    const p1 = CTRL[i];
    const p2 = CTRL[(i + 1) % n];
    const p3 = CTRL[(i + 2) % n];
    for (let k = 0; k < 40; k++) {
      const t = k / 40;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      raw.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  // round the apexes off (a spline through few points pinches at each of them)
  for (let pass = 0; pass < 90; pass++) {
    const c = raw.map((q) => [q[0], q[1]] as [number, number]);
    const m = raw.length;
    for (let i = 0; i < m; i++) {
      raw[i][0] = (c[(i + m - 1) % m][0] + 2 * c[i][0] + c[(i + 1) % m][0]) / 4;
      raw[i][1] = (c[(i + m - 1) % m][1] + 2 * c[i][1] + c[(i + 1) % m][1]) / 4;
    }
  }
  // resample every metre
  const cum = [0];
  for (let i = 1; i <= raw.length; i++) {
    const a = raw[i - 1];
    const b = raw[i % raw.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[raw.length];
  const N = Math.round(total);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const d = (i / N) * total;
    while (cum[j + 1] < d) j++;
    const a = raw[j];
    const b = raw[(j + 1) % raw.length];
    const u = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
    px.push(a[0] + (b[0] - a[0]) * u);
    pz.push(a[1] + (b[1] - a[1]) * u);
  }
  const step = total / N;
  for (let i = 0; i < N; i++) th.push(Math.atan2(pz[(i + 1) % N] - pz[(i + N - 1) % N], px[(i + 1) % N] - px[(i + N - 1) % N]));
  for (let i = 0; i < N; i++) {
    let d = th[(i + 1) % N] - th[(i + N - 1) % N];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    kp.push(d / (2 * step));
  }
  // smooth the curvature a little
  for (let pass = 0; pass < 2; pass++) {
    const c = kp.slice();
    for (let i = 0; i < N; i++) kp[i] = (c[(i + N - 1) % N] + 2 * c[i] + c[(i + 1) % N]) / 4;
  }
}
build();

/** Length of the loop (m). */
export const MX_LEN = px.length;
const wrap = (s: number) => ((s % MX_LEN) + MX_LEN) % MX_LEN;
const lerpArr = (a: number[], s: number) => {
  const w = wrap(s);
  const i = Math.floor(w);
  const f = w - i;
  return a[i] + (a[(i + 1) % MX_LEN] - a[i]) * f;
};

/** Loop position, heading and curvature at arc length s. */
export function loopAt(s: number): { x: number; z: number; th: number; k: number } {
  const w = wrap(s);
  const i = Math.floor(w);
  const f = w - i;
  let a = th[i];
  let b = th[(i + 1) % MX_LEN];
  if (b - a > Math.PI) b -= 2 * Math.PI;
  if (a - b > Math.PI) b += 2 * Math.PI;
  return { x: lerpArr(px, s), z: lerpArr(pz, s), th: a + (b - a) * f, k: lerpArr(kp, s) };
}

// ---------------------------------------------------------------- features: the kit's dirt mounds

/**
 * v2.27: every jump of the track is a piece of the dirt park kit (a pure dirt mound), laid
 * across the track. The physics rides the measured profile of that very piece (kitData.ts),
 * stretched like the piece is: `sx` along the track, `sy` in height.
 */
export interface MxFeature {
  /** Index in KIT_MODULES. */
  mod: number;
  s0: number;
  len: number;
  /** Height of the piece on the track (m). */
  h: number;
  sx: number;
  sy: number;
  /** Centre of the piece on the ground (it is laid straight, the track may curve under it). */
  px: number;
  pz: number;
  pth: number;
}
export const MX_FEATURES: MxFeature[] = [];
/** Height of the biggest jumps of the track (m). */
const MX_JUMP_MAX = 3.2;
/** Kit pieces that are real tabletops (ramp, plateau, landing) and their height on the track (m). */
const MX_TABLES = [61, 65];
const MX_TABLE_H = 3.4;

/** One rise, one plateau, one fall: no sag between two crests (a double is not a table). */
function oneHump(p: number[]): boolean {
  const top = Math.max(...p);
  const a = p.findIndex((v) => v >= top - 0.05);
  const b = p.length - 1 - [...p].reverse().findIndex((v) => v >= top - 0.05);
  for (let i = 0; i < a; i++) if (p[i + 1] < p[i] - 0.15) return false;
  for (let i = b; i < p.length - 1; i++) if (p[i + 1] > p[i] + 0.15) return false;
  for (let i = a; i < b; i++) if (p[i] < top - 0.5) return false;
  return true;
}

/** Half-width of the flat top of a piece, as a fraction of its width (from the measured grid). */
function plateauFrac(m: { grid: number[]; profile: number[] }): number {
  if (!m.grid.length) return 0;
  const top = Math.max(...m.profile);
  const row = m.profile.indexOf(top);
  let j = 8;
  while (j < 16 && m.grid[row * 17 + j + 1] >= top * 0.9) j++;
  return m.grid[row * 17 + 8] >= top * 0.9 ? (j - 8) * 0.06 + 0.03 : 0;
}

/**
 * Pieces are stretched across the track so that their flat top covers the whole rideable width
 * (and a little more): the bike never rides on a rounded flank.
 */
export function mxLatScale(mod: number): number {
  const m = KIT_MODULES[mod];
  const q = plateauFrac(m);
  return q > 0 ? Math.min(1.8, Math.max(1, (MX_HALF_WIDTH + 0.5) / (q * m.wid))) : (MX_HALF_WIDTH * 2 + 0.6) / m.wid;
}

/** Kit pieces that make a jump: dirt only, flat at both ends, wide enough. */
export const KIT_JUMPS: number[] = KIT_MODULES.map((m, i) => ({ m, i }))
  .filter(({ m }) => m.mats.length === 1 && m.mats[0] === 'Dirt' && Math.abs(m.profile[0]) < 0.3 && Math.abs(m.profile[48]) < 0.3 && Math.max(...m.profile) >= 2.5 && m.wid >= 6 && m.edge <= 0.3 * Math.max(...m.profile) && oneHump(m.profile) && plateauFrac(m) >= 0.2)
  .map(({ i }) => i);

/** Height of a piece at its own coordinates: tp along (0..len), np across (m, from its axis). */
function gridHeight(f: MxFeature, tp: number, np: number): number {
  const g = KIT_MODULES[f.mod].grid;
  const u = Math.min(47.999, Math.max(0, (tp / f.len) * 48));
  const i = Math.floor(u);
  const a = u - i;
  const c = 8 + Math.min(0.999, Math.abs(np) / (KIT_MODULES[f.mod].wid * mxLatScale(f.mod)) / 0.48) * 8; // pieces are symmetric across
  const j = Math.min(15, Math.floor(c));
  const b = c - j;
  const at = (r: number, q: number) => g[r * 17 + q];
  const h0 = at(i, j) * (1 - b) + at(i, j + 1) * b;
  const h1 = at(i + 1, j) * (1 - b) + at(i + 1, j + 1) * b;
  return Math.max(0, h0 + (h1 - h0) * a) * f.sy;
}

/** Height of a piece at loop arc length s, n metres off the centre line (world-space, like the mesh). */
function featureHeight(f: MxFeature, s: number, n: number): number {
  const p = loopAt(s);
  const dx = p.x - Math.sin(p.th) * n - f.px;
  const dz = p.z + Math.cos(p.th) * n - f.pz;
  const c = Math.cos(f.pth);
  const sn = Math.sin(f.pth);
  return gridHeight(f, f.len / 2 + dx * c + dz * sn, -dx * sn + dz * c);
}

/** Track height above the base level at loop arc length s, n metres off the centre line. */
export function loopHeightN(s: number, n: number, cruise = false): number {
  const w = wrap(s);
  for (const f of cruise ? MX_FEATURES_CRUISE : MX_FEATURES) {
    let t = w - wrap(f.s0);
    if (t < 0) t += MX_LEN;
    if (t <= f.len) return featureHeight(f, s, n);
  }
  return 0;
}

/** The main straight: where the lap starts and where cruising joins and leaves the loop. */
export let MX_STRAIGHT: [number, number] = [0, 0];

/** Biggest gap tolerated between the track and a straight piece laid along it (m). */
const MX_MAX_DRIFT = 0.8;
/** How far the track strays sideways from a straight line through the middle of [s, s+len]. */
function pathDrift(s: number, len: number): number {
  const pm = loopAt(s + len / 2);
  const c = Math.cos(pm.th);
  const sn = Math.sin(pm.th);
  let d = 0;
  for (let t = 0; t <= len; t += 2) {
    const p = loopAt(s + t);
    d = Math.max(d, Math.abs(-(p.x - pm.x) * sn + (p.z - pm.z) * c));
  }
  return d;
}

interface PlaceCfg {
  tableH: number;
  jumpMax: number;
  slope: number;
  tableSlope: number;
  gap: number;
}
/** The cross circuit: big tabletops and jumps. */
const CFG_CROSS: PlaceCfg = { tableH: MX_TABLE_H, jumpMax: MX_JUMP_MAX, slope: 0.45, tableSlope: 0.36, gap: 8 };
/** Cruising rolls through the same track at a ride's pace: low rollers, long and gentle, well spaced. */
const CFG_CRUISE: PlaceCfg = { tableH: 1.3, jumpMax: 0.9, slope: 0.22, tableSlope: 0.2, gap: 30 };

/** True when no other part of the circuit passes under the (now wide) piece laid on [s, s+len]. */
function footprintClear(s: number, len: number, mod: number): boolean {
  const pm = loopAt(s + len / 2);
  const c = Math.cos(pm.th);
  const sn = Math.sin(pm.th);
  const halfW = (KIT_MODULES[mod].wid * mxLatScale(mod)) / 2 + 3;
  for (let i = 0; i < MX_LEN; i += 3) {
    const d = (((i - s) % MX_LEN) + MX_LEN) % MX_LEN;
    if (d < len + 12 || d > MX_LEN - 12) continue;
    const p = loopAt(i);
    const dx = p.x - pm.x;
    const dz = p.z - pm.z;
    if (Math.abs(dx * c + dz * sn) < len / 2 + 3 && Math.abs(-dx * sn + dz * c) < halfW) return false;
  }
  return true;
}

function place(out: MxFeature[], cfg: PlaceCfg): void {
  const straight = (i: number) => Math.abs(kp[wrap(i)]) < 0.012;
  const gentle = (i: number) => Math.abs(kp[wrap(i)]) < 0.02;
  const runsOf = (ok: (i: number) => boolean, min: number): [number, number][] => {
    const runs: [number, number][] = [];
    let i0 = 0;
    while (ok(i0)) i0--; // start scanning inside a turn
    for (let i = i0 + 1; i < i0 + 1 + MX_LEN; ) {
      if (!ok(i)) {
        i++;
        continue;
      }
      let j = i;
      while (ok(j) && j < i0 + 1 + MX_LEN) j++;
      if (j - i >= min) runs.push([i, j]);
      i = j;
    }
    return runs;
  };
  const mainRun = runsOf(straight, 22).find(([a, b]) => a <= 70 && b >= 70)!;
  MX_STRAIGHT = [mainRun[0], mainRun[1]];
  // the pieces, in a fixed shuffled order (big and small alternate along the lap)
  const order = KIT_JUMPS.slice().sort((a, b) => ((a * 7919) % 31) - ((b * 7919) % 31));
  let q = 0;
  for (const [a, b] of runsOf(gentle, 16).sort((x, y) => x[0] - y[0])) {
    const main = a <= MX_STRAIGHT[0] + 5 && b >= MX_STRAIGHT[1] - 5;
    let s = a + (main ? 42 : 5); // the start grid stays flat
    const end = b - (main ? 26 : 5); // and so does the fork to the exit lane
    let tries = 0;
    while (s < end - 9 && tries < order.length) {
      const mod = order[q % order.length];
      q++;
      const m = KIT_MODULES[mod];
      const top = Math.max(...m.profile);
      const ipk = m.profile.indexOf(top);
      // pieces with a gentle back face (real landing ramps) can be big; the ones that drop like a
      // cliff behind the crest stay smaller
      let drop = 0;
      for (let j = ipk; j < 48; j++) drop = Math.max(drop, m.profile[j] - m.profile[j + 1]);
      const gentle = (drop * 48) / m.len < 1.3;
      // tabletops: a ramp, a flat top at the height of the crest, then the inverted butte that lands
      // the jump. Those pieces (flat plateau, gentle faces) can be much bigger than the others.
      const table = MX_TABLES.includes(mod);
      const hBig = table ? cfg.tableH * (0.7 + 0.15 * ((q * 5) % 3)) : Math.min(gentle ? cfg.jumpMax : Math.min(2.3, cfg.jumpMax), Math.max(0.9, top * (gentle ? 0.5 : 0.3)));
      // no face (up or down) steeper than ~0.45 (24°): a short steep ramp throws the bike up like
      // a ski jump (lunar) and a steep back face is a wall. So the height sets the length; take the
      // biggest version of the piece that fits in the stretch.
      let step = 0;
      for (let j = 0; j < 48; j++) step = Math.max(step, Math.abs(m.profile[j + 1] - m.profile[j]));
      let h = hBig;
      let len = 0;
      let fits = false;
      for (const k of [1, 0.88, 0.76]) {
        h = Math.max(0.6, hBig * k);
        len = Math.max(m.len * 0.42, h * 8.5, (48 * step * (h / top)) / (table ? cfg.tableSlope : cfg.slope));
        // the piece is laid straight: the track must not curve away from it (it would leave the
        // module and the bike would ride beside it)
        if (len <= end - s && pathDrift(s, len) <= MX_MAX_DRIFT && footprintClear(s, len, mod)) {
          fits = true;
          break;
        }
      }
      if (!fits) {
        tries++;
        if (tries >= order.length) {
          s += 6; // slide along the stretch and try again further on
          tries = 0;
        }
        continue;
      }
      tries = 0;
      const pm = loopAt(s + len / 2);
      out.push({ mod, s0: s, len, h, sx: len / m.len, sy: h / top, px: pm.x, pz: pm.z, pth: pm.th });
      s += len + cfg.gap;
    }
  }
}
place(MX_FEATURES, CFG_CROSS);
/** Cruising: the same track, with low gentle rollers instead of the big jumps. */
export const MX_FEATURES_CRUISE: MxFeature[] = [];
place(MX_FEATURES_CRUISE, CFG_CRUISE);

/** Track height above the base level at loop arc length s (centre line). */
export function loopHeight(s: number, cruise = false): number {
  return loopHeightN(s, 0, cruise);
}

// ---------------------------------------------------------------- paths

export const MX_ENTRY = 70;
export const MX_EXIT = 70;
/** Cruising: entry lane, one lap plus the main straight, exit lane. */
export const MX_CRUISE_LOOP = MX_LEN + (MX_STRAIGHT[1] - MX_STRAIGHT[0]);
export const MX_ZONE_LEN = MX_ENTRY + MX_CRUISE_LOOP + MX_EXIT;

export interface MxPose {
  x: number;
  z: number;
  th: number;
  k: number;
  /** Height above the base level. */
  h: number;
  /** Loop arc length (NaN on the entry / exit lanes). */
  s: number;
}

/**
 * Pose at distance u along the path. `cruise`: u starts at the mouth of the entry lane;
 * otherwise u = 0 is the start of the main straight and the path just laps the loop.
 */
export function mxPose(u: number, cruise: boolean): MxPose {
  if (!cruise) {
    const s = MX_STRAIGHT[0] + u;
    const p = loopAt(s);
    return { ...p, h: loopHeight(s, cruise), s };
  }
  if (u < MX_ENTRY) {
    const p = loopAt(MX_STRAIGHT[0]);
    const d = u - MX_ENTRY;
    return { x: p.x + Math.cos(p.th) * d, z: p.z + Math.sin(p.th) * d, th: p.th, k: 0, h: 0, s: NaN };
  }
  if (u < MX_ENTRY + MX_CRUISE_LOOP) {
    const s = MX_STRAIGHT[0] + (u - MX_ENTRY);
    const p = loopAt(s);
    return { ...p, h: loopHeight(s, cruise), s };
  }
  const p = loopAt(MX_STRAIGHT[1]);
  const d = u - MX_ENTRY - MX_CRUISE_LOOP;
  return { x: p.x + Math.cos(p.th) * d, z: p.z + Math.sin(p.th) * d, th: p.th, k: 0, h: 0, s: NaN };
}

/** Height along the path (what the 2D physics rides on). */
export function mxPathHeight(u: number, cruise: boolean): number {
  if (!cruise) return loopHeight(MX_STRAIGHT[0] + u);
  if (u < MX_ENTRY || u >= MX_ENTRY + MX_CRUISE_LOOP) return 0;
  return loopHeight(MX_STRAIGHT[0] + (u - MX_ENTRY), true);
}

/** How much higher (or lower) the ground is n metres off the centre line at distance u. */
export function mxLateralDelta(u: number, cruise: boolean, n: number): number {
  let s: number;
  if (!cruise) s = MX_STRAIGHT[0] + u;
  else if (u < MX_ENTRY || u >= MX_ENTRY + MX_CRUISE_LOOP) return 0;
  else s = MX_STRAIGHT[0] + (u - MX_ENTRY);
  return loopHeightN(s, n, cruise) - loopHeightN(s, 0, cruise);
}
