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

// ---------------------------------------------------------------- features (height profile)

export type MxFeature = { kind: 'table' | 'double' | 'whoops' | 'rollers'; s0: number; len: number; h: number; lip: number };
export const MX_FEATURES: MxFeature[] = [];
const hgt = new Float32Array(MX_LEN);
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function shape(f: MxFeature, t: number): number {
  const H = f.h;
  if (f.kind === 'table') {
    const Lr = f.lip;
    const Ld = H * 5.2;
    const top = f.len - Lr - Ld;
    if (t < Lr) return H * Math.pow(t / Lr, 1.3);
    if (t < Lr + top) return H;
    return H * (1 - ease((t - Lr - top) / Ld));
  }
  if (f.kind === 'double') {
    const Lr = f.lip;
    const fall = H * 1.3;
    const gap = f.len - Lr - fall - H * 1.2 - 1.2 - H * 5;
    const a = Lr;
    const b = a + fall;
    const c = b + gap;
    const e = c + H * 1.2;
    const g = e + 1.2;
    if (t < a) return H * Math.pow(t / a, 1.3);
    if (t < b) return H * (1 - ease((t - a) / fall));
    if (t < c) return 0;
    if (t < e) return H * 0.9 * ease((t - c) / (H * 1.2));
    if (t < g) return H * 0.9;
    return H * 0.9 * (1 - ease((t - g) / (H * 5)));
  }
  const lam = f.kind === 'whoops' ? 3.4 : 9;
  const fade = Math.min(1, t / lam, (f.len - t) / lam);
  return (H * (1 - Math.cos((2 * Math.PI * t) / lam)) * fade) / 2;
}

/** The main straight: where the lap starts and where cruising joins and leaves the loop. */
export let MX_STRAIGHT: [number, number] = [0, 0];

function place(): void {
  const straight = (i: number) => Math.abs(kp[wrap(i)]) < 0.012;
  // stretches of straight track
  const runs: [number, number][] = [];
  let i0 = 0;
  while (straight(i0)) i0--; // start scanning inside a turn
  for (let i = i0 + 1; i < i0 + 1 + MX_LEN; ) {
    if (!straight(i)) {
      i++;
      continue;
    }
    let j = i;
    while (straight(j) && j < i0 + 1 + MX_LEN) j++;
    if (j - i >= 22) runs.push([i, j]);
    i = j;
  }
  // the main straight is the one the loop starts on
  const mainRun = runs.find(([a, b]) => a <= 70 && b >= 70) ?? runs[0];
  MX_STRAIGHT = [mainRun[0], mainRun[1]];
  const kinds: MxFeature['kind'][] = ['table', 'whoops', 'double', 'rollers', 'table', 'double', 'whoops', 'table'];
  let q = 0;
  for (const [a, b] of runs.sort((x, y) => x[0] - y[0])) {
    const main = a === MX_STRAIGHT[0];
    let s = a + (main ? 42 : 7); // the start grid stays flat
    const end = b - (main ? 26 : 7); // and so does the fork to the exit lane
    while (s < end - 14) {
      const kind = kinds[q % kinds.length];
      const room = end - s;
      let f: MxFeature | null = null;
      if (kind === 'table') {
        const h = Math.min(2.2, 1.3 + (q % 3) * 0.4);
        const len = h * 4.4 + 8 + (q % 2) * 3 + h * 5.2;
        if (len <= room) f = { kind, s0: s, len, h, lip: h * 4.4 };
      } else if (kind === 'double') {
        const h = 1.5 + (q % 2) * 0.3;
        const len = h * 4.2 + h * 1.3 + 4.5 + h * 1.2 + 1.2 + h * 5;
        if (len <= room) f = { kind, s0: s, len, h, lip: h * 4.2 };
      } else if (kind === 'whoops') {
        const len = Math.min(room, 3.4 * 7);
        if (len >= 3.4 * 4) f = { kind, s0: s, len, h: 0.55, lip: 0 };
      } else {
        const len = Math.min(room, 9 * 3);
        if (len >= 18) f = { kind, s0: s, len, h: 1.0, lip: 0 };
      }
      q++;
      if (!f) {
        // nothing of this kind fits: try a row of whoops in what is left, then stop
        if (room >= 18 && q % 2) MX_FEATURES.push({ kind: 'rollers', s0: s, len: Math.floor(room / 9) * 9, h: 0.9, lip: 0 });
        else if (room >= 14) MX_FEATURES.push({ kind: 'whoops', s0: s, len: Math.floor(room / 3.4) * 3.4, h: 0.5, lip: 0 });
        break;
      }
      MX_FEATURES.push(f);
      s += f.len + 9;
    }
  }
  for (const f of MX_FEATURES) for (let t = 0; t <= f.len; t++) hgt[wrap(Math.round(f.s0 + t))] = 0;
}
place();

/** Track height above the base level at loop arc length s. */
export function loopHeight(s: number): number {
  const w = wrap(s);
  for (const f of MX_FEATURES) {
    let t = w - wrap(f.s0);
    if (t < 0) t += MX_LEN;
    if (t <= f.len) return shape(f, t);
  }
  return 0;
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
    return { ...p, h: loopHeight(s), s };
  }
  if (u < MX_ENTRY) {
    const p = loopAt(MX_STRAIGHT[0]);
    const d = u - MX_ENTRY;
    return { x: p.x + Math.cos(p.th) * d, z: p.z + Math.sin(p.th) * d, th: p.th, k: 0, h: 0, s: NaN };
  }
  if (u < MX_ENTRY + MX_CRUISE_LOOP) {
    const s = MX_STRAIGHT[0] + (u - MX_ENTRY);
    const p = loopAt(s);
    return { ...p, h: loopHeight(s), s };
  }
  const p = loopAt(MX_STRAIGHT[1]);
  const d = u - MX_ENTRY - MX_CRUISE_LOOP;
  return { x: p.x + Math.cos(p.th) * d, z: p.z + Math.sin(p.th) * d, th: p.th, k: 0, h: 0, s: NaN };
}

/** Height along the path (what the 2D physics rides on). */
export function mxPathHeight(u: number, cruise: boolean): number {
  if (!cruise) return loopHeight(MX_STRAIGHT[0] + u);
  if (u < MX_ENTRY || u >= MX_ENTRY + MX_CRUISE_LOOP) return 0;
  return loopHeight(MX_STRAIGHT[0] + (u - MX_ENTRY));
}
