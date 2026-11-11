import { Ctx, ell, line, poly, rect, rngFor, shade, sideGrad, sprite } from './paint';
import type { Rng } from '../core/math';
import type { AssetDef } from './types';

/**
 * v2.14: 100 trial supports — wide, flat bases of different sizes (0.3 → 1.2 m high, 3 → 6 m
 * wide) that the other modules stand on. The generator climbs onto them with module steps,
 * puts crates, blocks or a second support on top and builds bigger structures with them
 * (see Generator.moduleStructure, "plateforme" pattern).
 *
 * Faces are chamfered like the modules, so adjacent blocks chain without a trap.
 */

export type SupportKind = 'bois' | 'beton' | 'acier' | 'palettes' | 'pierre';
export const SUPPORT_HEIGHTS = [0.3, 0.45, 0.6, 0.9, 1.2];
export const SUPPORT_WIDTHS = [3, 4, 5, 6];
const NAMES: Record<SupportKind, string> = { bois: 'Socle bois', beton: 'Socle béton', acier: 'Châssis acier', palettes: 'Base palettes', pierre: 'Socle pierre' };

export function supportRun(w: number, h: number): number {
  return Math.min(w / 3, h * 0.52);
}

const out: AssetDef[] = [];

function face(c: Ctx, w: number, h: number, fill: string | CanvasGradient): void {
  const run = supportRun(w, h);
  poly(c, [[-w / 2, 0], [-w / 2 + run, -h], [w / 2 - run, -h], [w / 2, 0]], fill, 0.05);
}

const DRAW: Record<SupportKind, (c: Ctx, r: Rng, w: number, h: number) => void> = {
  bois: (c, r, w, h) => {
    const col = r.pick(['#b8824a', '#c8955a']);
    face(c, w, h, sideGrad(c, -w / 2, w / 2, col));
    for (let y = -0.15; y > -h + 0.06; y -= 0.15) line(c, [[-w / 2 + supportRun(w, h) * (-y / h) + 0.05, y], [w / 2 - supportRun(w, h) * (-y / h) - 0.05, y]], shade(col, -0.3), 0.02, false);
    // cross bracing every metre
    for (let x = -w / 2 + 0.8; x < w / 2 - 0.8; x += 1) line(c, [[x, -0.05], [x + 0.7, -h + 0.07]], shade(col, -0.22), 0.035, false);
    rect(c, -w / 2 + supportRun(w, h) - 0.02, -h, w - 2 * supportRun(w, h) + 0.04, 0.06, '#e6e2d8', 0.015);
  },
  beton: (c, r, w, h) => {
    const col = r.pick(['#a8a49c', '#9a9aa2']);
    face(c, w, h, sideGrad(c, -w / 2, w / 2, col));
    for (let x = -w / 2 + 1; x < w / 2 - 0.5; x += 1) line(c, [[x, -0.03], [x, -h + 0.05]], shade(col, -0.18), 0.015, false);
    for (let q = 0; q < Math.round(w * 2); q++) ell(c, r.range(-w / 2.6, w / 2.6), -r.range(0.05, h - 0.05), 0.03, 0.03, shade(col, -0.2), 0, null);
    // yellow/black edge on the top
    const run = supportRun(w, h);
    for (let x = -w / 2 + run; x < w / 2 - run - 0.2; x += 0.4) rect(c, x, -h, 0.2, 0.06, '#ffd21f', 0.008);
  },
  acier: (c, r, w, h) => {
    const col = r.pick(['#4a6a9a', '#7a8290', '#c84a2a']);
    const run = supportRun(w, h);
    face(c, w, h, sideGrad(c, -w / 2, w / 2, shade(col, -0.35)));
    // lattice frame
    for (let x = -w / 2 + run; x < w / 2 - run - 0.3; x += 0.6) {
      line(c, [[x, -0.04], [x + 0.6, -h + 0.06]], col, 0.05, false);
      line(c, [[x + 0.6, -0.04], [x, -h + 0.06]], col, 0.05, false);
    }
    rect(c, -w / 2 + run, -h, w - 2 * run, 0.08, '#2a2e36', 0.015);
    for (let x = -w / 2 + run + 0.1; x < w / 2 - run - 0.1; x += 0.25) line(c, [[x, -h + 0.02], [x + 0.08, -h + 0.06]], '#8a929e', 0.015, false);
  },
  palettes: (c, r, w, h) => {
    const col = r.pick(['#c8a070', '#5a8ac8', '#b85a3a']);
    const run = supportRun(w, h);
    face(c, w, h, shade(col, -0.45));
    const n = Math.max(2, Math.round(h / 0.15));
    for (let j = 0; j < n; j++) {
      const y = -((j + 1) * h) / n;
      const inset = run * ((j + 1) / n);
      rect(c, -w / 2 + inset, y, w - 2 * inset, (h / n) * 0.32, col, 0.012);
      for (let bx = -w / 2 + inset + 0.05; bx < w / 2 - inset - 0.1; bx += 0.6) rect(c, bx, y + (h / n) * 0.32, 0.12, (h / n) * 0.68, shade(col, -0.25), 0.01);
    }
  },
  pierre: (c, r, w, h) => {
    const col = r.pick(['#c8b89a', '#b0a088']);
    face(c, w, h, sideGrad(c, -w / 2, w / 2, col));
    // dressed stones in courses
    const rows = Math.max(1, Math.round(h / 0.3));
    for (let j = 1; j < rows; j++) {
      const y = -(j * h) / rows;
      const inset = supportRun(w, h) * (j / rows);
      line(c, [[-w / 2 + inset, y], [w / 2 - inset, y]], shade(col, -0.3), 0.02, false);
    }
    for (let j = 0; j < rows; j++)
      for (let x = -w / 2 + 0.6 + (j % 2) * 0.35; x < w / 2 - 0.5; x += 0.7) line(c, [[x, -(j * h) / rows - 0.02], [x, -((j + 1) * h) / rows + 0.02]], shade(col, -0.28), 0.018, false);
  },
};

for (const kind of Object.keys(NAMES) as SupportKind[])
  for (const h of SUPPORT_HEIGHTS)
    for (const w of SUPPORT_WIDTHS) {
      const id = `ts.${kind}.${h}.${w}`;
      const run = supportRun(w, h);
      out.push({
        id,
        name: `${NAMES[kind]} ${Math.round(h * 100)}×${Math.round(w * 100)}`,
        group: 'trial',
        slot: 'obstacle',
        weight: 1,
        obstacle: { w, h, profile: (u) => Math.min(1, (u * w) / run, ((1 - u) * w) / run), tier: h < 0.5 ? 1 : h < 0.8 ? 2 : 3, module: 'support' },
        draw: () => sprite(w + 0.3, h + 0.2, (c) => DRAW[kind](c, rngFor(id), w, h)),
      });
    }

if (out.length !== 100) console.warn('trial supports', out.length);
export const SUPPORT_ASSETS = out;
