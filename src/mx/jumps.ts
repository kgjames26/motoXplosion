/**
 * v2.46 — parametric jumps ("butes") of the 3D circuits.
 *
 * Pure data, no rendering. A jump is described by a tiny `JumpSpec` and the same function
 * (`jumpHeight`) feeds the physics and the mesh, so what you see is what you ride.
 *
 * To place a jump on a circuit, add one line to its `jumps` list in `track.ts`:
 *
 *   J.table(3.2, 26)      // table: ramp, flat top, landing. 3.2 m high, 26 m long
 *   J.single(1.6, 14)     // single: take-off ramp, gap, separate landing. 1.6 m, 14 m long
 *   J.double(2, 24)       // double: two gaps, a middle mound
 *   J.triple(2.4, 34)     // triple: three gaps, two middle mounds
 *
 * Height `h`: 0.5 m (rollers) to 5 m and more. Length `len`: 2 m (a kick) to 35 m and more
 * (when omitted, a natural length is computed from the height). Optional third argument
 * (`JumpOpt`) tunes the shape: take-off / landing slope, plateau, gap, landing height ratio.
 */

export type JumpKind = 'table' | 'single' | 'double' | 'triple';

export interface JumpOpt {
  /** Slope of the take-off lip (rise/run, default 0.5): steeper = more pop. */
  lip?: number;
  /** Steepest slope of a landing face (default 0.4): gentler = safer. */
  land?: number;
  /** Table: length of the flat top (m). Overrides the length-driven value. */
  plateau?: number;
  /** Gap between mounds (m). Overrides the length-driven value. */
  gap?: number;
  /** Height of the landing mound relative to the take-off (default 0.8). */
  landRatio?: number;
}

export interface JumpSpec extends JumpOpt {
  kind: JumpKind;
  /** Height of the take-off / tabletop (m). */
  h: number;
  /** Total length wanted (m); 0 = natural length. */
  len: number;
}

const mk = (kind: JumpKind) => (h: number, len = 0, o: JumpOpt = {}): JumpSpec => ({ kind, h, len, ...o });
export const J = { table: mk('table'), single: mk('single'), double: mk('double'), triple: mk('triple') };

/** Same jump, every dimension scaled (used to make a jump fit a short stretch). */
export function scaleJump(s: JumpSpec, k: number): JumpSpec {
  return { ...s, h: s.h * k, len: s.len * k, plateau: s.plateau === undefined ? undefined : s.plateau * k, gap: s.gap === undefined ? undefined : s.gap * k };
}

/** Half-width of the flat top across the track (m) and of the sloped skirt beyond it. */
export const JUMP_FLAT = 6;
export const JUMP_SKIRT = 2.5;
/** Half-width of the footprint of a jump on the ground (m). */
export const JUMP_HALF_W = JUMP_FLAT + JUMP_SKIRT;

interface Bump {
  at: number;
  up: number;
  flat: number;
  down: number;
  h: number;
  /** Rise shape exponent: >1 = concave ramp (steepest at the lip), 1 = smooth S. */
  pw: number;
}

const sstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

function bumpAt(b: Bump, t: number): number {
  if (t <= b.at || t >= b.at + b.up + b.flat + b.down) return 0;
  if (t < b.at + b.up) {
    const u = (t - b.at) / b.up;
    return b.h * (b.pw > 1 ? Math.pow(u, b.pw) : sstep(u));
  }
  if (t < b.at + b.up + b.flat) return b.h;
  return b.h * (1 - sstep((t - b.at - b.up - b.flat) / b.down));
}

const DX = 0.25;
interface Compiled {
  len: number;
  y: Float32Array;
}
const cache = new WeakMap<JumpSpec, Compiled>();

