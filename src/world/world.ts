import { clamp } from '../core/math';
import { Generator } from './generator';
import { REGIONS, RegionDef, RegionId } from './regions';
import { MX_CIRCUITS, mxLateralDelta, mxZoneLenOf } from '../mx/track';
import type { ModeId } from '../modes';
import { tyreBonus, Weather, weatherGrip } from '../weather';
import {
  Biome,
  Bridge,
  Coin,
  CHUNK_SAMPLES,
  DX,
  Pickup,
  Prop,
  Surface,
  TrackMark,
} from './types';

/** One storage block of the infinite heightfield. */
export interface Chunk {
  index: number;
  height: Float32Array; // physical surface (bridge decks included)
  visual: Float32Array; // ground silhouette (ravine bottoms under bridges)
  surface: Uint8Array;
  biome: Uint8Array;
}

export interface GroundHit {
  /** Penetration depth (positive = overlapping). */
  depth: number;
  nx: number;
  ny: number;
  /** Contact point on the surface. */
  px: number;
  py: number;
  surface: Surface;
}

/**
 * The infinite world: heightfield chunks, props, pickups and bridges. Content is produced lazily
 * by the {@link Generator} ahead of the player and discarded behind.
 */
export class World {
  readonly chunks = new Map<number, Chunk>();
  props: Prop[] = [];
  pickups: Pickup[] = [];
  coins: Coin[] = [];
  bridges: Bridge[] = [];
  marks: TrackMark[] = [];
  /** Circuits: x of the finish line, once the generator has placed it. */
  finishX = Infinity;
  private gen: Generator;

  readonly region: RegionDef;

  constructor(
    readonly seed: number,
    regionId: RegionId = 'alpes',
    readonly mode: ModeId = 'cruising',
    /** Course: championship level (race length, density). */
    readonly level = 1,
    /** Circuit number (1..25) for trial / enduro / course, 0 = endless. */
    readonly circuit = 0,
    /** 0 sec, 1 nuageux, 2 pluie (also the difficulty index). */
    readonly weather: Weather = 0,
  ) {
    this.region = REGIONS[regionId];
    this.gen = new Generator(this, seed, this.region, mode, level, circuit, weather);
  }

  // ---------------------------------------------------------------- motocross track (v2.26)
  /**
   * Stretches of the world that are the 3D motocross track: x range, base height, and whether
   * it is the cruising visit (entry lane, lap, exit lane) or the circuit itself (laps).
   */
  mxZones: { x0: number; x1: number; h0: number; cruise: boolean; circuit: number }[] = [];
  mxAt(x: number): { x0: number; x1: number; h0: number; cruise: boolean; circuit: number } | null {
    for (const z of this.mxZones) if (x >= z.x0 && x < z.x1) return z;
    return null;
  }

  // ---------------------------------------------------------------- cruising journey (v2.25)
  /**
   * Cruising crosses all the worlds: 1500 m per world (750 m of it alone, then 750 m sliding
   * into the next one), except the motocross track: one lap of a 3D circuit, entered and left all at once.
   */
  private stays: { x0: number; x1: number; id: RegionId; circuit: number }[] = [];
  private stayAt(x: number): number {
    const ids: RegionId[] = ['alpes', 'foret', 'canyon', 'desert', 'sf'];
    let i = 0;
    for (;;) {
      if (i >= this.stays.length) {
        const prev = this.stays[i - 1];
        let v = (this.seed ^ Math.imul(i + 3, 0x9e3779b1)) >>> 0;
        v = Math.imul(v ^ (v >>> 15), 0x85ebca6b) >>> 0;
        v = (v ^ (v >>> 13)) >>> 0;
        let id: RegionId;
        if (prev && prev.id !== 'cross' && v % 100 < 22) id = 'cross';
        else {
          const pool = ids.filter((q) => q !== prev?.id);
          id = pool[(v >>> 8) % pool.length];
        }
        const x0 = prev ? prev.x1 : 0;
        // the motocross visit rides one of the finished 3D circuits, drawn at random
        const circuit = id === 'cross' ? (v >>> 16) % MX_CIRCUITS.length : 0;
        this.stays.push({ x0, x1: x0 + (id === 'cross' ? mxZoneLenOf(circuit) : 1500), id, circuit });
      }
      if (x < this.stays[i].x1) return i;
      i++;
    }
  }

