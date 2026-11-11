import { Rng } from '../core/math';
import { INK } from '../render/palette';
import { ell, line, poly, Pt, rngFor, shade, sideGrad, sprite } from './paint';
import type { AssetDef } from './types';

/**
 * v2.7: 300 trial rocks to climb, 0.5 m → 2.5 m high.
 * 4 kinds of stone (one per world) × 3 shapes × 25 heights.
 *
 * The physical profile is what matters: the face you climb gets steeper as the rock grows
 * (40° for the small ones, 58° from 1.2 m), so a big rock needs grip and torque — the better
 * bikes of the garage pass where the weaker ones slide back down.
 */

export const ROCK_KINDS = ['granite', 'mousse', 'gres', 'ocre'] as const;
export type RockKind = (typeof ROCK_KINDS)[number];
const KIND_NAMES: Record<RockKind, string> = { granite: 'de granit', mousse: 'moussu', gres: 'de grès rouge', ocre: 'ocre' };
const SHAPES = ['bloc', 'dome', 'dalle'] as const;
const SHAPE_NAMES = { bloc: 'Bloc', dome: 'Dôme', dalle: 'Dalle' };
export const ROCK_STEPS = 25;
export const ROCK_MIN = 0.5;
export const ROCK_MAX = 2.5;

export function rockHeight(k: number): number {
  return ROCK_MIN + ((ROCK_MAX - ROCK_MIN) * k) / (ROCK_STEPS - 1);
}

/** Face angle (degrees) of the climbing side for a rock of height h. */
export function faceAngle(h: number): number {
  return h < 1.2 ? 40 + ((h - 0.5) / 0.7) * 18 : 58;
}

interface Geo {
  W: number;
  H: number;
  /** Height (m) at local x (m), 0 ≤ x ≤ W. */
  at: (x: number) => number;
}

function geometry(shape: (typeof SHAPES)[number], H: number, r: Rng): Geo {
  const tf = Math.tan((faceAngle(H) * Math.PI) / 180);
  const front = H / tf;
  const round = Math.min(0.18, H * 0.12); // rounded top edge of the face
  let top: number;
  let back: number;
  let topFn: (u: number) => number; // 0..1 along the top → height fraction
  switch (shape) {
    case 'bloc':
      top = 0.5 + H * 0.45 + r.range(0, 0.4);
      back = H / Math.tan((38 * Math.PI) / 180);
      topFn = (u) => 1 - 0.04 * Math.sin(u * Math.PI * 3) ** 2;
      break;
    case 'dome':
      top = 0.7 + H * 0.6 + r.range(0, 0.4);
      back = H / Math.tan((34 * Math.PI) / 180);
      topFn = (u) => 1 - 0.14 * u * u;
      break;
    default:
      top = 1 + H * 0.8 + r.range(0, 0.6);
      back = H * 0.7 / Math.tan((30 * Math.PI) / 180);
      topFn = (u) => 1 - 0.3 * u; // slab tilting down
      break;
  }
  const endH = H * topFn(1);
  if (shape === 'dalle') back = endH / Math.tan((30 * Math.PI) / 180);
  const W = front + top + back;
  return {
    W,
    H,
    at: (x) => {
      if (x <= 0 || x >= W) return 0;
      if (x < front) {
        // straight face, rounded into the top over the last few cm
        const y = x * tf;
        const edge = H - round;
        return y < edge ? y : edge + round * Math.sin(((y - edge) / round) * (Math.PI / 2) * 0.9 + 0.1);
      }
      if (x < front + top) return H * topFn((x - front) / top);
      return endH * (1 - (x - front - top) / back) ** 1.15;
    },
  };
}

const COLORS: Record<RockKind, { base: string[]; moss: string | null; strata: boolean }> = {
  granite: { base: ['#9a9ca6', '#8e9098', '#a6a4a0'], moss: null, strata: false },
  mousse: { base: ['#7e8088', '#86827a', '#76786e'], moss: '#4f9a3c', strata: false },
  gres: { base: ['#c8643a', '#b8583a', '#d07a4a'], moss: null, strata: true },
  ocre: { base: ['#d9a870', '#c8925a', '#e0b880'], moss: null, strata: true },
};

