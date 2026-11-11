import { clamp, fbm1, noise1, Rng, smoothstep } from '../core/math';
import { Biome, DX, PropKind, Surface } from './types';
import type { World } from './world';
import { BridgeKind, RegionDef } from './regions';

/**
 * A terrain segment: a height profile relative to the height at its start.
 * Segments are chained so the track is always continuous.
 */
interface Segment {
  len: number;
  /** Height offset at local x (0..len). Must be 0 at x=0. */
  shape: (t: number) => number;
  /** Optional visual ground offset (ravines under bridges). Defaults to shape. */
  visual?: (t: number) => number;
  surface?: (t: number, x: number) => Surface;
  /** Local ranges where no pickup may spawn (pits, bridges...). */
  noPickup?: [number, number][];
  /** Called once when the segment starts, with its world start x and start height. */
  onStart?: (x0: number, h0: number) => void;
  /** Prop density multiplier for the track side. */
  props?: number;
}

type FeatureName =
  | 'tabletop'
  | 'double'
  | 'gap'
  | 'stepUp'
  | 'drop'
  | 'whoops'
  | 'rollers'
  | 'berm'
  | 'bridge'
  | 'ford'
  | 'climb'
  | 'descent'
  | 'logs'
  | 'rocks';

interface BiomeDef {
  length: [number, number];
  baseAmp: number;
  baseWave: number; // wavelength of base undulation (m)
  trend: number; // max |slope| of base stretches
  surface: Surface;
  features: Partial<Record<FeatureName, number>>;
  props: { kind: PropKind; weight: number }[];
  treeDensity: number;
}

const BIOMES: Record<Biome, BiomeDef> = {
  [Biome.Forest]: {
    length: [450, 750],
    baseAmp: 2.2,
    baseWave: 45,
    trend: 0.06,
    surface: Surface.Dirt,
    features: { tabletop: 3, double: 3, rollers: 3, whoops: 2, logs: 2, berm: 2, descent: 1, climb: 1, stepUp: 1, bridge: 1.5 },
    props: [
      { kind: 'pine', weight: 10 },
      { kind: 'pineDead', weight: 0.6 },
      { kind: 'bush', weight: 3 },
      { kind: 'rock', weight: 2 },
      { kind: 'stump', weight: 1 },
      { kind: 'log', weight: 1 },
      { kind: 'grass', weight: 4 },
      { kind: 'flower', weight: 1.5 },
    ],
    treeDensity: 1.0,
  },
  [Biome.Meadow]: {
    length: [400, 650],
    baseAmp: 3,
    baseWave: 70,
    trend: 0.05,
    surface: Surface.Dirt,
    features: { tabletop: 4, double: 3, rollers: 3, whoops: 2, berm: 2, stepUp: 1, drop: 1, bridge: 1 },
    props: [
      { kind: 'pine', weight: 3 },
      { kind: 'bush', weight: 3 },
      { kind: 'rock', weight: 3 },
      { kind: 'grass', weight: 8 },
      { kind: 'flower', weight: 6 },
      { kind: 'flag', weight: 0.3 },
    ],
    treeDensity: 0.4,
  },
  [Biome.Mountain]: {
    length: [450, 700],
    baseAmp: 4.5,
    baseWave: 55,
    trend: 0.16,
    surface: Surface.Dirt,
    features: { climb: 3, descent: 3, rocks: 3, drop: 2, stepUp: 2, bridge: 2, tabletop: 1, gap: 1 },
    props: [
      { kind: 'pine', weight: 6 },
      { kind: 'pineDead', weight: 1 },
      { kind: 'boulder', weight: 3 },
      { kind: 'rock', weight: 5 },
      { kind: 'grass', weight: 3 },
    ],
    treeDensity: 0.7,
  },
  [Biome.Canyon]: {
    length: [400, 650],
    baseAmp: 3.5,
    baseWave: 50,
    trend: 0.08,
    surface: Surface.Sand,
    features: { gap: 3, drop: 2, tabletop: 2, bridge: 2, rocks: 2, double: 2, stepUp: 1, whoops: 1 },
    props: [
      { kind: 'boulder', weight: 4 },
      { kind: 'rock', weight: 5 },
      { kind: 'cactus', weight: 2 },
      { kind: 'bush', weight: 1.5 },
      { kind: 'pineDead', weight: 0.6 },
    ],
    treeDensity: 0.15,
  },
  [Biome.River]: {
    length: [350, 550],
    baseAmp: 1.8,
    baseWave: 60,
    trend: 0.04,
    surface: Surface.Dirt,
    features: { bridge: 3, ford: 3, rollers: 2, whoops: 2, tabletop: 2, berm: 1 },
    props: [
      { kind: 'pine', weight: 6 },
      { kind: 'bush', weight: 4 },
      { kind: 'rock', weight: 3 },
      { kind: 'grass', weight: 6 },
      { kind: 'flower', weight: 3 },
    ],
    treeDensity: 0.8,
  },
};