  /** Cruising: which 3D circuit the motocross visit at x rides. */
  crossCircuitAt(x: number): number {
    return this.stays[this.stayAt(Math.max(0, x))].circuit;
  }

  /** The world at x (cruising: the journey; other modes: the level's world). */
  regionAt(x: number): RegionDef {
    if (this.mode !== 'cruising') return this.region;
    const i = this.stayAt(Math.max(0, x));
    const s = this.stays[i];
    this.stayAt(s.x1 + 1);
    const next = this.stays[i + 1];
    // progressive change over the last 1000 m (patches of the next world, denser and denser)
    if (s.id !== 'cross' && next.id !== 'cross' && x > s.x1 - 750) {
      const t = (x - (s.x1 - 750)) / 750;
      const cell = Math.floor(x / 36);
      let h = (this.seed ^ Math.imul(cell + 11, 0x27d4eb2d)) >>> 0;
      h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
      if (((h ^ (h >>> 13)) >>> 0) % 1000 < t * t * (3 - 2 * t) * 1000) return REGIONS[next.id];
    }
    return REGIONS[s.id];
  }

  /** Cruising: the weather changes along the ride (every 2000 m). */
  dynamic = false;
  /** Tyre sets owned (dynamic weather picks the right one on the fly). */
  tyres: string[] = [];

  /**
   * Grip multiplier of a surface at x: weather and tyres, and the motocross track, whose dirt and
   * grass are loose, rutted soil (peak friction ~0.65 instead of the 1.05 of the other dirt).
   */
  gripK(s: Surface, x = 0): number {
    const loose = this.mxAt(x) && (s === Surface.Dirt || s === Surface.Grass) ? 0.62 : 1;
    return loose * this.weatherGripK(s, x);
  }
  private weatherGripK(s: Surface, x: number): number {
    if (!this.dynamic) return this.weather ? weatherGrip(this.weather, s) : 1;
    const w = this.weatherAt(x);
    let g = 1 + (weatherGrip(1, s) - 1) * w.wet;
    g += (weatherGrip(2, s) - g) * w.snowGround;
    return g * tyreBonus(this.tyres, (w.snowGround > 0.5 ? 2 : w.wet > 0.5 ? 1 : 0) as Weather);
  }

  /** Weather kind of the 2000 m stretch k (random, never the same twice in a row). */
  private kindOf(k: number): Weather {
    // v2.22: each 2000 m stretch: snow 10 % (none in the desert), rain 25 %, dry the rest
    let v = (this.seed ^ Math.imul(k + 7, 0x9e3779b1)) >>> 0;
    v = Math.imul(v ^ (v >>> 15), 0x85ebca6b) >>> 0;
    v = Math.imul(v ^ (v >>> 13), 0xc2b2ae35) >>> 0;
    const p = ((v ^ (v >>> 16)) >>> 0) % 1000 / 1000;
    const snow = this.regionAt(k * 1500 + 400).id === 'desert' ? 0 : 0.1;
    if (p < snow) return 2 as Weather;
    if (p < snow + 0.25) return 1 as Weather;
    return 0 as Weather;
  }

  private kindCache = new Map<number, Weather>();
  private kindAt(k: number): Weather {
    let v = this.kindCache.get(k);
    if (v === undefined) {
      v = this.kindOf(k);
      this.kindCache.set(k, v);
    }
    return v;
  }