function drawRock(c: CanvasRenderingContext2D, g: Geo, kind: RockKind, r: Rng): void {
  const { W, H } = g;
  const col = r.pick(COLORS[kind].base);
  const N = 36;
  const pts: Pt[] = [[-W / 2, 0]];
  for (let i = 0; i <= N; i++) {
    const x = (W * i) / N;
    const wob = i > 0 && i < N ? r.range(-0.015, 0.015) * (1 + H) : 0;
    pts.push([x - W / 2, -(g.at(x) + wob)]);
  }
  pts.push([W / 2, 0]);
  poly(c, pts, sideGrad(c, -W / 2, W / 2, col), 0.05);
  c.save();
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) c.lineTo(p[0], p[1]);
  c.closePath();
  c.clip();
  // darker climbing face, lit top
  const tf = Math.tan((faceAngle(H) * Math.PI) / 180);
  poly(c, [[-W / 2, 0], [-W / 2 + H / tf, -H], [-W / 2 + H / tf + 0.15, -H], [-W / 2 + 0.15, 0]], 'rgba(0,0,0,0.18)', 0, null);
  ell(c, -W / 2 + H / tf + W * 0.18, -H * 0.97, W * 0.22, H * 0.06, 'rgba(255,255,255,0.22)', 0, null);
  if (COLORS[kind].strata) {
    for (let k = 1; k < 2 + H * 3; k++) {
      const y = -H * (k / (2 + H * 3)) + r.range(-0.03, 0.03);
      line(c, [[-W / 2, y], [W / 2, y + r.range(-0.08, 0.08)]], 'rgba(255,225,180,0.28)', 0.035 + H * 0.01, false);
    }
  }
  // cracks
  for (let k = 0; k < 1 + Math.round(H * 1.5); k++) {
    const x0 = r.range(-W * 0.3, W * 0.35);
    const y0 = -r.range(H * 0.3, H * 0.95);
    line(c, [[x0, y0], [x0 + r.range(-0.15, 0.15), y0 + r.range(0.2, 0.5) * H], [x0 + r.range(-0.2, 0.2), y0 + r.range(0.5, 0.8) * H]], shade(col, -0.35), 0.025, false);
  }
  // lichen spots / moss caps
  const moss = COLORS[kind].moss;
  for (let k = 0; k < 4 + H * 4; k++) {
    const x = r.range(-W * 0.4, W * 0.4);
    const y = -g.at(x + W / 2) * r.range(0.4, 0.98);
    ell(c, x, y, r.range(0.04, 0.1), r.range(0.03, 0.06), moss ? moss : kind === 'granite' ? 'rgba(220,210,120,0.55)' : 'rgba(120,70,40,0.3)', 0, null);
  }
  if (moss) for (let k = 0; k < 6 + H * 5; k++) {
    const x = r.range(-W * 0.2, W * 0.45);
    ell(c, x, -g.at(x + W / 2) + 0.03, r.range(0.08, 0.2), r.range(0.04, 0.08), shade(moss, r.range(-0.15, 0.15)), 0, null);
  }
  c.restore();
  // pebbles at the foot
  for (let k = 0; k < 3; k++) ell(c, r.range(-W / 2 - 0.2, W / 2 + 0.2), -0.04, r.range(0.05, 0.12), r.range(0.03, 0.06), shade(col, r.range(-0.2, 0.05)), 0.015, INK);
}

const out: AssetDef[] = [];
for (const kind of ROCK_KINDS)
  for (const shape of SHAPES)
    for (let k = 0; k < ROCK_STEPS; k++) {
      const id = `tr.rock.${kind}.${shape}.${k}`;
      const H = rockHeight(k);
      // geometry is deterministic per id (same rng sequence for physics and drawing)
      const g = geometry(shape, H, rngFor(id + ':geo'));
      out.push({
        id,
        name: `${SHAPE_NAMES[shape]} ${KIND_NAMES[kind]} ${Math.round(H * 100)} cm`,
        group: 'trial',
        slot: 'obstacle',
        weight: 1,
        obstacle: { w: g.W, h: H, profile: (u) => g.at(u * g.W) / H, tier: H < 1 ? 1 : H < 1.7 ? 2 : 3, rock: true },
        draw: () => sprite(g.W + 0.6, H + 0.15, (c) => drawRock(c, g, kind, rngFor(id))),
      });
    }

export const ROCK_ASSETS = out;

/** Stone of each world. */
export function rockKindFor(region: string): RockKind {
  return region === 'canyon' ? 'gres' : region === 'desert' ? 'ocre' : region === 'foret' ? 'mousse' : 'granite';
}