/** Integral-based ease: smooth ramp from 0 to 1 with zero slope at both ends. */
const ease = (u: number): number => smoothstep(u);
const sin2 = (u: number): number => {
  const s = Math.sin(Math.PI * u);
  return s * s;
};

/**
 * Streams terrain samples into the world. First a landscape (biome + base undulation), then
 * motocross features layered on top: jumps, doubles, gaps, whoops, berms, bridges...
 */
export class Generator {
  private rng: Rng;
  private cursor = 0; // next sample index to write
  private queue: Segment[] = [];
  private seg: Segment | null = null;
  private segX0 = 0;
  private segH0 = 0;
  private biome: Biome = Biome.Meadow;
  private biomeEnd = 0;
  private nextFuel = 180;
  private nextWater = 120;
  private nextCheckpoint = 1000;
  private propsCursor = 0; // x up to which props have been spawned

  constructor(
    private world: World,
    seed: number,
    private region: RegionDef,
  ) {
    this.rng = new Rng(seed);
    this.biome = region.start;
    this.biomeEnd = 380;
    // A calm start straight.
    this.queue.push(this.flat(60, Surface.Dirt));
    this.world.marks.push({ x0: 6, x1: 10, kind: 'start' });
  }

  /** Difficulty 0..1 grows with distance. */
  private difficulty(x: number): number {
    return clamp(x / 5000, 0, 1);
  }

  generateUntil(sampleIndex: number): void {
    while (this.cursor <= sampleIndex) {
      if (!this.seg || this.cursor * DX - this.segX0 > this.seg.len) this.startNextSegment();
      const seg = this.seg!;
      const x = this.cursor * DX;
      const t = x - this.segX0;
      const off = seg.shape(Math.min(t, seg.len));
      const h = this.segH0 + off;
      const vis = this.segH0 + (seg.visual ? seg.visual(Math.min(t, seg.len)) : off);
      const surf = seg.surface ? seg.surface(t, x) : this.baseSurface(x);
      this.world.writeSample(this.cursor, h, vis, surf, this.biome);
      this.maybePickup(x, h, seg, t);
      this.cursor++;
    }
  }

  private startNextSegment(): void {
    if (this.seg) {
      this.segH0 = this.segH0 + this.seg.shape(this.seg.len);
      this.segX0 += this.seg.len;
    }
    if (this.queue.length === 0) this.plan();
    this.seg = this.queue.shift()!;
    this.seg.onStart?.(this.segX0, this.segH0);
    this.spawnProps(this.segX0, this.segX0 + this.seg.len, this.seg.props ?? 1);
  }

  /** Decide what comes next: maybe switch biome, then a base stretch and a feature. */
  private plan(): void {
    const x = this.segX0;
    if (x >= this.biomeEnd) {
      // stay in the region: pick another of its environments
      const all = (Object.keys(this.region.biomes) as unknown as string[]).map((k) => Number(k) as Biome);
      const options = all.length > 1 ? all.filter((b) => b !== this.biome) : all;
      this.biome = this.rng.weighted(options, options.map((b) => this.region.biomes[b]!));
      const def = BIOMES[this.biome];
      this.biomeEnd = x + this.rng.range(def.length[0], def.length[1]);
      // Smooth transition stretch.
      this.queue.push(this.base(this.rng.range(30, 45), 0.5));
    }
    this.queue.push(this.base(this.rng.range(18, 50), 1));
    const def = BIOMES[this.biome];
    const names = Object.keys(def.features) as FeatureName[];
    const weights = names.map((n) => def.features[n]!);
    const f = this.rng.weighted(names, weights);
    this.queue.push(...this.feature(f, this.difficulty(x)));
    if (x + 120 > this.nextCheckpoint) {
      const cx = this.nextCheckpoint;
      this.world.marks.push({ x0: cx, x1: cx + 2, kind: 'checkpoint' });
      this.nextCheckpoint += 1000;
    }
  }

