import { Rng } from '../core/math';
import { INK } from '../render/palette';
import { Ctx, ell, label, line, poly, rect, rngFor, shade, sideGrad, sprite } from './paint';
import type { AssetDef } from './types';

/**
 * v2.12: 200 trial modules, the building blocks of real trial parks. Standard heights
 * (0.3 / 0.45 / 0.6 / 0.9 m) and widths so they fit together: placed side by side they make
 * staircases, stacked they make towers, with ramps, decks and spools to link them. The
 * generator assembles them into structures (see Generator.moduleStructure).
 *
 * Faces are chamfered (~62°) like real modules, so a wheel can climb one step at a time.
 */

export type ModuleKind = 'caisse' | 'bloc' | 'plateau' | 'rampe' | 'touret' | 'pneus' | 'palette' | 'escalier' | 'pierre';

const out: AssetDef[] = [];
export const MODULE_HEIGHTS = [0.3, 0.45, 0.6, 0.9];

/** Box profile with chamfered faces (run = 0.5 × height, capped to a third of the width). */
function boxProfile(w: number, h: number): (u: number) => number {
  const run = Math.min(w / 3, h * 0.52);
  return (u) => {
    const x = u * w;
    return Math.min(1, x / run, (w - x) / run);
  };
}

function add(id: string, name: string, kind: ModuleKind, w: number, h: number, profile: (u: number) => number, draw: (c: Ctx, r: Rng) => void): void {
  const full = 'tm.' + id;
  out.push({
    id: full,
    name,
    group: 'trial',
    slot: 'obstacle',
    weight: 1,
    obstacle: { w, h, profile, tier: h < 0.5 ? 1 : h < 0.8 ? 2 : 3, module: kind },
    draw: () => sprite(w + 0.3, h + 0.2, (c) => draw(c, rngFor(full))),
  });
}

/** Chamfered block outline from -w/2 to w/2. */
function chamfer(c: Ctx, w: number, h: number, fill: string | CanvasGradient): void {
  const run = Math.min(w / 3, h * 0.52);
  poly(c, [[-w / 2, 0], [-w / 2 + run, -h], [w / 2 - run, -h], [w / 2, 0]], fill, 0.045);
}

const WOODS = ['#c8955a', '#a8733e', '#d9b070'];
const CONCRETE = ['#b0aca4', '#9a9aa2'];
const STEEL = ['#7a8290', '#4a5260'];

// 1. wooden crates: 4 heights × 4 widths × 3 woods = 48
for (const h of MODULE_HEIGHTS)
  for (const w of [0.8, 1.2, 1.6, 2.4])
    WOODS.forEach((col, k) =>
      add(`caisse.${h}.${w}.${k}`, `Caisse de trial ${Math.round(h * 100)}×${Math.round(w * 100)}`, 'caisse', w, h, boxProfile(w, h), (c) => {
        chamfer(c, w, h, sideGrad(c, -w / 2, w / 2, col));
        for (let y = -0.15; y > -h + 0.05; y -= 0.15) line(c, [[-w / 2 + 0.1, y], [w / 2 - 0.1, y]], shade(col, -0.3), 0.02, false);
        line(c, [[-w / 2 + 0.2, -0.05], [w / 2 - 0.2, -h + 0.05]], shade(col, -0.25), 0.03, false);
        rect(c, -w / 2 + Math.min(w / 3, h * 0.52) - 0.02, -h, w - 2 * Math.min(w / 3, h * 0.52) + 0.04, 0.05, '#e6e2d8', 0.015);
      }),
    );
// 2. concrete blocks: 4 heights × 4 widths × 2 = 32
for (const h of MODULE_HEIGHTS)
  for (const w of [1, 1.4, 2, 2.8])
    CONCRETE.forEach((col, k) =>
      add(`bloc.${h}.${w}.${k}`, `Bloc béton de trial ${Math.round(h * 100)}×${Math.round(w * 100)}`, 'bloc', w, h, boxProfile(w, h), (c, r) => {
        chamfer(c, w, h, sideGrad(c, -w / 2, w / 2, col));
        label(c, String(r.int(1, 9)), 0, -h / 2, Math.min(0.3, h * 0.5), shade(col, -0.35), null, false);
        for (let q = 0; q < 4; q++) ell(c, r.range(-w / 3, w / 3), -r.range(0.05, h - 0.05), 0.03, 0.03, shade(col, -0.2), 0, null);
      }),
    );
