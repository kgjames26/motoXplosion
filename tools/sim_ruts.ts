/**
 * Where do the bikes ride? Simulates many laps of every motocross circuit with a bot (racing line
 * from the track's curvature, a different rider style per lap) and writes how often each wheel
 * passed over each part of the ground: public/res/mx-ruts.json (ruts, polished lines, roost spots).
 *
 *   cd <dir with tsx> && npx tsx /path/to/tools/sim_ruts.ts
 */
import { writeFileSync } from 'node:fs';
import { Game } from '../src/game';
import { MX_CIRCUITS, MX_HALF_WIDTH, MX_LEN, mxPose, setMxCircuit } from '../src/mx/track';

const DS = 2; // m along the track per bin
const DN = 0.5; // m across per bin
const N0 = -5.5;
const COLS = 23; // -5.5 .. 5.5
const LAPS = 24;
const G = 9.81 * 1.55;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

function lap(c: number, style: number, D: Float32Array, S: Float32Array): { t: number; crashes: number } {
  const g: any = new Game({ mx: 'time', mxCircuit: c, region: 'cross', mode: 'enduro', circuit: c + 1, difficulty: 'facile' } as any);
  g.state = 'playing';
  g.countdown = 0;
  const rnd = (() => { let s = 1234 + style * 7919 + c * 31; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const skill = 0.72 + 0.28 * rnd();
  const off = (rnd() - 0.5) * 2.6; // preferred lane on the straights
  const ph = rnd() * 6.28;
  const dt = 1 / 120;
  let crashes = 0;
  let t = 0;
  while (t < 240 && !g.finished) {
    const b = g.bike;
    const z = g.world.mxAt(b.x);
    if (!z) break;
    const u = b.x - z.x0;
    const pose = mxPose(u, false);
    const v = Math.max(0, b.forwardSpeed);
    const kA = mxPose(u + 20, false).k;
    const kB = mxPose(u + 8, false).k;
    const mA = clamp(kA * 55, -1, 1);
    const mC = clamp(kB * 55, -1, 1);
    // racing line: wide in, inside at the apex; on the straights the rider's own lane, wandering a little
    const wander = Math.sin(u / 37 + ph) * 0.5;
    const straight = 1 - Math.max(Math.abs(mA), Math.abs(mC));
    const nT = clamp(MX_HALF_WIDTH * 0.72 * mC - MX_HALF_WIDTH * 0.5 * mA * (1 - Math.abs(mC)) + (off + wander) * straight, -MX_HALF_WIDTH + 0.9, MX_HALF_WIDTH - 0.9);
    const vmax = Math.sqrt((0.5 * skill * G) / Math.max(0.004, Math.max(Math.abs(kA), Math.abs(kB))));
    const vt = Math.min(22 * skill + 4, vmax);
    const th = clamp((vt - v) / 2.5, -1, 1);
    g.input.throttle = th > 0 ? th : 0;
    g.input.brake = th < 0 ? -th : 0;
    const vEff = Math.max(v, 1.5);
    const kMax = Math.min(0.32, (G * 0.95) / (vEff * vEff));
    const want = pose.k * v + (-g.mxPsi * 2.4 - (g.mxN - nT) * 0.35) * Math.min(1, v / 4);
    g.steer = clamp(want / vEff / kMax, -1, 1);
    const before = g.crashTimer;
    g.update(dt);
    t += dt;
    if (g.crashTimer > 0 && before <= 0) crashes++;
    if (g.crashTimer > 0 || !b.grounded || v < 1) continue;
    // both wheels leave their line in the ground
    const s = ((u % MX_LEN) + MX_LEN) % MX_LEN;
    const row = Math.floor(s / DS) % Math.ceil(MX_LEN / DS);
    const w = (v * dt) / DS;
    const sl = clamp(g.mxSlideR + g.mxSlideF + (g.input.throttle > 0.8 ? 0.15 : 0), 0, 1.5);
    for (const sgn of [-1, 1]) {
      const n = g.mxN + sgn * 0.74 * Math.sin(g.mxPsi);
      const f = (n - N0) / DN;
      const i0 = Math.floor(f);
      const a = f - i0;
      for (const [i, wt] of [[i0, 1 - a], [i0 + 1, a]] as [number, number][]) {
        if (i < 0 || i >= COLS) continue;
        D[row * COLS + i] += w * wt;
        S[row * COLS + i] += w * wt * sl;
      }
    }
  }
  return { t, crashes };
}

const out: any = { ds: DS, dn: DN, n0: N0, cols: COLS, circuits: [] };
for (let c = 0; c < MX_CIRCUITS.length; c++) {
  setMxCircuit(c);
  const rows = Math.ceil(MX_LEN / DS);
  const D = new Float32Array(rows * COLS);
  const S = new Float32Array(rows * COLS);
  let tot = 0, cr = 0;
  for (let l = 0; l < LAPS; l++) {
    const r = lap(c, l, D, S);
    tot += r.t;
    cr += r.crashes;
  }
  // smooth a little along the track and normalise to bytes
  const smooth = (A: Float32Array) => {
    const B = new Float32Array(A.length);
    for (let r = 0; r < rows; r++) for (let i = 0; i < COLS; i++) {
      let s = 0;
      for (const [dr, wt] of [[-1, 0.25], [0, 0.5], [1, 0.25]] as [number, number][]) s += A[((r + dr + rows) % rows) * COLS + i] * wt;
      B[r * COLS + i] = s;
    }
    return B;
  };
  const Ds = smooth(D), Ss = smooth(S);
  const q = (A: Float32Array, ref: number) => Buffer.from(Uint8Array.from(A, (x) => clamp(Math.round((x / ref) * 255), 0, 255))).toString('base64');
  const sorted = Array.from(Ds).filter((x) => x > 0).sort((a, b) => a - b);
  const refD = sorted[Math.floor(sorted.length * 0.96)] || 1;
  const sortedS = Array.from(Ss).filter((x) => x > 0).sort((a, b) => a - b);
  const refS = sortedS[Math.floor(sortedS.length * 0.96)] || 1;
  out.circuits.push({ id: MX_CIRCUITS[c].id, len: MX_LEN, rows, d: q(Ds, refD), s: q(Ss, refS) });
  console.log(MX_CIRCUITS[c].id, 'laps', LAPS, 'avg lap s', (tot / LAPS).toFixed(1), 'crashes', cr, 'refD', refD.toFixed(2));
}
writeFileSync(new URL('../public/res/mx-ruts.json', import.meta.url), JSON.stringify(out));
console.log('written', JSON.stringify(out).length, 'bytes');