  private baseSurface(x: number): Surface {
    const def = BIOMES[this.biome];
    const n = noise1(x / 23, 77);
    switch (this.biome) {
      case Biome.Canyon:
        return n > 0.45 ? Surface.Rock : Surface.Sand;
      case Biome.Mountain:
        return n > 0.4 ? Surface.Rock : n < -0.6 ? Surface.Grass : Surface.Dirt;
      case Biome.River:
        return n > 0.5 ? Surface.Mud : Surface.Dirt;
      case Biome.Meadow:
        return n < -0.55 ? Surface.Grass : Surface.Dirt;
      default:
        return n > 0.62 ? Surface.Mud : def.surface;
    }
  }

  // ---------------------------------------------------------------- segments

  private flat(len: number, surf?: Surface): Segment {
    return { len, shape: () => 0, surface: surf !== undefined ? () => surf : undefined };
  }

  /** Natural ground: biome undulation plus a gentle trend that keeps altitude bounded. */
  private base(len: number, ampScale: number): Segment {
    const def = BIOMES[this.biome];
    const seed = this.rng.int(0, 1e6);
    const pull = clamp(-this.segH0 / 260, -0.08, 0.08);
    const trend = clamp(this.rng.range(-def.trend, def.trend) + pull, -0.22, 0.22);
    const amp = def.baseAmp * ampScale;
    const wave = def.baseWave;
    const n0 = fbm1(0, seed, 4);
    return {
      len,
      shape: (t) => {
        const fade = smoothstep(t / 8);
        return trend * t + amp * (fbm1(t / wave, seed, 4) - n0) * fade;
      },
    };
  }

