import { clamp } from '../core/math';
import { Generator } from './generator';
import {
  Biome,
  Bridge,
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
  bridges: Bridge[] = [];
  marks: TrackMark[] = [];
  private gen: Generator;

  constructor(readonly seed: number) {
    this.gen = new Generator(this, seed);
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
    return a + (b - a) * t;
  }
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