  /**
   * Weather at x: what falls from the sky (rain, snow: 0..1) and the state of the ground
   * (wet, snow cover: 0..1). The sky changes first, the ground follows: rain then the ground
   * gets wet, snow falls then covers the ground little by little, then melts (wet) and dries.
   */
  weatherAt(x: number): { rain: number; snow: number; wet: number; snowGround: number; kind: Weather } {
    if (!this.dynamic) {
      const k = this.weather;
      return { rain: +(k === 1), snow: +(k === 2), wet: +(k === 1), snowGround: +(k === 2), kind: k };
    }
    const P = 1500;
    const k = Math.max(0, Math.floor(x / P));
    const t = x - k * P;
    const cur = this.kindAt(k);
    const prev = k > 0 ? this.kindAt(k - 1) : cur;
    const ease = (u: number) => {
      const c = Math.min(1, Math.max(0, u));
      return c * c * (3 - 2 * c);
    };
    const sky = ease(t / 150); // the sky changes over 150 m
    const rain = (prev === 1 ? 1 - sky : 0) + (cur === 1 ? sky : 0);
    const snow = (prev === 2 ? 1 - sky : 0) + (cur === 2 ? sky : 0);
    // ground lags behind the sky
    const s0 = prev === 2 ? 1 : 0;
    const w0 = prev === 1 ? 1 : 0;
    let snowGround: number;
    let wet: number;
    if (cur === 2) {
      snowGround = s0 + (1 - s0) * ease((t - 100) / 450); // flakes first, then a growing cover
      wet = w0 * (1 - ease(t / 300));
    } else {
      const melt = ease(t / 550);
      snowGround = s0 * (1 - melt);
      const meltWater = s0 * Math.sin(Math.PI * Math.min(1, t / 900)) * 0.9; // melting snow wets the ground
      wet = cur === 1 ? w0 + (1 - w0) * ease((t - 80) / 350) : w0 * (1 - ease(t / 450));
      wet = Math.max(wet, meltWater);
    }
    return { rain, snow, wet: Math.min(1, wet), snowGround, kind: cur };
  }

  /** True when x is over a bridge deck (no ground band drawn there). */
  bridgeAt(x: number): Bridge | null {
    for (const b of this.bridges) if (x >= b.x0 && x <= b.x1) return b;
    return null;
  }

  /** Make sure terrain exists up to x (m). */
  ensure(x: number): void {
    this.gen.generateUntil(Math.ceil(x / DX) + 2);
  }

  /** Drop data far behind the player to bound memory. */
  trim(xBehind: number): void {
    const minChunk = Math.floor(xBehind / DX / CHUNK_SAMPLES) - 1;
    for (const k of this.chunks.keys()) if (k < minChunk) this.chunks.delete(k);
    const minX = minChunk * CHUNK_SAMPLES * DX;
    if (this.props.length && this.props[0].x < minX) this.props = this.props.filter((p) => p.x >= minX);
    if (this.pickups.length && this.pickups[0].x < minX) this.pickups = this.pickups.filter((p) => p.x >= minX);
    if (this.coins.length && this.coins[0].x < minX) this.coins = this.coins.filter((p) => p.x >= minX);
    this.bridges = this.bridges.filter((b) => b.x1 >= minX);
    this.marks = this.marks.filter((m) => m.x1 >= minX);
  }

  /** Writes a sample (called by the generator, strictly increasing indices). */
  writeSample(i: number, h: number, vis: number, surf: Surface, biome: Biome): void {
    const ci = Math.floor(i / CHUNK_SAMPLES);
    let c = this.chunks.get(ci);
    if (!c) {
      c = {
        index: ci,
        height: new Float32Array(CHUNK_SAMPLES),
        visual: new Float32Array(CHUNK_SAMPLES),
        surface: new Uint8Array(CHUNK_SAMPLES),
        biome: new Uint8Array(CHUNK_SAMPLES),
      };
      this.chunks.set(ci, c);
    }
    const j = i - ci * CHUNK_SAMPLES;
    c.height[j] = h;
    c.visual[j] = vis;
    c.surface[j] = surf;
    c.biome[j] = biome;
  }

  private chunkFor(i: number): [Chunk | undefined, number] {
    const ci = Math.floor(i / CHUNK_SAMPLES);
    return [this.chunks.get(ci), i - ci * CHUNK_SAMPLES];
  }