  private feature(name: FeatureName, d: number): Segment[] {
    const r = this.rng;
    switch (name) {
      case 'tabletop': {
        const H = r.range(1.4, 2.4) + d * 1.4;
        const Lr = H * r.range(2.6, 3.4);
        const top = r.range(7, 13);
        const Ld = H * r.range(5, 6.5);
        const len = Lr + top + Ld;
        return [
          this.flat(4),
          {
            len,
            shape: (t) => {
              if (t < Lr) return H * Math.pow(t / Lr, 1.4);
              if (t < Lr + top) return H;
              return H * (1 - ease((t - Lr - top) / Ld));
            },
            surface: () => Surface.Dirt,
            onStart: (x0) => this.world.marks.push({ x0, x1: x0 + Lr, kind: 'kicker' }),
            props: 0.6,
          },
        ];
      }
      case 'double':
      case 'gap': {
        const gap = name === 'gap';
        const H = r.range(1.5, 2.3) + d * 1.2;
        const Lr = H * r.range(2.4, 3);
        const down = gap ? r.range(2, 3.5) + d * 2 : 0;
        const fall = (H + down) / 1.3;
        const G = gap ? r.range(2, 5) : r.range(3, 7) + d * 3;
        const H2 = H * r.range(0.8, 1.0);
        const rise = (H2 + down) / 1.3;
        const roundTop = 1.5;
        const Ld = H2 * r.range(5, 6.5);
        const a = Lr;
        const b = a + fall;
        const c = b + G;
        const e = c + rise;
        const f = e + roundTop;
        const len = f + Ld;
        return [
          this.flat(5),
          {
            len,
            shape: (t) => {
              if (t < a) return H * Math.pow(t / a, 1.4);
              if (t < b) return H - (H + down) * ease((t - a) / fall);
              if (t < c) return -down;
              if (t < e) return -down + (H2 + down) * ease((t - c) / rise);
              if (t < f) return H2;
              return H2 * (1 - ease((t - f) / Ld));
            },
            surface: (t) => (gap && t > a && t < e ? Surface.Rock : Surface.Dirt),
            noPickup: [[a - 2, f]],
            onStart: (x0) => this.world.marks.push({ x0, x1: x0 + Lr, kind: 'kicker' }),
            props: 0.4,
          },
        ];
      }
      case 'stepUp': {
        const H = r.range(1.2, 2.2) + d;
        const L = H * 1.6;
        return [
          this.flat(4),
          { len: L + 6, shape: (t) => (t < L ? H * ease(t / L) : H), props: 0.7 },
        ];
      }
      case 'drop': {
        const kick = 0.5;
        const D = r.range(2, 3.5) + d * 2;
        const lipLen = 3;
        const faceLen = D / 0.75;
        const runout = 8;
        return [
          this.flat(6),
          {
            len: lipLen + faceLen + runout,
            shape: (t) => {
              if (t < lipLen) return kick * Math.sin((Math.PI / 2) * (t / lipLen));
              if (t < lipLen + faceLen) return kick - (kick + D) * ease((t - lipLen) / faceLen);
              return -D;
            },
            noPickup: [[lipLen - 1, lipLen + faceLen]],
            props: 0.6,
          },
        ];
      }
      case 'whoops': {
        const n = r.int(6, 11);
        const s = r.range(3.2, 4.4);
        const a = r.range(0.35, 0.6) + d * 0.25;
        return [
          {
            len: n * s,
            shape: (t) => a * sin2(t / s),
            onStart: (x0) => this.world.marks.push({ x0, x1: x0 + n * s, kind: 'whoops' }),
            surface: () => Surface.Dirt,
          },
        ];
      }
      case 'rollers': {
        const n = r.int(3, 5);
        const s = r.range(9, 13);
        const a = r.range(0.9, 1.5) + d * 0.5;
        return [{ len: n * s, shape: (t) => a * sin2(t / s) }];
      }
      case 'berm': {
        const L = r.range(16, 22);
        return [
          {
            len: L,
            shape: (t) => 0.7 * sin2(t / L),
            surface: () => Surface.Dirt,
            onStart: (x0) => this.world.marks.push({ x0, x1: x0 + L, kind: 'berm' }),
          },
        ];
      }
      case 'bridge': {
        const kinds = Object.keys(this.region.bridges) as BridgeKind[];
        const kind = r.weighted(kinds, kinds.map((k) => this.region.bridges[k]!));
        const water = this.biome === Biome.River || r.chance(kind === 'viaduct' ? 0.4 : 0.5);
        let L: number;
        let D: number;
        let sag: number;
        let spans: number;
        switch (kind) {
          case 'wood':
            L = r.range(16, 30);
            D = water ? r.range(3.5, 5) : r.range(5, 9);
            sag = Math.min(0.5, L / 60);
            spans = 1;
            break;
          case 'stone':
            spans = r.int(1, 3);
            L = spans * r.range(9, 13);
            D = water ? r.range(4, 6) : r.range(5, 9);
            sag = -r.range(0.5, 0.9); // humpback deck
            break;
          case 'iron':
            spans = r.int(1, 3);
            L = spans * r.range(14, 18);
            D = water ? r.range(5, 7) : r.range(7, 12);
            sag = 0;
            break;
          case 'viaduct':
          default:
            spans = r.int(4, 7);
            L = spans * r.range(10, 13);
            D = r.range(15, 24);
            sag = 0;
            break;
        }
        const approach = 4;
        const total = approach * 2 + L;
        const cliff = kind === 'viaduct' ? 10 : 3;
        return [
          this.flat(6),
          {
            len: total,
            shape: (t) => {
              if (t < approach || t > approach + L) return 0;
              const u = (t - approach) / L;
              if (sag < 0) {
                // stone humpback: smooth ramps on and off the arch
                return -sag * Math.sin(Math.PI * u) ** 1.5;
              }
              return -sag * Math.sin(Math.PI * u);
            },
            visual: (t) => {
              const u = t - approach;
              const wall = smoothstep(u / cliff) * smoothstep((L - u) / cliff);
              // V-shaped valley for viaducts, steep gorge otherwise
              const shape = kind === 'viaduct' ? Math.sin(Math.PI * clamp(u / L, 0, 1)) ** 0.6 : 1;
              const rough = noise1(t * 0.7, 9) * 0.6;
              return -(D * shape + rough) * wall;
            },
            surface: (t) =>
              t > approach && t < approach + L ? (kind === 'stone' || kind === 'viaduct' ? Surface.Rock : Surface.Wood) : Surface.Dirt,
            noPickup: [[approach - 1, approach + L + 1]],
            onStart: (x0, h0) =>
              this.world.bridges.push({
                kind,
                x0: x0 + approach,
                x1: x0 + approach + L,
                deckY0: h0,
                deckY1: h0,
                floorY: h0 - D,
                water,
                sag,
                spans,
              }),
            props: 0.3,
          },
          this.flat(5),
        ];
      }
      case 'ford': {
        const L = r.range(9, 14);
        const depth = r.range(0.4, 0.7);
        return [
          this.flat(3),
          {
            len: L,
            shape: (t) => -depth * sin2(t / L),
            surface: (t) => (t > 1.5 && t < L - 1.5 ? Surface.Water : Surface.Mud),
            onStart: (x0) => this.world.marks.push({ x0, x1: x0 + L, kind: 'ford' }),
            props: 0.5,
          },
        ];
      }
      case 'climb':
      case 'descent': {
        const L = r.range(35, 70);
        const s = (name === 'climb' ? 1 : -1) * (r.range(0.14, 0.26) + d * 0.08);
        const amp = BIOMES[this.biome].baseAmp * 0.4;
        const seed = r.int(0, 1e5);
        return [
          {
            len: L,
            shape: (t) => s * L * ease(t / L) + amp * fbm1(t / 18, seed, 3) * sin2(t / L),
          },
        ];
      }
      case 'logs': {
        const n = r.int(1, 3);
        const spacing = r.range(5, 8);
        const L = n * spacing + 2;
        const bumps: number[] = [];
        for (let i = 0; i < n; i++) bumps.push(2 + i * spacing);
        return [
          {
            len: L,
            shape: (t) => {
              for (const bx of bumps) {
                const u = (t - bx) / 0.45;
                if (u > -1 && u < 1) return 0.38 * Math.sqrt(1 - u * u);
              }
              return 0;
            },
            onStart: (x0) => {
              for (const bx of bumps)
                this.world.props.push({ x: x0 + bx, kind: 'log', depth: 0, scale: 1, variant: 0, flip: false });
            },
          },
        ];
      }
      case 'rocks': {
        const L = r.range(14, 24);
        const bumps: [number, number, number][] = [];
        for (let x = 1.5; x < L - 1.5; x += r.range(1.4, 3)) bumps.push([x, r.range(0.12, 0.38) + d * 0.1, r.range(0.5, 1.1)]);
        return [
          {
            len: L,
            shape: (t) => {
              let y = 0;
              for (const [bx, bh, bw] of bumps) {
                const u = (t - bx) / bw;
                if (u > -1 && u < 1) y = Math.max(y, bh * (0.5 + 0.5 * Math.cos(Math.PI * u)));
              }
              return y;
            },
            surface: () => Surface.Rock,
          },
        ];
      }
    }
  }