/** Mounds of a jump, laid from t=0, with the total length they need. */
function layout(s: JumpSpec): { bumps: Bump[]; len: number } {
  const h = Math.max(0.3, s.h);
  const lip = s.lip ?? 0.5;
  const land = s.land ?? 0.4;
  const ratio = s.landRatio ?? 0.8;
  const PW = 1.7;
  const build = (gap: number, plateau: number, k: number) => {
    const bumps: Bump[] = [];
    let t = 0;
    const take: Bump = {
      at: t,
      up: ((h * PW) / lip) * k,
      flat: s.kind === 'table' ? plateau : 0,
      down: s.kind === 'table' ? ((1.5 * h) / land) * k : Math.max(1.2, h * 1.1) * k,
      h,
      pw: PW,
    };
    bumps.push(take);
    t += take.up + take.flat + take.down;
    if (s.kind !== 'table') {
      const mids = s.kind === 'double' ? 1 : s.kind === 'triple' ? 2 : 0;
      for (let i = 0; i < mids; i++) {
        t += gap;
        const hm = h * 0.9;
        const m: Bump = { at: t, up: ((1.5 * hm) / 0.7) * k, flat: 0.4 * k, down: ((1.5 * hm) / 0.7) * k, h: hm, pw: 1 };
        bumps.push(m);
        t = m.at + m.up + m.flat + m.down;
      }
      t += gap;
      const hl = h * ratio;
      const lb: Bump = { at: t, up: ((1.5 * hl) / 0.7) * k, flat: 0.8 * k, down: ((1.5 * hl) / land) * k, h: hl, pw: 1 };
      bumps.push(lb);
      t = lb.at + lb.up + lb.flat + lb.down;
    }
    return { bumps, len: t };
  };
  const gaps = s.kind === 'single' ? 1 : s.kind === 'double' ? 2 : s.kind === 'triple' ? 3 : 0;
  const defGap = s.gap ?? Math.min(16, 2 + 3.2 * h);
  const defPlateau = s.plateau ?? Math.max(2, h * 3);
  let r = build(defGap, defPlateau, 1);
  if (s.len > 0) {
    if (s.len >= r.len) {
      // too short a design: the free parts (plateau or gaps) take up the slack
      if (s.kind === 'table') r = build(0, s.plateau ?? defPlateau + (s.len - r.len), 1);
      else r = build(s.gap ?? defGap + (s.len - r.len) / gaps, 0, 1);
    } else {
      // too long a design: first the free parts (gaps, plateau) give way, then the mounds shorten
      const k = Math.max(0.5, s.len / r.len);
      r = build(Math.max(0.8, defGap * k * k), defPlateau * k * k, k);
      if (r.len > s.len + 0.5) r = build(0.8, 0, k * (s.len / r.len));
    }
  }
  return r;
}

function compile(s: JumpSpec): Compiled {
  let c = cache.get(s);
  if (c) return c;
  const { bumps, len } = layout(s);
  const n = Math.ceil(len / DX) + 1;
  let y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const b of bumps) v = Math.max(v, bumpAt(b, i * DX));
    y[i] = v;
  }
  // round the crests and the foot of the ramps a little (a 0.75 m window, twice): no sharp edge
  for (let pass = 0; pass < 2; pass++) {
    const z = new Float32Array(n);
    for (let i = 0; i < n; i++) z[i] = (y[Math.max(0, i - 1)] + y[i] + y[Math.min(n - 1, i + 1)]) / 3;
    y = z;
  }
  // the rounding must not shave the crest: the jump keeps the height asked for
  let top = 0;
  for (let i = 0; i < n; i++) top = Math.max(top, y[i]);
  if (top > 0.01 && top < s.h) {
    const g = Math.min(1.3, s.h / top);
    for (let i = 0; i < n; i++) y[i] *= g;
  }
  c = { len, y };
  cache.set(s, c);
  return c;
}

/** Total length of a jump (m). */
export function jumpLength(s: JumpSpec): number {
  return compile(s).len;
}

/** Height along the jump axis only (t from 0 to the length, m). */
export function jumpProfile(s: JumpSpec, t: number): number {
  const c = compile(s);
  const u = Math.min(c.y.length - 1.001, Math.max(0, t / DX));
  const i = Math.floor(u);
  return c.y[i] + (c.y[i + 1] - c.y[i]) * (u - i);
}

/** Height at t along the jump (0..length) and n across (m from the axis). */
export function jumpHeight(s: JumpSpec, t: number, n: number): number {
  return jumpProfile(s, t) * (1 - sstep((Math.abs(n) - JUMP_FLAT) / JUMP_SKIRT));
}