// 3. steel decks (hazard edges): 4 heights × 3 widths × 2 = 24
for (const h of MODULE_HEIGHTS)
  for (const w of [1.6, 2.4, 3.2])
    STEEL.forEach((col, k) =>
      add(`plateau.${h}.${w}.${k}`, `Plateau acier ${Math.round(h * 100)}×${Math.round(w * 100)}`, 'plateau', w, h, boxProfile(w, h), (c) => {
        chamfer(c, w, h, sideGrad(c, -w / 2, w / 2, col));
        const run = Math.min(w / 3, h * 0.52);
        for (let x = -w / 2 + run; x < w / 2 - run - 0.1; x += 0.2) poly(c, [[x, -h], [x + 0.1, -h], [x + 0.05, -h + 0.08]], '#ffd21f', 0.008);
        for (let x = -w / 2 + 0.3; x < w / 2 - 0.3; x += 0.25) for (let y = -h + 0.18; y < -0.05; y += 0.18) line(c, [[x, y], [x + 0.08, y - 0.05]], shade(col, 0.25), 0.015, false);
      }),
    );
// 4. ramps (up / down): 4 heights × 3 lengths × 2 directions = 24
for (const h of MODULE_HEIGHTS)
  for (const k of [1.6, 2.2, 3])
    for (const dir of ['up', 'down'] as const) {
      const w = h * k + 0.4;
      add(`rampe.${h}.${k}.${dir}`, `Rampe ${dir === 'up' ? 'montante' : 'descendante'} ${Math.round(h * 100)} cm`, 'rampe', w, h, (u) => {
        const t = dir === 'up' ? u : 1 - u;
        return Math.min(1, t * (w / (w - 0.4)), (1 - t) / 0.06);
      }, (c) => {
        const s = dir === 'up' ? 1 : -1;
        poly(c, [[-s * w / 2, 0], [s * (w / 2 - 0.4), -h], [s * w / 2, -h], [s * w / 2, 0]], sideGrad(c, -w / 2, w / 2, '#b8864e'), 0.04);
        for (let q = 1; q < 6; q++) {
          const x = -s * w / 2 + s * (q * (w - 0.4)) / 6;
          line(c, [[x, -0.02], [x, -(q * h) / 6 + 0.02]], '#7a4a2a', 0.025, false);
        }
      });
    }
// 5. spool modules: 4 diameters × 3 colours = 12
for (const d of [0.6, 0.8, 1, 1.2])
  ['#a8733e', '#8a3a2a', '#5a6a7a'].forEach((col, k) =>
    add(`touret.${d}.${k}`, `Touret module Ø${Math.round(d * 100)}`, 'touret', d, d, (u) => Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)) * 0.98 + 0.02, (c) => {
      const R = d / 2;
      ell(c, 0, -R, R, R, sideGrad(c, -R, R, col), 0.045);
      ell(c, 0, -R, R * 0.32, R * 0.32, '#2a2a30', 0.03);
      for (let q = 0; q < 6; q++) line(c, [[0, -R], [Math.cos(q * 1.047) * R * 0.9, -R + Math.sin(q * 1.047) * R * 0.9]], 'rgba(0,0,0,0.25)', 0.025, false);
    }),
  );