  // ---------------------------------------------------------------- content

  private maybePickup(x: number, h: number, seg: Segment, t: number): void {
    const blocked = seg.noPickup?.some(([a, b]) => t >= a && t <= b) ?? false;
    if (blocked) return;
    const d = this.difficulty(x);
    if (x >= this.nextFuel) {
      this.world.pickups.push({ x, y: h + 1.0, kind: 'fuel', taken: false, takenAt: 0 });
      this.nextFuel = x + this.rng.range(230, 420) + d * 160;
      if (Math.abs(this.nextFuel - this.nextWater) < 40) this.nextWater += 60;
    } else if (x >= this.nextWater) {
      this.world.pickups.push({ x, y: h + 1.0, kind: 'water', taken: false, takenAt: 0 });
      this.nextWater = x + this.rng.range(200, 380) + d * 160;
      if (Math.abs(this.nextFuel - this.nextWater) < 40) this.nextFuel += 60;
    }
  }

  /** Scatter decor for [x0, x1): trees and rocks behind the track, grass and stones in front. */
  private spawnProps(x0: number, x1: number, density: number): void {
    const start = Math.max(x0, this.propsCursor);
    if (x1 <= start) return;
    this.propsCursor = x1;
    const def = BIOMES[this.biome];
    const r = this.rng;
    const kinds = def.props.map((p) => p.kind);
    const weights = def.props.map((p) => p.weight);
    // Background band (behind the track).
    for (let x = start; x < x1; x += r.range(1.2, 3.5) / Math.max(0.2, density)) {
      let kind = r.weighted(kinds, weights);
      if ((kind === 'pine' || kind === 'pineDead') && !r.chance(def.treeDensity)) kind = 'bush';
      if (kind === 'log' && r.chance(0.5)) kind = 'stump';
      const big = kind === 'pine' || kind === 'pineDead' || kind === 'boulder' || kind === 'cactus';
      this.world.props.push({
        x: x + r.range(-0.5, 0.5),
        kind,
        depth: big ? r.range(0.15, 1) : r.range(0.05, 0.5),
        scale: r.range(0.75, 1.3),
        variant: r.int(0, 3),
        flip: r.chance(0.5),
      });
    }
    // Foreground band (in front of the track, drawn over the bike's lane).
    for (let x = start; x < x1; x += r.range(2.5, 6)) {
      const kind: PropKind = this.biome === Biome.Canyon ? (r.chance(0.7) ? 'rock' : 'grass') : r.weighted(['grass', 'rock', 'flower'], [5, 2, 3]);
      this.world.props.push({
        x,
        kind,
        depth: -r.range(0.2, 1),
        scale: r.range(0.8, 1.4),
        variant: r.int(0, 3),
        flip: r.chance(0.5),
      });
    }
    this.world.props.sort((a, b) => a.x - b.x);
  }
}