  sampleHeight(i: number): number {
    const [c, j] = this.chunkFor(i);
    if (!c) {
      this.gen.generateUntil(i + 2);
      const [c2, j2] = this.chunkFor(i);
      return c2 ? c2.height[j2] : 0;
    }
    return c.height[j];
  }
  sampleVisual(i: number): number {
    const [c, j] = this.chunkFor(i);
    return c ? c.visual[j] : this.sampleHeight(i);
  }
  sampleSurface(i: number): Surface {
    const [c, j] = this.chunkFor(i);
    return c ? (c.surface[j] as Surface) : Surface.Dirt;
  }
  sampleBiome(i: number): Biome {
    const [c, j] = this.chunkFor(i);
    return c ? (c.biome[j] as Biome) : Biome.Meadow;
  }

  /** Interpolated physical height at x. */
  heightAt(x: number): number {
    const f = x / DX;
    const i = Math.floor(f);
    const t = f - i;
    const a = this.sampleHeight(i);
    const b = this.sampleHeight(i + 1);
    const h = a + (b - a) * t;
    if (this.mxLatN > 0.05 || this.mxLatN < -0.05) {
      const z = this.mxAt(x);
      if (z) return h + mxLateralDelta(x - z.x0, z.cruise, this.mxLatN);
    }
    return h;
  }
  /** Motocross: lateral position (m) of the rider whose physics is being stepped (mounds are lower at their sides). */
  mxLatN = 0;
  visualAt(x: number): number {
    const f = x / DX;
    const i = Math.floor(f);
    const t = f - i;
    return this.sampleVisual(i) * (1 - t) + this.sampleVisual(i + 1) * t;
  }
  surfaceAt(x: number): Surface {
    return this.sampleSurface(Math.round(x / DX));
  }
  biomeAt(x: number): Biome {
    return this.sampleBiome(Math.round(x / DX));
  }
  /** Ground slope angle at x (radians). */
  slopeAt(x: number): number {
    const a = this.heightAt(x - 0.6);
    const b = this.heightAt(x + 0.6);
    return Math.atan2(b - a, 1.2);
  }

  /**
   * Circle vs polyline query: returns the deepest contact for a circle of radius r centred at (x, y),
   * or null when not touching.
   */
  circleContact(x: number, y: number, r: number): GroundHit | null {
    // Centre below the surface (fast impacts): push out along the local segment normal.
    const fc = x / DX;
    const ic = Math.floor(fc);
    const hA = this.sampleHeight(ic);
    const hB = this.sampleHeight(ic + 1);
    const hc = hA + (hB - hA) * (fc - ic);
    if (y < hc) {
      const ex = DX;
      const ey = hB - hA;
      const len = Math.hypot(ex, ey);
      const nx = -ey / len;
      const ny = ex / len;
      return { depth: r + (hc - y) * ny, nx, ny, px: x, py: hc, surface: this.sampleSurface(Math.round(fc)) };
    }
    const i0 = Math.floor((x - r) / DX) - 1;
    const i1 = Math.ceil((x + r) / DX) + 1;
    let best: GroundHit | null = null;
    let ax = i0 * DX;
    let ay = this.sampleHeight(i0);
    for (let i = i0 + 1; i <= i1; i++) {
      const bx = i * DX;
      const by = this.sampleHeight(i);
      const ex = bx - ax;
      const ey = by - ay;
      const len2 = ex * ex + ey * ey;
      const t = clamp(((x - ax) * ex + (y - ay) * ey) / len2, 0, 1);
      const px = ax + ex * t;
      const py = ay + ey * t;
      const dx = x - px;
      const dy = y - py;
      const d = Math.hypot(dx, dy);
      const depth = r - d;
      if (depth > 0 && (!best || depth > best.depth)) {
        let nx = 0;
        let ny = 1;
        if (d > 1e-6) {
          nx = dx / d;
          ny = dy / d;
        }
        best = { depth, nx, ny, px, py, surface: this.sampleSurface(t < 0.5 ? i - 1 : i) };
      }
      ax = bx;
      ay = by;
    }
    return best;
  }
}