// 6. tyre stacks as modules: 4 heights × 2 widths × 2 = 16
for (const h of MODULE_HEIGHTS)
  for (const w of [1, 1.6])
    [0, 1].forEach((k) =>
      add(`pneus.${h}.${w}.${k}`, `Module pneus ${Math.round(h * 100)} cm${k ? ' peints' : ''}`, 'pneus', w, h, boxProfile(w, h), (c) => {
        const n = Math.max(1, Math.round(h / 0.3));
        for (let j = 0; j < n; j++) {
          rect(c, -w / 2, -((j + 1) * h) / n, w, h / n, sideGrad(c, -w / 2, w / 2, '#2a2724'), 0.035, (h / n) * 0.45);
          if (k) line(c, [[-w / 2 + 0.1, -((j + 0.5) * h) / n], [w / 2 - 0.1, -((j + 0.5) * h) / n]], j % 2 ? '#ffd21f' : '#f2f2f2', 0.04, false);
        }
      }),
    );
// 7. pallet modules: 4 heights × 2 widths × 2 colours = 16
for (const h of MODULE_HEIGHTS)
  for (const w of [1.2, 1.6])
    ['#c8a070', '#5a8ac8'].forEach((col, k) =>
      add(`palette.${h}.${w}.${k}`, `Module palettes ${Math.round(h * 100)} cm${k ? ' bleues' : ''}`, 'palette', w, h, boxProfile(w, h), (c) => {
        const n = Math.max(2, Math.round(h / 0.15));
        for (let j = 0; j < n; j++) {
          const y = -((j + 1) * h) / n;
          rect(c, -w / 2, y, w, (h / n) * 0.3, col, 0.015);
          for (const bx of [-w / 2 + 0.02, -0.06, w / 2 - 0.14]) rect(c, bx, y + (h / n) * 0.3, 0.12, (h / n) * 0.7, shade(col, -0.25), 0.012);
        }
      }),
    );
// 8. stair modules (2-3 steps in one block): 3 heights × 3 widths × 2 = 18
for (const h of [0.6, 0.9, 1.2])
  for (const w of [1.6, 2.2, 3])
    [0, 1].forEach((k) => {
      const n = h > 1 ? 4 : h > 0.7 ? 3 : 2;
      const step = (w * 0.5) / n;
      add(`escalier.${h}.${w}.${k}`, `Module escalier ${n} marches ${Math.round(h * 100)} cm`, 'escalier', w, h, (u) => {
        const x = u * w;
        const up = Math.min(n, Math.ceil(Math.max(0.001, x) / step)) / n;
        const down = Math.min(1, (w - x) / Math.min(w / 4, h * 0.6));
        return Math.min(up, down);
      }, (c) => {
        const col = k ? '#9a9aa2' : '#b8864e';
        for (let j = 0; j < n; j++) rect(c, -w / 2 + j * step, -((j + 1) * h) / n, w - j * step - Math.min(w / 4, h * 0.6) * (j === n - 1 ? 1 : 0), h / n, sideGrad(c, -w / 2, w / 2, shade(col, -0.04 * j)), 0.03);
        poly(c, [[w / 2 - Math.min(w / 4, h * 0.6), -h], [w / 2, 0], [w / 2 - Math.min(w / 4, h * 0.6), 0]], shade(col, -0.15), 0.03);
      });
    });
// 9. dressed stone blocks: 4 heights × 2 widths + 2 big = 10
for (const h of MODULE_HEIGHTS)
  for (const w of [1.2, 2])
    add(`pierre.${h}.${w}`, `Pierre taillée ${Math.round(h * 100)}×${Math.round(w * 100)}`, 'pierre', w, h, boxProfile(w, h), (c, r) => {
      chamfer(c, w, h, sideGrad(c, -w / 2, w / 2, '#c8b89a'));
      for (let q = 0; q < 3; q++) line(c, [[r.range(-w / 3, w / 3), -h], [r.range(-w / 3, w / 3), -h * r.range(0.3, 0.7)]], '#8a7a62', 0.02, false);
    });
for (const [h, w] of [[1.2, 2.4], [1.5, 2.8]] as [number, number][])
  add(`pierre.${h}.${w}`, `Gros bloc de pierre ${Math.round(h * 100)} cm`, 'pierre', w, h, boxProfile(w, h), (c) => chamfer(c, w, h, sideGrad(c, -w / 2, w / 2, '#b8a888')));

if (out.length !== 200) console.warn('trial modules', out.length);
void INK;
export const MODULE_ASSETS = out;
