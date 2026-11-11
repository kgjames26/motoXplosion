import { Rng } from '../core/math';
import { INK } from '../render/palette';
import { crown, Ctx, ell, line, person, poly, Pt, rect, rngFor, shade, sideGrad, sprite } from './paint';
import type { AssetDef, AssetGroup, Slot } from './types';

/**
 * Map decor: ~410 assets for the four regions, built from parameterised families.
 * green = shared by Alpes and Grande Forêt; alpes / foret / canyon / desert = region specific.
 */

const out: AssetDef[] = [];
function add(id: string, name: string, group: AssetGroup, slot: Slot, draw: (r: Rng) => ReturnType<typeof sprite>, weight = 1): void {
  out.push({ id, name, group, slot, draw: () => draw(rngFor(id)), weight });
}

const trunk = (c: Ctx, h: number, w: number, color = '#6e4326', lean = 0): void => {
  poly(c, [[-w, 0], [-w * 0.45 + lean, -h], [w * 0.45 + lean, -h], [w, 0]], sideGrad(c, -w, w, color), 0.04);
};

// ======================================================================= GREEN (Alpes + Forêt)

// --- spruce: 3 heights × 3 silhouettes × 3 tints = 27
const SPRUCE_TINTS: [string, string][] = [
  ['#1d5232', 'vert sombre'],
  ['#2f6e3a', 'vert'],
  ['#3f7a52', 'bleuté'],
];
for (const [hi, H] of [[0, 6], [1, 8.5], [2, 11]] as [number, number][])
  for (const [si, shapeName, wf] of [[0, 'élancé', 0.28], [1, 'classique', 0.36], [2, 'trapu', 0.46]] as [number, string, number][])
    for (const [ti, [col, tname]] of SPRUCE_TINTS.entries())
      add(`spruce.${hi}.${si}.${ti}`, `Épicéa ${shapeName} ${tname} ${H} m`, 'green', 'tree', (r) =>
        sprite(H * wf * 2 + 0.4, H, (c) => {
          trunk(c, H * 0.95, 0.16 + H * 0.01);
          const tiers = 9 + hi * 3;
          for (let i = 0; i < tiers; i++) {
            const t = i / (tiers - 1);
            const y = -H * (0.12 + t * 0.85);
            const w = H * wf * (1 - t * 0.92) + 0.15;
            const d = 0.3 + w * 0.22;
            const pts: Pt[] = [[0, y - d * 1.3]];
            for (let k = 0; k <= 6; k++) {
              const u = k / 6;
              pts.push([w * (u * 2 - 1), y + d * (0.6 + (k % 2) * 0.35) * (1 - Math.abs(u * 2 - 1) * 0.2)]);
            }
            poly(c, pts, shade(col, -0.18), 0.04);
            poly(c, [[0, y - d * 1.2], [-w * 0.9, y + d * 0.5], [-w * 0.1, y + d * 0.3]], col, 0);
            line(c, [[-w * 0.55, y + d * 0.1], [-w * 0.15, y - d * 0.6]], shade(col, 0.35), 0.06, false);
            void r;
          }
        }),
      );

// --- larch (mélèze): 2 heights × 3 seasons = 6
for (const [hi, H] of [[0, 7], [1, 10]] as [number, number][])
  for (const [si, col, sname] of [[0, '#7ea845', 'été'], [1, '#d9a83a', 'automne doré'], [2, '#d9772a', 'automne roux']] as [number, string, string][])
    add(`larch.${hi}.${si}`, `Mélèze ${sname} ${H} m`, 'alpes', 'tree', (r) =>
      sprite(H * 0.55, H, (c) => {
        trunk(c, H * 0.97, 0.15, '#7a4a2a');
        for (let i = 0; i < 14; i++) {
          const t = i / 13;
          const y = -H * (0.15 + t * 0.82);
          const w = H * 0.24 * (1 - t * 0.85) + 0.1;
          for (let k = 0; k < 6; k++) {
            const x = r.range(-w, w);
            ell(c, x, y + r.range(-0.15, 0.15), r.range(0.2, 0.35), 0.12, k % 2 ? col : shade(col, -0.2), 0.02);
          }
        }
      }),
    );

// --- birch: 3 heights × 4 seasons = 12
for (const [hi, H] of [[0, 5], [1, 7], [2, 9]] as [number, number][])
  for (const [si, col, sname] of [[0, '#5ea43c', 'été'], [1, '#93c94e', 'printemps'], [2, '#e2c13a', 'automne'], [3, '#e88a2a', 'fin d’automne']] as [number, string, string][])
    add(`birch.${hi}.${si}`, `Bouleau ${sname} ${H} m`, 'green', 'tree', (r) =>
      sprite(H * 0.55, H, (c) => {
        trunk(c, H * 0.8, 0.12, '#f1efe6', r.range(-0.2, 0.2));
        for (let k = 0; k < 9; k++) rect(c, -0.1 + r.range(0, 0.08), -r.range(0.3, H * 0.75), 0.1, 0.04, '#2a2a2a', 0);
        crown(c, r, 0, -H * 0.65, H * 0.26, H * 0.33, col, 11);
      }),
    );

// --- broadleaf (chêne, hêtre): 3 crowns × 4 colours = 12
for (const [ci, cname, wr, hr] of [[0, 'rond', 0.36, 0.3], [1, 'haut', 0.26, 0.38], [2, 'large', 0.46, 0.26]] as [number, string, number, number][])
  for (const [ki, col, kname] of [[0, '#4f9a3c', 'vert'], [1, '#2f7a34', 'vert foncé'], [2, '#c8502a', 'rouge d’automne'], [3, '#d99a2a', 'ambre']] as [number, string, string][])
    add(`oak.${ci}.${ki}`, `Feuillu ${cname} ${kname}`, 'foret', 'tree', (r) =>
      sprite(9 * wr * 2, 8, (c) => {
        trunk(c, 4.5, 0.32, '#5e3a22');
        line(c, [[0, -3.5], [-1.2, -5]], '#5e3a22', 0.18);
        line(c, [[0, -3.8], [1.1, -5.3]], '#5e3a22', 0.16);
        crown(c, r, 0, -8 * (1 - hr * 1.1), 9 * wr, 8 * hr, col, 13);
      }),
    );

// --- fruit trees: 3
for (const [i, col, dot, nm] of [[0, '#5aa03c', '#d8261f', 'Pommier'], [1, '#f2b8cf', '#ffffff', 'Cerisier en fleurs'], [2, '#5aa03c', '#f2c23a', 'Poirier']] as [number, string, string, string][])
  add(`fruit.${i}`, nm, 'alpes', 'tree', (r) =>
    sprite(4.4, 5, (c) => {
      trunk(c, 2.6, 0.2, '#6a4026');
      crown(c, r, 0, -3.3, 2, 1.6, col, 10);
      for (let k = 0; k < 18; k++) ell(c, r.range(-1.5, 1.5), -3.3 + r.range(-1.1, 1), 0.08, 0.08, dot, 0.015);
    }),
  );

// --- bushes: 3 shapes × 4 colours = 12, berry bushes 3
for (const [si, sname, w, h] of [[0, 'bas', 1.6, 0.8], [1, 'rond', 1.4, 1.2], [2, 'haie', 2.6, 1.1]] as [number, string, number, number][])
  for (const [ki, col, kname] of [[0, '#5aa83f', 'vert'], [1, '#3f8a3a', 'sombre'], [2, '#8fbf4a', 'clair'], [3, '#b8762a', 'roux']] as [number, string, string][])
    add(`bush.${si}.${ki}`, `Buisson ${sname} ${kname}`, 'green', 'bush', (r) => sprite(w, h, (c) => crown(c, r, 0, -h * 0.5, w * 0.55, h * 0.55, col, 7)));
for (const [i, berry, nm] of [[0, '#d8261f', 'Groseillier'], [1, '#3a2a6a', 'Myrtilles'], [2, '#ff8a2a', 'Argousier']] as [number, string, string][])
  add(`berry.${i}`, nm, 'foret', 'bush', (r) =>
    sprite(1.4, 1, (c) => {
      crown(c, r, 0, -0.5, 0.75, 0.5, '#4f9a3c', 7);
      for (let k = 0; k < 14; k++) ell(c, r.range(-0.6, 0.6), -r.range(0.2, 0.8), 0.05, 0.05, berry, 0.012);
    }),
  );

// --- flowers: 12 patches (daisies, poppies, lupins, gentians...)
const FLOWERS: [string, string, 'round' | 'spike'][] = [
  ['#ffffff', 'Marguerites', 'round'],
  ['#d8261f', 'Coquelicots', 'round'],
  ['#ffd21f', 'Boutons d’or', 'round'],
  ['#3a5ad8', 'Gentianes', 'round'],
  ['#e84a8a', 'Œillets', 'round'],
  ['#b9a4ff', 'Pensées', 'round'],
  ['#7a3fd1', 'Lupins violets', 'spike'],
  ['#e84a8a', 'Lupins roses', 'spike'],
  ['#ffffff', 'Lupins blancs', 'spike'],
  ['#4f7ad8', 'Lupins bleus', 'spike'],
  ['#ff9a3a', 'Lys orangés', 'spike'],
  ['#f2e04a', 'Molènes', 'spike'],
];
FLOWERS.forEach(([col, nm, kind], i) =>
  add(`flowers.${i}`, nm, 'green', 'ground', (r) =>
    sprite(1.3, kind === 'spike' ? 1.1 : 0.6, (c) => {
      for (let k = 0; k < 10; k++) {
        const x = r.range(-0.55, 0.55);
        const h = kind === 'spike' ? r.range(0.6, 1.05) : r.range(0.25, 0.55);
        line(c, [[x, 0], [x + r.range(-0.05, 0.05), -h]], '#4f8a3a', 0.025, false);
        if (kind === 'spike') for (let j = 0; j < 6; j++) ell(c, x, -h + j * 0.06, 0.045 - j * 0.004, 0.035, j % 2 ? col : shade(col, -0.15), 0.012);
        else {
          for (let j = 0; j < 5; j++) {
            const a = (j / 5) * Math.PI * 2;
            ell(c, x + Math.cos(a) * 0.04, -h + Math.sin(a) * 0.04, 0.035, 0.035, col, 0.01);
          }
          ell(c, x, -h, 0.025, 0.025, '#f2b01a', 0);
        }
      }
    }),
  ),
);

// --- ferns 4, mushrooms 6
for (let i = 0; i < 4; i++)
  add(`fern.${i}`, `Fougère ${i + 1}`, 'foret', 'ground', (r) =>
    sprite(1.4, 0.9, (c) => {
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + (k / 6 - 0.5) * 2.4;
        const L = r.range(0.55, 0.85);
        const ex = Math.cos(a) * L;
        const ey = Math.sin(a) * L * 0.9;
        line(c, [[0, 0], [ex * 0.5, ey * 0.7 - 0.08], [ex, ey + 0.1]], ['#3f8a3a', '#5aa83f', '#2f6e3a', '#78b84a'][i], 0.03, false);
        for (let j = 1; j < 8; j++) {
          const t = j / 8;
          const x = ex * t;
          const y = ey * t - Math.sin(Math.PI * t) * 0.08;
          ell(c, x, y, 0.06 * (1 - t * 0.6), 0.025, ['#4f9a3c', '#6ab84a', '#3f7a3a', '#8ac85a'][i], 0);
        }
      }
    }),
  );
for (const [i, cap, nm, n] of [[0, '#d8261f', 'Amanites', 2], [1, '#8a5a33', 'Cèpes', 2], [2, '#f2c23a', 'Girolles', 5], [3, '#d8261f', 'Grande amanite', 1], [4, '#a87a5a', 'Rosés des prés', 3], [5, '#f2efe6', 'Coulemelles', 2]] as [number, string, string, number][])
  add(`mushroom.${i}`, nm, 'foret', 'ground', (r) =>
    sprite(0.8, 0.5, (c) => {
      for (let k = 0; k < n; k++) {
        const x = n === 1 ? 0 : -0.25 + (0.5 * k) / (n - 1);
        const s = (n === 1 ? 1.6 : 1) * r.range(0.8, 1.1);
        rect(c, x - 0.03 * s, -0.16 * s, 0.06 * s, 0.16 * s, '#f2efe6', 0.02);
        c.beginPath();
        c.ellipse(x, -0.16 * s, 0.12 * s, 0.09 * s, 0, Math.PI, 0);
        c.fillStyle = cap;
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = 0.02;
        c.stroke();
        if (cap === '#d8261f') for (let j = 0; j < 4; j++) ell(c, x + r.range(-0.07, 0.07) * s, -0.2 * s, 0.015 * s, 0.012 * s, '#ffffff', 0);
      }
    }),
  );

// --- rocks: 6 mossy + 6 granite boulders + 4 stumps + 3 cairns
const rockShape = (c: Ctx, r: Rng, W: number, H: number, col: string, moss: string | null): void => {
  const n = 9;
  const pts: Pt[] = [[-W / 2, 0]];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (Math.PI * i) / n;
    pts.push([Math.cos(a) * (W / 2) * r.range(0.85, 1.05), Math.min(0, Math.sin(a) * H * r.range(0.8, 1.05))]);
  }
  pts.push([W / 2, 0]);
  poly(c, pts, sideGrad(c, -W / 2, W / 2, col), 0.05);
  poly(c, [[-W * 0.35, -H * 0.55], [-W * 0.05, -H * 0.92], [W * 0.1, -H * 0.5], [-W * 0.15, -H * 0.3]], shade(col, 0.2), 0);
  if (moss) ell(c, -W * 0.05, -H * 0.9, W * 0.3, H * 0.13, moss, 0);
  line(c, [[W * 0.15, -H * 0.8], [W * 0.22, -H * 0.45], [W * 0.12, -H * 0.2]], shade(col, -0.35), 0.03, false);
};
for (let i = 0; i < 6; i++) add(`mossrock.${i}`, `Rocher moussu ${i + 1}`, 'green', 'ground', (r) => sprite(1 + i * 0.25, 0.8, (c) => rockShape(c, r, 1 + i * 0.25, 0.55 + (i % 3) * 0.12, '#8e9098', '#5aa83f')));
for (let i = 0; i < 6; i++) add(`granite.${i}`, `Bloc de granite ${i + 1}`, 'alpes', 'ground', (r) => sprite(2.2 + i * 0.4, 2, (c) => rockShape(c, r, 2.2 + i * 0.4, 1.2 + (i % 3) * 0.3, ['#a0a2aa', '#8d8f99', '#b4b0a8'][i % 3], i % 2 ? null : '#6aa84a')));
for (let i = 0; i < 4; i++)
  add(`stump.${i}`, `Souche ${i + 1}`, 'foret', 'ground', (r) =>
    sprite(1.1, 0.8, (c) => {
      const h = 0.35 + i * 0.1;
      poly(c, [[-0.45, 0], [-0.32, -h], [0.32, -h], [0.45, 0]], sideGrad(c, -0.45, 0.45, '#7a4a2a'), 0.04);
      ell(c, 0, -h, 0.32, 0.09, '#d6a670', 0.03);
      if (i % 2) for (let k = 0; k < 3; k++) ell(c, r.range(-0.3, 0.3), -r.range(0.05, h * 0.6), 0.07, 0.04, '#f2c23a', 0.015);
    }),
  );
for (let i = 0; i < 3; i++)
  add(`cairn.${i}`, `Cairn ${i + 1}`, 'alpes', 'ground', (r) =>
    sprite(0.8, 1.2, (c) => {
      let y = 0;
      for (let k = 0; k < 4 + i; k++) {
        const w = 0.6 - k * 0.08;
        const h = 0.14 + r.range(0, 0.05);
        ell(c, r.range(-0.03, 0.03), y - h / 2, w / 2, h / 2, shade('#9a9aa2', r.range(-0.15, 0.15)), 0.025);
        y -= h * 0.9;
      }
    }),
  );

// --- structures: fences 4, stone walls 3, log piles 3, chalets 4, barns 3, hay 5, signposts 4,
//     benches 2, beehives 2, well, trough, tractors 2, chapel, dead trees 3, reeds 4
const fence = (c: Ctx, kind: number): void => {
  const W = 3;
  for (let k = 0; k <= 3; k++) rect(c, -W / 2 + k * (W / 3) - 0.05, -1.1, 0.1, 1.1, '#8a5a33', 0.03);
  if (kind === 1) for (let k = 0; k < 12; k++) poly(c, [[-W / 2 + k * 0.25, 0], [-W / 2 + k * 0.25, -0.9], [-W / 2 + k * 0.25 + 0.08, -1], [-W / 2 + k * 0.25 + 0.16, -0.9], [-W / 2 + k * 0.25 + 0.16, 0]], '#f2efe6', 0.025);
  else {
    rect(c, -W / 2, -0.95, W, 0.1, '#a8733e', 0.03);
    if (kind !== 2) rect(c, -W / 2, -0.55, W, 0.1, '#a8733e', 0.03);
    else rect(c, -W / 2, -0.55, W * 0.45, 0.1, '#a8733e', 0.03, 0);
    if (kind === 3) line(c, [[-W / 2, -0.95], [W / 2, -0.45]], '#a8733e', 0.08);
  }
};
for (let i = 0; i < 4; i++) add(`fence.${i}`, ['Barrière à lisses', 'Palissade', 'Barrière cassée', 'Barrière de pâture'][i], 'green', 'structure', () => sprite(3.2, 1.2, (c) => fence(c, i)));
for (let i = 0; i < 3; i++)
  add(`stonewall.${i}`, `Muret de pierres ${i + 1}`, 'alpes', 'structure', (r) =>
    sprite(3.5, 1, (c) => {
      for (let row = 0; row < 3 + i % 2; row++)
        for (let x = -1.7 + (row % 2) * 0.2; x < 1.7; x += r.range(0.35, 0.55)) ell(c, x, -0.13 - row * 0.22, 0.2, 0.12, shade('#9a978e', r.range(-0.18, 0.15)), 0.025);
    }),
  );
for (let i = 0; i < 3; i++)
  add(`logpile.${i}`, `Tas de bûches ${i + 1}`, 'foret', 'structure', () =>
    sprite(2.6, 1.4, (c) => {
      const rows = 2 + i;
      for (let row = 0; row < rows; row++)
        for (let k = 0; k < rows - row + 2; k++) {
          const x = -0.9 + k * 0.4 + row * 0.2;
          const y = -0.2 - row * 0.36;
          ell(c, x, y, 0.19, 0.19, '#d6a670', 0.03);
          ell(c, x, y, 0.09, 0.09, '#b8834e', 0);
        }
    }),
  );
const house = (c: Ctx, W: number, H: number, wall: string, roof: string, shutter: string, wood: boolean): void => {
  rect(c, -W / 2, -H, W, H, sideGrad(c, -W / 2, W / 2, wall), 0.05);
  if (wood) for (let y = -H + 0.25; y < 0; y += 0.3) line(c, [[-W / 2, y], [W / 2, y]], shade(wall, -0.2), 0.02, false);
  poly(c, [[-W / 2 - 0.5, -H], [0, -H - W * 0.42], [W / 2 + 0.5, -H]], sideGrad(c, -W / 2, W / 2, roof), 0.05);
  for (const x of [-W * 0.28, W * 0.28]) {
    rect(c, x - 0.3, -H * 0.72, 0.6, 0.6, '#9fd0f0', 0.03);
    rect(c, x - 0.55, -H * 0.72, 0.22, 0.6, shutter, 0.025);
    rect(c, x + 0.33, -H * 0.72, 0.22, 0.6, shutter, 0.025);
  }
  rect(c, -0.35, -1.6, 0.7, 1.6, shade(wall, -0.35), 0.03);
};
for (const [i, sh, nm] of [[0, '#c8302a', 'volets rouges'], [1, '#2f7a34', 'volets verts'], [2, '#2a5ad8', 'volets bleus'], [3, '#f2efe6', 'volets blancs']] as [number, string, string][])
  add(`chalet.${i}`, `Chalet ${nm}`, 'alpes', 'structure', () => sprite(7.5, 7, (c) => {
    house(c, 6, 3.6, '#a86a3a', '#5e3a22', sh, true);
    rect(c, -3.1, -1.7, 6.2, 0.12, '#7a4a2a', 0.03);
    for (let k = 0; k < 6; k++) ell(c, -2.4 + k * 0.95, -1.85, 0.2, 0.15, ['#e84a4a', '#ff8a2a', '#e84a8a'][k % 3], 0.015);
  }), 0.5);
for (const [i, wall, nm] of [[0, '#b8302a', 'rouge'], [1, '#8a5a33', 'en bois'], [2, '#d9cdb0', 'en pierre']] as [number, string, string][])
  add(`barn.${i}`, `Grange ${nm}`, 'green', 'structure', () =>
    sprite(9, 7, (c) => {
      rect(c, -4, -4.2, 8, 4.2, sideGrad(c, -4, 4, wall), 0.05);
      poly(c, [[-4.5, -4.2], [-2.5, -6.2], [2.5, -6.2], [4.5, -4.2]], '#4a3a30', 0.05);
      rect(c, -1.4, -3, 2.8, 3, shade(wall, -0.3), 0.04);
      line(c, [[-1.4, -3], [1.4, 0]], '#f2efe6', 0.08, false);
      line(c, [[1.4, -3], [-1.4, 0]], '#f2efe6', 0.08, false);
    }), 0.5);
for (const [i, col, nm, round] of [[0, '#f2efe6', 'enrubannée blanche', true], [1, '#2f6e3a', 'enrubannée verte', true], [2, '#2a2a2e', 'enrubannée noire', true], [3, '#e6c25a', 'de paille ronde', true], [4, '#e6c25a', 'de paille carrée', false]] as [number, string, string, boolean][])
  add(`hay.${i}`, `Botte ${nm}`, 'green', 'structure', () =>
    sprite(1.6, 1.4, (c) => {
      if (round) {
        rect(c, -0.75, -1.3, 1.5, 1.3, sideGrad(c, -0.75, 0.75, col), 0.04, 0.35);
        if (col === '#e6c25a') for (let k = 0; k < 6; k++) line(c, [[-0.6, -0.2 - k * 0.18], [0.6, -0.2 - k * 0.18]], '#c8a03a', 0.02, false);
        else line(c, [[-0.75, -0.65], [0.75, -0.65]], shade(col, -0.25), 0.03, false);
      } else {
        rect(c, -0.75, -0.8, 1.5, 0.8, sideGrad(c, -0.75, 0.75, col), 0.04, 0.05);
        line(c, [[-0.4, -0.8], [-0.4, 0]], '#8a5a33', 0.025, false);
        line(c, [[0.4, -0.8], [0.4, 0]], '#8a5a33', 0.025, false);
      }
    }),
  );
for (let i = 0; i < 4; i++)
  add(`signpost.${i}`, `Panneau de randonnée ${i + 1}`, 'alpes', 'structure', () =>
    sprite(1.6, 2.2, (c) => {
      rect(c, -0.06, -2.1, 0.12, 2.1, '#8a5a33', 0.03);
      for (let k = 0; k < 1 + (i % 3); k++) {
        const dir = (k + i) % 2 ? 1 : -1;
        const y = -1.95 + k * 0.32;
        poly(c, [[0, y], [dir * 0.6, y], [dir * 0.75, y + 0.12], [dir * 0.6, y + 0.24], [0, y + 0.24]], ['#f2d22a', '#f2efe6', '#d8261f'][(k + i) % 3], 0.025);
      }
    }),
  );
for (let i = 0; i < 2; i++)
  add(`bench.${i}`, i ? 'Banc en pierre' : 'Banc en bois', 'green', 'structure', () =>
    sprite(1.8, 1, (c) => {
      const col = i ? '#a0a2aa' : '#a8733e';
      rect(c, -0.85, -0.5, 1.7, 0.1, col, 0.03);
      if (!i) rect(c, -0.85, -0.95, 1.7, 0.1, col, 0.03);
      rect(c, -0.75, -0.5, 0.1, 0.5, shade(col, -0.25), 0.03);
      rect(c, 0.65, -0.5, 0.1, 0.5, shade(col, -0.25), 0.03);
    }),
  );
for (let i = 0; i < 2; i++)
  add(`beehive.${i}`, i ? 'Ruches colorées' : 'Ruche en paille', 'foret', 'structure', () =>
    sprite(i ? 2 : 0.9, 1.2, (c) => {
      if (!i) {
        ell(c, 0, -0.5, 0.38, 0.5, '#d9b24a', 0.04);
        for (let k = 1; k < 5; k++) line(c, [[-0.37, -k * 0.2], [0.37, -k * 0.2]], '#b8902a', 0.02, false);
        ell(c, 0, -0.18, 0.06, 0.05, '#2a2420', 0);
      } else
        ['#3a8ad8', '#f2d22a', '#e84a4a'].forEach((col, k) => {
          rect(c, -0.9 + k * 0.62, -0.75, 0.5, 0.6, col, 0.03);
          rect(c, -0.94 + k * 0.62, -0.82, 0.58, 0.08, '#f2efe6', 0.025);
          rect(c, -0.85 + k * 0.62, -0.15, 0.06, 0.15, '#5a3a22', 0.02);
          rect(c, -0.5 + k * 0.62, -0.15, 0.06, 0.15, '#5a3a22', 0.02);
        });
    }),
  );
add('well.0', 'Puits en pierre', 'alpes', 'structure', (r) =>
  sprite(1.8, 2.4, (c) => {
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) ell(c, -0.6 + k * 0.4 + (row % 2) * 0.2, -0.15 - row * 0.25, 0.2, 0.13, shade('#9a978e', r.range(-0.15, 0.1)), 0.02);
    rect(c, -0.75, -2.2, 0.1, 1.5, '#7a4a2a', 0.03);
    rect(c, 0.65, -2.2, 0.1, 1.5, '#7a4a2a', 0.03);
    poly(c, [[-0.95, -2.1], [0, -2.5], [0.95, -2.1]], '#8a3a2a', 0.04);
  }),
);
add('trough.0', 'Abreuvoir', 'alpes', 'structure', () =>
  sprite(2, 0.8, (c) => {
    rect(c, -0.95, -0.6, 1.9, 0.6, sideGrad(c, -1, 1, '#8a5a33'), 0.04, 0.05);
    rect(c, -0.85, -0.6, 1.7, 0.08, '#4fb3ff', 0.02);
  }),
);
for (const [i, col] of [[0, '#d8261f'], [1, '#2f8a3a']] as [number, string][])
  add(`tractor.${i}`, `Tracteur ${i ? 'vert' : 'rouge'}`, 'green', 'structure', () =>
    sprite(3.6, 2.6, (c) => {
      rect(c, -1.2, -1.6, 2.2, 0.8, sideGrad(c, -1.2, 1, col), 0.04, 0.1);
      rect(c, -1.3, -2.5, 1.1, 1.0, 'rgba(160,210,240,0.8)', 0.04, 0.05);
      rect(c, -1.35, -2.55, 1.2, 0.1, col, 0.03);
      line(c, [[0.7, -1.6], [0.7, -2.3]], '#2a2a2e', 0.08);
      for (const [x, rr] of [[-0.9, 0.75], [1.1, 0.45]] as [number, number][]) {
        ell(c, x, -rr, rr, rr, '#2a2420', 0.04);
        ell(c, x, -rr, rr * 0.5, rr * 0.5, '#f2c23a', 0.03);
      }
    }), 0.4);
add('chapel.0', 'Chapelle de montagne', 'alpes', 'structure', () =>
  sprite(5, 7.5, (c) => {
    rect(c, -2, -3.5, 4, 3.5, sideGrad(c, -2, 2, '#f2ece0'), 0.05);
    poly(c, [[-2.4, -3.5], [0, -5.2], [2.4, -3.5]], '#5e3a22', 0.05);
    rect(c, 1.0, -6.2, 0.9, 2.7, '#f2ece0', 0.04);
    poly(c, [[0.85, -6.2], [1.45, -7.4], [2.05, -6.2]], '#5e3a22', 0.04);
    rect(c, -0.4, -1.8, 0.8, 1.8, '#7a4a2a', 0.03, 0.4);
  }), 0.3);
for (let i = 0; i < 3; i++)
  add(`snag.${i}`, `Arbre mort ${i + 1}`, 'green', 'tree', (r) =>
    sprite(3, 6, (c) => {
      trunk(c, 5 + i * 0.4, 0.2, '#8a7a6a', r.range(-0.3, 0.3));
      for (let k = 0; k < 5; k++) {
        const y = -2 - k * 0.7;
        const s = k % 2 ? 1 : -1;
        line(c, [[0, y], [s * r.range(0.6, 1.2), y - r.range(0.3, 0.7)]], '#8a7a6a', 0.07);
      }
    }), 0.4);
for (let i = 0; i < 4; i++)
  add(`reeds.${i}`, `Roseaux ${i + 1}`, 'foret', 'ground', (r) =>
    sprite(1.4, 1.8, (c) => {
      for (let k = 0; k < 9; k++) {
        const x = r.range(-0.6, 0.6);
        const h = r.range(1, 1.7);
        line(c, [[x, 0], [x + r.range(-0.1, 0.1), -h]], ['#6a9a3a', '#8aa84a', '#5a8a3a', '#a8a84a'][i], 0.03, false);
        if (k % 2) ell(c, x, -h + 0.12, 0.035, 0.12, '#6a4026', 0.012);
      }
    }),
  );

// --- animals: cows 3, sheep 2, goats 2, horses 2, deer 2
const quad = (c: Ctx, body: string, spots: string | null, L: number, H: number, head: 'cow' | 'sheep' | 'goat' | 'horse' | 'deer', r: Rng): void => {
  for (const x of [-L * 0.38, -L * 0.25, L * 0.25, L * 0.38]) rect(c, x - 0.05, -H * 0.55, 0.1, H * 0.55, shade(body, -0.2), 0.025);
  const fluffy = head === 'sheep';
  if (fluffy) crown(c, r, 0, -H * 0.72, L * 0.5, H * 0.3, '#f2efe6', 8);
  else ell(c, 0, -H * 0.72, L * 0.5, H * 0.24, sideGrad(c, -L / 2, L / 2, body), 0.04);
  if (spots) for (let k = 0; k < 4; k++) ell(c, r.range(-L * 0.35, L * 0.35), -H * 0.72 + r.range(-0.08, 0.08), r.range(0.1, 0.2), 0.1, spots, 0);
  const hx = L * 0.55;
  const hy = head === 'horse' || head === 'deer' ? -H * 1.05 : -H * 0.85;
  if (head === 'horse' || head === 'deer') line(c, [[L * 0.35, -H * 0.75], [hx, hy]], body, 0.18);
  ell(c, hx + 0.1, hy, head === 'horse' ? 0.25 : 0.18, 0.12, fluffy ? '#2a2420' : body, 0.035);
  if (head === 'cow' || head === 'goat') line(c, [[hx, hy - 0.1], [hx - 0.08, hy - 0.25]], '#e8e0c8', 0.03);
  if (head === 'deer') {
    line(c, [[hx, hy - 0.08], [hx - 0.1, hy - 0.5], [hx - 0.25, hy - 0.6]], '#8a6a4a', 0.025);
    line(c, [[hx - 0.07, hy - 0.35], [hx + 0.08, hy - 0.5]], '#8a6a4a', 0.025);
  }
  if (head === 'horse') line(c, [[L * 0.3, -H * 0.95], [hx - 0.1, hy - 0.05]], shade(body, -0.4), 0.06, false);
  line(c, [[-L * 0.5, -H * 0.75], [-L * 0.6, -H * 0.45]], shade(body, -0.2), 0.04, false);
};
for (const [i, body, spots, nm] of [[0, '#8a5a33', null, 'Vache brune'], [1, '#f2efe6', '#2a2a2e', 'Vache pie noire'], [2, '#e6d2b0', '#a8733e', 'Vache blonde']] as [number, string, string | null, string][])
  add(`cow.${i}`, nm, 'alpes', 'animal', (r) => sprite(2.6, 1.6, (c) => quad(c, body, spots, 1.9, 1.4, 'cow', r)), 0.6);
for (let i = 0; i < 2; i++) add(`sheep.${i}`, `Mouton ${i + 1}`, 'green', 'animal', (r) => sprite(1.6, 1.1, (c) => quad(c, '#3a3530', null, 1.1, 0.9, 'sheep', r)), 0.5);
for (const [i, body] of [[0, '#f2efe6'], [1, '#8a6a4a']] as [number, string][]) add(`goat.${i}`, `Chèvre ${i + 1}`, 'alpes', 'animal', (r) => sprite(1.6, 1.3, (c) => quad(c, body, null, 1.1, 1.0, 'goat', r)), 0.4);
for (const [i, body] of [[0, '#6a3a22'], [1, '#2a2420']] as [number, string][]) add(`horse.${i}`, `Cheval ${i ? 'noir' : 'bai'}`, 'green', 'animal', (r) => sprite(2.8, 2.1, (c) => quad(c, body, null, 2, 1.6, 'horse', r)), 0.3);
for (let i = 0; i < 2; i++) add(`deer.${i}`, i ? 'Biche' : 'Cerf', 'foret', 'animal', (r) => sprite(2.2, 2, (c) => quad(c, '#a86a3a', null, 1.5, 1.3, i ? 'goat' : 'deer', r)), 0.3);

// --- more conifers for the forest: pine (Scots) 3 × 3 = 9, fir 6
for (const [hi, H] of [[0, 7], [1, 9.5], [2, 12]] as [number, number][])
  for (const [ki, col] of [[0, '#2f6e3a'], [1, '#3f7a3a'], [2, '#245a32']] as [number, string][])
    add(`scots.${hi}.${ki}`, `Pin sylvestre ${H} m (${ki + 1})`, 'foret', 'tree', (r) =>
      sprite(H * 0.5, H, (c) => {
        trunk(c, H * 0.85, 0.18, '#b8642e', r.range(-0.3, 0.3));
        for (let k = 0; k < 4; k++) crown(c, r, r.range(-H * 0.12, H * 0.12), -H * (0.62 + k * 0.08), H * 0.16, H * 0.07, col, 6);
      }),
    );
for (const [hi, H] of [[0, 9], [1, 13]] as [number, number][])
  for (const [ki, col] of [[0, '#1d4a2e'], [1, '#2a5a3a'], [2, '#1f5a46']] as [number, string][])
    add(`fir.${hi}.${ki}`, `Sapin ${H} m (${ki + 1})`, 'green', 'tree', () =>
      sprite(H * 0.42, H, (c) => {
        trunk(c, H * 0.95, 0.2, '#5e3a22');
        poly(c, [[0, -H], [-H * 0.2, -H * 0.15], [H * 0.2, -H * 0.15]], shade(col, -0.15), 0.06);
        poly(c, [[0, -H], [-H * 0.2, -H * 0.15], [-H * 0.02, -H * 0.15]], col, 0);
        for (let k = 0; k < 7; k++) line(c, [[-H * 0.17 * (k / 7 + 0.2), -H * (0.25 + k * 0.1)], [H * 0.03, -H * (0.3 + k * 0.1)]], shade(col, 0.25), 0.07, false);
      }),
    );
// --- grass tufts (green) 6
for (let i = 0; i < 6; i++)
  add(`tuft.${i}`, `Touffe d’herbe ${i + 1}`, 'green', 'ground', (r) =>
    sprite(1.2, 0.8, (c) => {
      const col = ['#5aa83f', '#78b84a', '#3f8a3a', '#8ac85a', '#a8b84a', '#6a9a3a'][i];
      for (let k = 0; k < 12; k++) {
        const x = r.range(-0.5, 0.5);
        const h = r.range(0.3, 0.75);
        poly(c, [[x - 0.05, 0], [x + r.range(-0.15, 0.15), -h], [x + 0.05, 0]], k % 2 ? col : shade(col, -0.2), 0.015);
      }
    }),
  );

// ======================================================================= CANYON

// hoodoos 8, mesa chunks 6, red boulders 8, arches 3, balanced rocks 3, cliffs 6, pebbles 6
const RED = ['#c8603a', '#b8502e', '#d9824a', '#a8482a'];
for (let i = 0; i < 8; i++)
  add(`hoodoo.${i}`, `Cheminée de fée ${i + 1}`, 'canyon', 'tree', (r) => {
    const H = 3 + (i % 4) * 1.4;
    return sprite(1.8, H + 0.5, (c) => {
      const col = RED[i % 4];
      const pts: Pt[] = [[-0.7, 0]];
      for (let k = 1; k <= 8; k++) {
        const y = -H * (k / 8);
        const w = 0.45 + Math.sin(k * 1.3 + i) * 0.12 - k * 0.02;
        pts.push([-w, y]);
      }
      const right = pts.slice(1).map(([x, y]) => [-x + r.range(-0.05, 0.05), y] as Pt).reverse();
      poly(c, [...pts, ...right, [0.7, 0]], sideGrad(c, -0.7, 0.7, col), 0.05);
      for (let k = 1; k < 6; k++) line(c, [[-0.5, -H * k / 6], [0.5, -H * k / 6 + 0.05]], shade(col, 0.2), 0.04, false);
      ell(c, 0, -H - 0.1, 0.6 + (i % 2) * 0.2, 0.25, '#8a6a5a', 0.04);
    });
  });
for (let i = 0; i < 6; i++)
  add(`mesa.${i}`, `Butte tabulaire ${i + 1}`, 'canyon', 'structure', (r) => {
    const W = 6 + i;
    const H = 3 + (i % 3);
    return sprite(W, H, (c) => {
      const col = RED[i % 4];
      poly(c, [[-W / 2, 0], [-W * 0.38, -H * 0.85], [-W * 0.3, -H], [W * 0.3, -H], [W * 0.38, -H * 0.85], [W / 2, 0]], sideGrad(c, -W / 2, W / 2, col), 0.05);
      for (let k = 1; k < 5; k++) line(c, [[-W * 0.4, -H * k / 5], [W * 0.4, -H * k / 5 + r.range(-0.05, 0.05)]], shade(col, k % 2 ? 0.18 : -0.15), 0.08, false);
    });
  });
for (let i = 0; i < 8; i++) add(`redrock.${i}`, `Rocher rouge ${i + 1}`, 'canyon', 'ground', (r) => sprite(1.2 + i * 0.3, 1.6, (c) => rockShape(c, r, 1.2 + i * 0.3, 0.6 + (i % 4) * 0.25, RED[i % 4], null)));
for (let i = 0; i < 3; i++)
  add(`arch.${i}`, `Arche naturelle ${i + 1}`, 'canyon', 'structure', () => {
    const W = 7 + i * 2;
    const H = 4 + i;
    return sprite(W, H, (c) => {
      c.beginPath();
      c.moveTo(-W / 2, 0);
      c.lineTo(-W / 2 + 0.3, -H);
      c.lineTo(W / 2 - 0.3, -H);
      c.lineTo(W / 2, 0);
      c.lineTo(W / 2 - 1.4, 0);
      c.quadraticCurveTo(0, -H * 1.35, -W / 2 + 1.4, 0);
      c.closePath();
      c.fillStyle = sideGrad(c, -W / 2, W / 2, RED[i]);
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.05;
      c.stroke();
    });
  });
for (let i = 0; i < 3; i++)
  add(`balanced.${i}`, `Rocher en équilibre ${i + 1}`, 'canyon', 'structure', (r) =>
    sprite(2.4, 4, (c) => {
      poly(c, [[-0.5, 0], [-0.3, -2.4], [0.3, -2.4], [0.5, 0]], sideGrad(c, -0.5, 0.5, RED[i + 1]), 0.05);
      rockShape(c, r, 2 + i * 0.2, 1.2, RED[i], null);
      c.translate(0, 0);
    }),
  );
for (let i = 0; i < 6; i++)
  add(`cliff.${i}`, `Falaise striée ${i + 1}`, 'canyon', 'structure', (r) =>
    sprite(5, 3.5, (c) => {
      const col = RED[i % 4];
      const pts: Pt[] = [[-2.5, 0]];
      for (let k = 0; k <= 10; k++) pts.push([-2.5 + k * 0.5, -3 - Math.sin(k + i) * 0.35 - r.range(0, 0.2)]);
      pts.push([2.5, 0]);
      poly(c, pts, sideGrad(c, -2.5, 2.5, col), 0.05);
      for (let k = 1; k < 7; k++) line(c, [[-2.4, -k * 0.45], [2.4, -k * 0.45 + r.range(-0.08, 0.08)]], shade(col, k % 2 ? 0.2 : -0.2), 0.06, false);
    }),
  );
for (let i = 0; i < 6; i++)
  add(`pebbles.${i}`, `Cailloux ${i + 1}`, i < 3 ? 'canyon' : 'desert', 'ground', (r) =>
    sprite(1.4, 0.4, (c) => {
      for (let k = 0; k < 7; k++) ell(c, r.range(-0.6, 0.6), -0.07, r.range(0.06, 0.14), r.range(0.04, 0.09), shade(i < 3 ? RED[k % 4] : '#c8a070', r.range(-0.1, 0.15)), 0.02);
    }),
  );
// vegetation: junipers 6, pinyon 4, sagebrush 6, prickly pear 4, cholla 3, yucca 4, dry grass 4, flowers 4, dead branches 4
for (let i = 0; i < 6; i++)
  add(`juniper.${i}`, `Genévrier ${i + 1}`, 'canyon', 'tree', (r) =>
    sprite(3, 3.5, (c) => {
      line(c, [[0, 0], [r.range(-0.4, 0.4), -1.4], [r.range(-0.6, 0.6), -2.2]], '#8a6a4a', 0.16);
      crown(c, r, 0, -2.4 + (i % 3) * 0.2, 1.3, 0.9, ['#5a7a4a', '#6a8a52', '#4a6a42'][i % 3], 8);
    }),
  );
for (let i = 0; i < 4; i++)
  add(`pinyon.${i}`, `Pin pignon ${i + 1}`, 'canyon', 'tree', (r) =>
    sprite(3.4, 4.5, (c) => {
      trunk(c, 2.6, 0.18, '#7a5a3a');
      crown(c, r, 0, -3.2, 1.6, 1.1, ['#3f6a3a', '#4a7a42'][i % 2], 9);
    }),
  );
for (let i = 0; i < 6; i++)
  add(`sage.${i}`, `Armoise ${i + 1}`, i < 3 ? 'canyon' : 'desert', 'bush', (r) => sprite(1.4, 0.9, (c) => crown(c, r, 0, -0.45, 0.7, 0.42, ['#9aa88a', '#a8b090', '#8a9a7a', '#b8b08a', '#a0a080', '#9a9070'][i], 9)));
for (let i = 0; i < 4; i++)
  add(`pear.${i}`, `Figuier de Barbarie ${i + 1}`, i < 2 ? 'canyon' : 'desert', 'bush', (r) =>
    sprite(1.6, 1.4, (c) => {
      const pads: [number, number, number][] = [[0, -0.3, 0.3]];
      for (let k = 0; k < 4 + i; k++) pads.push([r.range(-0.5, 0.5), -r.range(0.5, 1.1), r.range(0.18, 0.25)]);
      for (const [x, y, s] of pads) {
        ell(c, x, y, s * 0.75, s, '#5a9a4a', 0.035);
        ell(c, x - s * 0.2, y - s * 0.2, s * 0.3, s * 0.45, '#7ab85a', 0);
        if (i % 2) ell(c, x, y - s, 0.05, 0.05, '#e84a6a', 0.015);
      }
    }),
  );
for (let i = 0; i < 3; i++)
  add(`cholla.${i}`, `Cholla ${i + 1}`, 'desert', 'bush', (r) =>
    sprite(1.2, 1.6, (c) => {
      line(c, [[0, 0], [0, -0.8]], '#8a9a5a', 0.1);
      for (let k = 0; k < 6; k++) {
        const a = r.range(-2.6, -0.5);
        line(c, [[0, -0.6 - k * 0.12], [Math.cos(a) * 0.45, -0.6 - k * 0.12 + Math.sin(a) * 0.45]], '#c8c88a', 0.09);
      }
    }),
  );
for (let i = 0; i < 4; i++)
  add(`yucca.${i}`, `Yucca ${i + 1}`, i < 2 ? 'canyon' : 'desert', 'bush', (r) =>
    sprite(1.4, 2.2, (c) => {
      for (let k = 0; k < 14; k++) {
        const a = -Math.PI / 2 + r.range(-1.2, 1.2);
        line(c, [[0, -0.1], [Math.cos(a) * 0.65, -0.1 + Math.sin(a) * 0.65]], k % 2 ? '#6a8a4a' : '#8aa85a', 0.04);
      }
      if (i % 2) {
        line(c, [[0, -0.5], [0, -2]], '#8a7a4a', 0.04);
        for (let k = 0; k < 6; k++) ell(c, r.range(-0.1, 0.1), -1.5 - k * 0.08, 0.06, 0.05, '#f2efe6', 0.012);
      }
    }),
  );
for (let i = 0; i < 4; i++)
  add(`drygrass.${i}`, `Herbes sèches ${i + 1}`, i < 2 ? 'canyon' : 'desert', 'ground', (r) =>
    sprite(1.2, 0.7, (c) => {
      for (let k = 0; k < 14; k++) {
        const x = r.range(-0.5, 0.5);
        line(c, [[x, 0], [x + r.range(-0.2, 0.2), -r.range(0.25, 0.65)]], ['#c8b06a', '#d8c07a', '#b8a05a', '#e0c890'][(k + i) % 4], 0.025, false);
      }
    }),
  );
for (const [i, col, nm] of [[0, '#ff7a2a', 'Mauve orangée'], [1, '#c84ad8', 'Verveine des sables'], [2, '#f2d22a', 'Souci du désert'], [3, '#e84a6a', 'Penstemon']] as [number, string, string][])
  add(`dflower.${i}`, nm, i < 2 ? 'canyon' : 'desert', 'ground', (r) =>
    sprite(0.9, 0.6, (c) => {
      for (let k = 0; k < 7; k++) {
        const x = r.range(-0.35, 0.35);
        const h = r.range(0.2, 0.5);
        line(c, [[x, 0], [x, -h]], '#7a8a4a', 0.02, false);
        ell(c, x, -h, 0.05, 0.05, col, 0.012);
      }
    }),
  );
for (let i = 0; i < 4; i++)
  add(`deadbranch.${i}`, `Branche morte ${i + 1}`, i < 2 ? 'canyon' : 'desert', 'ground', (r) =>
    sprite(1.8, 0.6, (c) => {
      line(c, [[-0.8, -0.05], [0.8, -0.12]], '#a8927a', 0.07);
      for (let k = 0; k < 3; k++) line(c, [[r.range(-0.6, 0.6), -0.1], [r.range(-0.7, 0.7), -r.range(0.25, 0.5)]], '#a8927a', 0.04);
    }),
  );
// human traces: mine carts 2, mine entrance, windpumps 2, water tower, ranch signs 2, wagons 2, horses at a rail 2, cattle fence 2
for (let i = 0; i < 2; i++)
  add(`minecart.${i}`, `Wagonnet de mine ${i + 1}`, 'canyon', 'structure', () =>
    sprite(1.8, 1.4, (c) => {
      line(c, [[-0.9, -0.05], [0.9, -0.05]], '#6a5040', 0.05);
      poly(c, [[-0.7, -1.2], [0.7, -1.2], [0.55, -0.35], [-0.55, -0.35]], sideGrad(c, -0.7, 0.7, i ? '#8a4a2a' : '#6a6a72'), 0.04);
      if (!i) for (let k = 0; k < 4; k++) ell(c, -0.4 + k * 0.27, -1.25, 0.15, 0.1, '#5a5a5a', 0.02);
      for (const x of [-0.35, 0.35]) ell(c, x, -0.22, 0.17, 0.17, '#2a2a2e', 0.03);
    }),
  );
add('mine.0', 'Entrée de mine', 'canyon', 'structure', () =>
  sprite(4, 3.2, (c) => {
    rockShape(c, rngFor('mine'), 4, 3, RED[1], null);
    rect(c, -0.9, -2.2, 1.8, 2.2, '#1a1410', 0.04);
    rect(c, -1.05, -2.35, 2.1, 0.2, '#8a5a33', 0.03);
    rect(c, -1.05, -2.2, 0.18, 2.2, '#8a5a33', 0.03);
    rect(c, 0.87, -2.2, 0.18, 2.2, '#8a5a33', 0.03);
  }), 0.4);
const windpump = (c: Ctx, H: number): void => {
  line(c, [[-0.6, 0], [0, -H]], '#8a8a92', 0.06);
  line(c, [[0.6, 0], [0, -H]], '#8a8a92', 0.06);
  for (let k = 1; k < 4; k++) line(c, [[-0.6 + k * 0.15, -H * k / 4], [0.6 - k * 0.15, -H * k / 4]], '#8a8a92', 0.04);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    poly(c, [[0, -H], [Math.cos(a) * 1.1, -H + Math.sin(a) * 1.1], [Math.cos(a + 0.35) * 1.1, -H + Math.sin(a + 0.35) * 1.1]], '#d8d8de', 0.02);
  }
  poly(c, [[0.1, -H], [1.6, -H - 0.3], [1.6, -H + 0.3]], '#c8302a', 0.03);
};
for (let i = 0; i < 2; i++) add(`windpump.${i}`, `Éolienne de pompage ${i + 1}`, i ? 'desert' : 'canyon', 'structure', () => sprite(3.4, 6.5 + i, (c) => windpump(c, 5.2 + i)), 0.4);
add('watertower.0', 'Château d’eau en bois', 'canyon', 'structure', () =>
  sprite(3, 6, (c) => {
    for (const x of [-1, 1]) line(c, [[x * 1.1, 0], [x * 0.8, -3.6]], '#7a4a2a', 0.12);
    line(c, [[-1, -1.2], [1, -2.6]], '#7a4a2a', 0.06);
    line(c, [[1, -1.2], [-1, -2.6]], '#7a4a2a', 0.06);
    rect(c, -1.2, -5.4, 2.4, 1.8, sideGrad(c, -1.2, 1.2, '#a8733e'), 0.05, 0.1);
    poly(c, [[-1.35, -5.4], [0, -6], [1.35, -5.4]], '#5e3a22', 0.04);
  }), 0.4);
for (let i = 0; i < 2; i++)
  add(`ranchsign.${i}`, `Portail de ranch ${i + 1}`, 'canyon', 'structure', () =>
    sprite(4, 3.5, (c) => {
      rect(c, -1.9, -3.3, 0.2, 3.3, '#7a4a2a', 0.03);
      rect(c, 1.7, -3.3, 0.2, 3.3, '#7a4a2a', 0.03);
      rect(c, -2, -3.3, 4, 0.2, '#7a4a2a', 0.03);
      rect(c, -1.2, -3.0, 2.4, 0.55, '#d6a670', 0.03);
      c.save();
      line(c, [[-0.9, -2.72], [0.9, -2.72]], '#5e3a22', i ? 0.08 : 0.05, false);
      c.restore();
    }),
  );
for (let i = 0; i < 2; i++)
  add(`wagon.${i}`, i ? 'Chariot bâché' : 'Vieux chariot', 'canyon', 'structure', () =>
    sprite(3.4, 2.6, (c) => {
      rect(c, -1.5, -1.3, 3, 0.6, '#8a5a33', 0.04);
      if (i) {
        c.beginPath();
        c.moveTo(-1.4, -1.3);
        c.quadraticCurveTo(0, -3.2, 1.4, -1.3);
        c.closePath();
        c.fillStyle = '#f2ead6';
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = 0.04;
        c.stroke();
      }
      for (const x of [-1, 1]) {
        ell(c, x, -0.55, 0.55, 0.55, 'rgba(0,0,0,0)', 0.06);
        for (let k = 0; k < 8; k++) line(c, [[x, -0.55], [x + Math.cos(k) * 0.5, -0.55 + Math.sin(k) * 0.5]], '#6a4026', 0.03, false);
      }
    }),
  );
for (let i = 0; i < 2; i++)
  add(`cattlefence.${i}`, `Clôture en barbelés ${i + 1}`, i ? 'desert' : 'canyon', 'structure', () =>
    sprite(3.2, 1.3, (c) => {
      for (let k = 0; k < 3; k++) line(c, [[-1.5 + k * 1.5, 0], [-1.5 + k * 1.5 + (k === 1 && i ? 0.15 : 0), -1.2]], '#8a6a4a', 0.07);
      for (const y of [-0.4, -0.75, -1.05]) line(c, [[-1.6, y], [1.6, y + 0.03]], '#6a6a6a', 0.012, false);
    }),
  );
for (let i = 0; i < 2; i++) add(`horseCanyon.${i}`, `Cheval de ranch ${i + 1}`, 'canyon', 'animal', (r) => sprite(2.8, 2.1, (c) => quad(c, i ? '#e6d2b0' : '#8a4a2a', i ? null : '#f2efe6', 2, 1.6, 'horse', r)), 0.3);

// ======================================================================= DESERT

// saguaro 8, barrel 4, agave 4, joshua 4, ocotillo 3, palms 6, dune grass 4, shrubs 8, tumbleweed 4,
// sandstone 6, boulders 6, dead trees 4, camels 3, tents 3, adobe 3, well, oasis reeds 3, ruins 3,
// ancient arches 2, jeeps 2, rally signs 3, wind rocks 4, lizards 2
for (let i = 0; i < 8; i++)
  add(`saguaro.${i}`, `Saguaro ${i + 1}`, 'desert', 'tree', (r) => {
    const H = 3 + (i % 4) * 0.8;
    return sprite(2.4, H + 0.2, (c) => {
      const w = 0.22;
      const arm = (x0: number, y0: number, dir: number, len: number, up: number) => {
        line(c, [[x0, y0], [x0 + dir * len, y0], [x0 + dir * len, y0 - up]], '#4f8a42', w * 1.3);
        line(c, [[x0, y0], [x0 + dir * len, y0], [x0 + dir * len, y0 - up]], '#6aa84f', w * 0.6, false);
      };
      const arms = i % 4;
      for (let k = 0; k < arms; k++) arm(0, -H * r.range(0.35, 0.6), k % 2 ? 1 : -1, r.range(0.45, 0.7), r.range(0.6, 1.2));
      line(c, [[0, 0], [0, -H + w]], '#4f8a42', w * 2);
      line(c, [[-w * 0.35, -0.1], [-w * 0.35, -H + w * 1.4]], '#7ab85a', w * 0.6, false);
      for (const x of [-w * 0.65, 0, w * 0.65]) line(c, [[x, -0.1], [x, -H + w * 1.2]], 'rgba(30,70,40,0.5)', 0.02, false);
      if (i >= 4) for (let k = 0; k < 3; k++) ell(c, r.range(-0.1, 0.1), -H + 0.05, 0.06, 0.05, '#f2efe6', 0.012);
    });
  });
for (let i = 0; i < 4; i++)
  add(`barrel.${i}`, `Cactus tonneau ${i + 1}`, 'desert', 'bush', () =>
    sprite(1, 1, (c) => {
      const h = 0.45 + i * 0.12;
      ell(c, 0, -h / 2, 0.35, h / 2, '#5a9a4a', 0.035);
      for (const x of [-0.2, 0, 0.2]) line(c, [[x, -0.05], [x * 1.1, -h + 0.05]], '#3a7a3a', 0.02, false);
      for (let k = 0; k < 3; k++) ell(c, -0.1 + k * 0.1, -h, 0.05, 0.04, ['#ff8a2a', '#f2d22a', '#e84a6a', '#ff6a3a'][i], 0.012);
    }),
  );
for (let i = 0; i < 4; i++)
  add(`agave.${i}`, `Agave ${i + 1}`, 'desert', 'bush', (r) =>
    sprite(1.6, 1.2, (c) => {
      for (let k = 0; k < 11; k++) {
        const a = -Math.PI / 2 + (k / 10 - 0.5) * 2.6;
        const L = r.range(0.5, 0.8) * (1 - Math.abs(k / 10 - 0.5) * 0.4);
        poly(c, [[-0.06, 0], [Math.cos(a) * L, Math.sin(a) * L], [0.06, 0]], ['#6a9a8a', '#7aa88a', '#5a8a7a', '#8ab09a'][i], 0.02);
      }
    }),
  );
for (let i = 0; i < 4; i++)
  add(`joshua.${i}`, `Arbre de Josué ${i + 1}`, 'desert', 'tree', (r) =>
    sprite(3.2, 4.4, (c) => {
      const branch = (x: number, y: number, a: number, len: number, d: number) => {
        const ex = x + Math.cos(a) * len;
        const ey = y + Math.sin(a) * len;
        line(c, [[x, y], [ex, ey]], '#8a7a5a', 0.16 - d * 0.03);
        if (d < 2) {
          branch(ex, ey, a - r.range(0.4, 0.8), len * 0.7, d + 1);
          branch(ex, ey, a + r.range(0.4, 0.8), len * 0.7, d + 1);
        } else for (let k = 0; k < 7; k++) line(c, [[ex, ey], [ex + Math.cos(k) * 0.22, ey + Math.sin(k) * 0.22]], '#6a8a4a', 0.04, false);
      };
      branch(0, 0, -Math.PI / 2 + r.range(-0.15, 0.15), 1.6 + i * 0.15, 0);
    }),
  );
for (let i = 0; i < 3; i++)
  add(`ocotillo.${i}`, `Ocotillo ${i + 1}`, 'desert', 'bush', (r) =>
    sprite(2, 3, (c) => {
      for (let k = 0; k < 9; k++) {
        const a = -Math.PI / 2 + r.range(-0.6, 0.6);
        const L = r.range(2, 2.8);
        line(c, [[0, 0], [Math.cos(a) * L * 0.5 + r.range(-0.1, 0.1), Math.sin(a) * L * 0.5], [Math.cos(a) * L, Math.sin(a) * L]], '#7a6a4a', 0.04);
        if (i) ell(c, Math.cos(a) * L, Math.sin(a) * L, 0.05, 0.12, '#e84a2a', 0.012);
      }
    }),
  );
for (let i = 0; i < 6; i++)
  add(`palmD.${i}`, `Palmier ${i < 3 ? 'dattier' : 'éventail'} ${(i % 3) + 1}`, 'desert', 'tree', (r) => {
    const H = 5 + (i % 3) * 1.4;
    return sprite(4.4, H + 0.8, (c) => {
      const lean = r.range(-0.5, 0.6);
      for (let k = 0; k < 12; k++) {
        const t0 = k / 12;
        const t1 = (k + 1) / 12;
        poly(c, [[lean * t0 * t0 - 0.2, -t0 * H], [lean * t1 * t1 - 0.18, -t1 * H], [lean * t1 * t1 + 0.18, -t1 * H], [lean * t0 * t0 + 0.2, -t0 * H]], k % 2 ? '#9a7048' : '#b0845a', 0.03);
      }
      const tx = lean;
      const ty = -H;
      for (let k = 0; k < (i < 3 ? 10 : 14); k++) {
        const a = -Math.PI / 2 + (k / 9 - 0.5) * Math.PI * 1.6;
        const L = i < 3 ? r.range(1.6, 2.1) : r.range(1, 1.3);
        const ex = tx + Math.cos(a) * L;
        const ey = ty + Math.sin(a) * L * 0.5 + (i < 3 ? L * 0.4 : 0);
        if (i < 3) {
          for (let j = 1; j <= 10; j++) {
            const t = j / 11;
            const x = tx + (ex - tx) * t;
            const y = ty + (ey - ty) * t - Math.sin(Math.PI * t) * 0.3;
            line(c, [[x, y], [x - 0.12, y + 0.3 * Math.sin(Math.PI * t)]], k % 2 ? '#2f6b34' : '#4f9a45', 0.06, false);
            line(c, [[x, y], [x + 0.12, y + 0.3 * Math.sin(Math.PI * t)]], k % 2 ? '#2f6b34' : '#4f9a45', 0.06, false);
          }
        } else poly(c, [[tx, ty], [ex - 0.15, ey], [ex + 0.15, ey]], k % 2 ? '#3f7a3a' : '#5a9a45', 0.02);
      }
      if (i < 3) for (let k = 0; k < 4; k++) ell(c, tx + r.range(-0.15, 0.15), ty + 0.2, 0.09, 0.09, '#c86a2a', 0.015);
    });
  });
for (let i = 0; i < 4; i++)
  add(`dunegrass.${i}`, `Oyat des dunes ${i + 1}`, 'desert', 'ground', (r) =>
    sprite(1.3, 0.9, (c) => {
      for (let k = 0; k < 16; k++) {
        const x = r.range(-0.55, 0.55);
        const a = -Math.PI / 2 + r.range(-0.7, 0.7);
        const L = r.range(0.35, 0.85);
        line(c, [[x, 0], [x + Math.cos(a) * L, Math.sin(a) * L]], ['#a8a85a', '#c8b86a', '#8a9a4a', '#b8a860'][i], 0.025, false);
      }
    }),
  );
for (let i = 0; i < 8; i++) add(`dshrub.${i}`, `Buisson sec ${i + 1}`, 'desert', 'bush', (r) => sprite(1.2 + (i % 3) * 0.3, 0.9, (c) => crown(c, r, 0, -0.42, 0.6 + (i % 3) * 0.15, 0.4, ['#8f8a45', '#a9a456', '#77733a', '#9a8a4a', '#b8a860', '#7a8a4a', '#a89a5a', '#8a7a3a'][i], 10)));
for (let i = 0; i < 4; i++)
  add(`tumble.${i}`, `Virevoltant ${i + 1}`, 'desert', 'ground', (r) =>
    sprite(1 + i * 0.15, 1 + i * 0.15, (c) => {
      const R = 0.4 + i * 0.07;
      ell(c, 0, -R, R, R, 'rgba(170,130,80,0.85)', 0);
      for (let k = 0; k < 90; k++) {
        const a0 = r.range(0, 6.28);
        c.beginPath();
        c.arc(0, -R, r.range(0.05, R), a0, a0 + r.range(0.8, 2));
        c.strokeStyle = ['#a8834f', '#c49d62', '#8a6a3c'][k % 3];
        c.lineWidth = 0.022;
        c.stroke();
      }
    }),
  );
for (let i = 0; i < 6; i++)
  add(`sandstoneB.${i}`, `Dalle de grès ${i + 1}`, 'desert', 'structure', (r) => {
    const W = 2 + i * 0.6;
    const H = 1.2 + (i % 3) * 0.5;
    return sprite(W, H, (c) => {
      rockShape(c, r, W, H, ['#c8784a', '#d98a5a', '#b8683a'][i % 3], null);
      for (let k = 1; k < 4; k++) line(c, [[-W * 0.4, -H * k / 4], [W * 0.4, -H * k / 4]], 'rgba(255,214,160,0.45)', 0.05, false);
    });
  });
for (let i = 0; i < 6; i++) add(`dboulder.${i}`, `Rocher du désert ${i + 1}`, 'desert', 'ground', (r) => sprite(1 + i * 0.35, 1.4, (c) => rockShape(c, r, 1 + i * 0.35, 0.5 + (i % 3) * 0.25, ['#b88a5a', '#a87a50', '#c89a6a'][i % 3], null)));
for (let i = 0; i < 4; i++)
  add(`ddead.${i}`, `Acacia mort ${i + 1}`, 'desert', 'tree', (r) =>
    sprite(3.6, 3.8, (c) => {
      const br = (x: number, y: number, a: number, L: number, w: number, d: number) => {
        const ex = x + Math.cos(a) * L;
        const ey = y + Math.sin(a) * L;
        line(c, [[x, y], [ex, ey]], '#a3866a', w);
        if (d < 4) for (let k = 0; k < 2; k++) br(ex, ey, a + (k ? 1 : -1) * r.range(0.3, 0.8), L * 0.65, w * 0.65, d + 1);
      };
      br(0, 0, -Math.PI / 2, 1.3 + i * 0.1, 0.2, 0);
    }),
  );
for (const [i, nm, sit] of [[0, 'Dromadaire debout', false], [1, 'Dromadaire couché', true], [2, 'Jeune dromadaire', false]] as [number, string, boolean][])
  add(`camel.${i}`, nm, 'desert', 'animal', () => {
    const k = i === 2 ? 0.7 : 1;
    return sprite(3 * k, 2.6 * k, (c) => {
      c.scale(k, k);
      if (!sit) for (const x of [-0.8, -0.6, 0.6, 0.8]) rect(c, x - 0.06, -1.3, 0.12, 1.3, '#b8875a', 0.025);
      const by = sit ? -0.55 : -1.55;
      ell(c, 0, by, 1.1, 0.4, sideGrad(c, -1.1, 1.1, '#c8975a'), 0.04);
      ell(c, -0.1, by - 0.45, 0.45, 0.35, '#c8975a', 0.04);
      line(c, [[0.9, by - 0.1], [1.25, by - 0.7], [1.35, by - 0.9]], '#c8975a', 0.22);
      ell(c, 1.45, by - 0.95, 0.25, 0.13, '#c8975a', 0.035);
    });
  }, 0.4);
for (const [i, col] of [[0, '#3a2a20'], [1, '#8a2a2a'], [2, '#e6d2b0']] as [number, string][])
  add(`btent.${i}`, `Tente nomade ${i + 1}`, 'desert', 'structure', () =>
    sprite(5, 2.6, (c) => {
      c.beginPath();
      c.moveTo(-2.4, 0);
      c.quadraticCurveTo(-1.6, -2.4, 0, -2.2);
      c.quadraticCurveTo(1.6, -2.4, 2.4, 0);
      c.closePath();
      c.fillStyle = sideGrad(c, -2.4, 2.4, col);
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.05;
      c.stroke();
      for (let k = 0; k < 5; k++) line(c, [[-2 + k * 1, -0.05], [-1.8 + k, -1.6]], shade(col, 0.25), 0.05, false);
      rect(c, -0.6, -1.3, 1.2, 1.3, '#1a1410', 0.03);
    }), 0.5);
for (let i = 0; i < 3; i++)
  add(`adobe.${i}`, `Maison en adobe ${i + 1}`, 'desert', 'structure', (r) =>
    sprite(5 + i, 4, (c) => {
      const W = 4 + i;
      rect(c, -W / 2, -3, W, 3, sideGrad(c, -W / 2, W / 2, '#d9a870'), 0.05, 0.25);
      for (let k = 0; k < 4; k++) rect(c, -W / 2 + 0.4 + k * (W / 4), -2.9, 0.12, 0.12, '#7a4a2a', 0.02);
      rect(c, -0.45, -1.8, 0.9, 1.8, '#5a3a22', 0.03, 0.4);
      rect(c, W / 4 - 0.35, -2.2, 0.7, 0.6, '#3a2a20', 0.03);
      void r;
    }), 0.4);
add('dwell.0', 'Puits du désert', 'desert', 'structure', (r) =>
  sprite(1.8, 2.2, (c) => {
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) ell(c, -0.6 + k * 0.4 + (row % 2) * 0.2, -0.15 - row * 0.25, 0.2, 0.13, shade('#d9a870', r.range(-0.15, 0.1)), 0.02);
    line(c, [[-0.7, -0.7], [-0.7, -2], [0.7, -2], [0.7, -0.7]], '#7a4a2a', 0.08);
  }),
);
for (let i = 0; i < 3; i++) add(`oasisreed.${i}`, `Papyrus ${i + 1}`, 'desert', 'ground', (r) => sprite(1.4, 1.8, (c) => {
  for (let k = 0; k < 8; k++) {
    const x = r.range(-0.5, 0.5);
    const h = r.range(1, 1.6);
    line(c, [[x, 0], [x, -h]], '#5a8a3a', 0.03, false);
    for (let j = 0; j < 7; j++) line(c, [[x, -h], [x + Math.cos(j) * 0.18, -h + Math.sin(j) * 0.18]], '#7aa84a', 0.02, false);
  }
}), 0.6);
for (let i = 0; i < 3; i++)
  add(`ruin.${i}`, `Colonnes en ruine ${i + 1}`, 'desert', 'structure', (r) =>
    sprite(3.5, 4.2, (c) => {
      for (let k = 0; k < 2 + i % 2; k++) {
        const x = -1.2 + k * 1.2;
        const h = r.range(1.5, 3.8);
        rect(c, x - 0.3, -h, 0.6, h, sideGrad(c, x - 0.3, x + 0.3, '#e6c89a'), 0.04);
        rect(c, x - 0.4, -h - 0.15, 0.8, 0.18, '#d9b886', 0.03);
        for (let j = 1; j < 4; j++) line(c, [[x - 0.15, -0.1], [x - 0.15, -h + 0.1]], 'rgba(150,100,60,0.4)', 0.02, false);
      }
      ell(c, 1.2, -0.25, 0.5, 0.25, '#d9b886', 0.03);
    }), 0.4);
for (let i = 0; i < 2; i++)
  add(`dgate.${i}`, `Porte antique ${i + 1}`, 'desert', 'structure', () =>
    sprite(4, 4.5, (c) => {
      rect(c, -1.9, -4.2, 1, 4.2, sideGrad(c, -1.9, -0.9, '#e0bc8a'), 0.04);
      rect(c, 0.9, -4.2, 1, 4.2, sideGrad(c, 0.9, 1.9, '#e0bc8a'), 0.04);
      if (!i) rect(c, -2, -4.5, 4, 0.5, '#d9b07a', 0.04);
      else {
        c.beginPath();
        c.moveTo(-2, -4.2);
        c.quadraticCurveTo(0, -5.6, 2, -4.2);
        c.lineTo(0.9, -4.2);
        c.quadraticCurveTo(0, -4.9, -0.9, -4.2);
        c.closePath();
        c.fillStyle = '#d9b07a';
        c.fill();
        c.stroke();
      }
    }), 0.3);
for (const [i, col] of [[0, '#c8a03a'], [1, '#5a7a4a']] as [number, string][])
  add(`jeep.${i}`, `Vieux 4x4 ${i + 1}`, 'desert', 'structure', () =>
    sprite(4, 2.2, (c) => {
      rect(c, -1.8, -1.5, 3.6, 0.8, sideGrad(c, -1.8, 1.8, col), 0.04, 0.1);
      rect(c, -1.2, -2.1, 1.8, 0.6, 'rgba(160,210,240,0.7)', 0.04, 0.05);
      rect(c, -1.95, -1.3, 0.25, 0.4, '#3a3a3a', 0.03);
      for (const x of [-1.15, 1.15]) {
        ell(c, x, -0.42, 0.42, 0.42, '#2a2420', 0.04);
        ell(c, x, -0.42, 0.18, 0.18, '#9a9a9a', 0.02);
      }
    }), 0.3);
for (let i = 0; i < 3; i++)
  add(`rallysign.${i}`, `Balise de rallye ${i + 1}`, 'desert', 'structure', () =>
    sprite(1.2, 2.4, (c) => {
      line(c, [[0, 0], [0, -2.2]], '#e6e6e6', 0.06);
      rect(c, -0.5, -2.3, 1, 0.6, ['#d8261f', '#ffd21f', '#1f6fd6'][i], 0.03);
      poly(c, [[-0.3, -2.0], [0.15, -2.0], [0.15, -2.12], [0.35, -1.95], [0.15, -1.78], [0.15, -1.9], [-0.3, -1.9]], '#ffffff', 0.015);
    }), 0.5);
for (let i = 0; i < 4; i++)
  add(`windrock.${i}`, `Rocher sculpté par le vent ${i + 1}`, 'desert', 'structure', (r) =>
    sprite(3, 3.4, (c) => {
      poly(c, [[-0.35, 0], [-0.25, -1.2], [0.3, -1.2], [0.4, 0]], sideGrad(c, -0.4, 0.4, '#c8885a'), 0.04);
      const W = 2.2 + i * 0.2;
      poly(c, [[-W / 2, -1.2], [-W / 2 + 0.2, -2.6 - i * 0.15], [W / 2 - 0.4, -3 - r.range(0, 0.3)], [W / 2, -1.6]], sideGrad(c, -W / 2, W / 2, '#d9985f'), 0.05);
      for (let k = 1; k < 4; k++) line(c, [[-W * 0.4, -1.2 - k * 0.45], [W * 0.4, -1.2 - k * 0.45]], 'rgba(255,214,160,0.4)', 0.05, false);
    }), 0.5);
for (let i = 0; i < 2; i++)
  add(`lizard.${i}`, `Lézard ${i + 1}`, 'desert', 'ground', () =>
    sprite(0.9, 0.3, (c) => {
      const col = i ? '#5a9a6a' : '#c8a060';
      ell(c, 0, -0.08, 0.2, 0.06, col, 0.02);
      ell(c, 0.24, -0.09, 0.07, 0.05, col, 0.02);
      line(c, [[-0.18, -0.08], [-0.42, -0.12]], col, 0.03);
      for (const x of [-0.1, 0.1]) line(c, [[x, -0.06], [x + 0.05, -0.0]], col, 0.02, false);
    }), 0.3);

// people at the side of the trails (walkers)
for (let i = 0; i < 4; i++)
  add(`hiker.${i}`, `Randonneur ${i + 1}`, i < 2 ? 'alpes' : 'foret', 'animal', () =>
    sprite(1, 1.9, (c) => {
      person(c, 0, { shirt: ['#d8261f', '#1f6fd6', '#ffd21f', '#2fa84f'][i], pants: '#2a3550', skin: '#e0ac85', hair: '#5a3a22', hat: i % 2 ? '#3a8ad8' : undefined, pose: i === 3 ? 'point' : 'stand' });
      rect(c, -0.3, -1.45, 0.22, 0.4, '#5a7a3a', 0.025, 0.05);
    }), 0.3);


// --- extra canyon set: cottonwoods 6, spires 6, petroglyph boulders 4, dry wash logs 4
for (const [hi, H] of [[0, 6], [1, 8]] as [number, number][])
  for (const [ki, col, nm] of [[0, '#6aa84a', 'vert'], [1, '#c8b03a', 'doré'], [2, '#e09a2a', 'orangé']] as [number, string, string][])
    add(`cottonwood.${hi}.${ki}`, `Peuplier du canyon ${nm} ${H} m`, 'canyon', 'tree', (r) =>
      sprite(4.5, H, (c) => {
        trunk(c, H * 0.55, 0.3, '#8a7a6a', r.range(-0.3, 0.3));
        line(c, [[0, -H * 0.45], [-1, -H * 0.62]], '#8a7a6a', 0.14);
        crown(c, r, 0, -H * 0.7, 2, H * 0.24, col, 12);
      }),
    );
for (let i = 0; i < 6; i++)
  add(`spires.${i}`, `Aiguilles rocheuses ${i + 1}`, 'canyon', 'structure', (r) =>
    sprite(4, 5.5, (c) => {
      for (let k = 0; k < 3 + (i % 3); k++) {
        const x = -1.5 + k * 0.9 + r.range(-0.2, 0.2);
        const h = r.range(2.5, 5.2);
        const w = r.range(0.35, 0.6);
        poly(c, [[x - w, 0], [x - w * 0.4, -h], [x + w * 0.3, -h - 0.2], [x + w, 0]], sideGrad(c, x - w, x + w, RED[(k + i) % 4]), 0.04);
      }
    }),
  );
for (let i = 0; i < 4; i++)
  add(`petro.${i}`, `Rocher gravé ${i + 1}`, 'canyon', 'ground', (r) =>
    sprite(2.2, 1.6, (c) => {
      rockShape(c, r, 2, 1.3, '#7a4a3a', null);
      c.strokeStyle = '#e6c89a';
      c.lineWidth = 0.035;
      // engraved spirals and little figures
      c.beginPath();
      for (let a = 0; a < 12; a += 0.3) c.lineTo(-0.4 + Math.cos(a) * a * 0.025, -0.7 + Math.sin(a) * a * 0.025);
      c.stroke();
      for (let k = 0; k < 2 + i; k++) {
        const x = 0.1 + k * 0.22;
        c.beginPath();
        c.moveTo(x, -0.95);
        c.lineTo(x, -0.6);
        c.moveTo(x - 0.08, -0.82);
        c.lineTo(x + 0.08, -0.82);
        c.moveTo(x, -0.6);
        c.lineTo(x - 0.06, -0.45);
        c.moveTo(x, -0.6);
        c.lineTo(x + 0.06, -0.45);
        c.stroke();
      }
    }),
  );
for (let i = 0; i < 4; i++)
  add(`washlog.${i}`, `Bois flotté ${i + 1}`, 'canyon', 'ground', (r) =>
    sprite(2.4, 0.6, (c) => {
      line(c, [[-1.1, -0.15], [1.1, -0.2 - r.range(0, 0.1)]], '#c8b49a', 0.2);
      line(c, [[0.5, -0.2], [0.9, -0.5]], '#c8b49a', 0.08);
    }),
  );
// --- extra alpine set: alpine flowers 4, refuges 2, milk cans 2, hay racks 2
for (const [i, col, nm] of [[0, '#ffffff', 'Edelweiss'], [1, '#d84a8a', 'Rhododendrons'], [2, '#3a5ad8', 'Myosotis'], [3, '#f2d22a', 'Arnica']] as [number, string, string][])
  add(`alpflower.${i}`, nm, 'alpes', 'ground', (r) =>
    sprite(1, 0.5, (c) => {
      for (let k = 0; k < 8; k++) {
        const x = r.range(-0.4, 0.4);
        const h = r.range(0.12, 0.35);
        line(c, [[x, 0], [x, -h]], '#5a8a4a', 0.02, false);
        for (let j = 0; j < 6; j++) ell(c, x + Math.cos(j) * 0.035, -h + Math.sin(j) * 0.035, 0.03, 0.03, col, 0.008);
      }
    }),
  );
for (let i = 0; i < 2; i++)
  add(`refuge.${i}`, `Refuge de montagne ${i + 1}`, 'alpes', 'structure', (r) =>
    sprite(6, 5, (c) => {
      for (let row = 0; row < 6; row++) for (let x = -2.5 + (row % 2) * 0.25; x < 2.5; x += 0.5) ell(c, x, -0.25 - row * 0.45, 0.26, 0.22, shade('#9a978e', r.range(-0.15, 0.1)), 0.02);
      poly(c, [[-3, -2.8], [0, -4.6], [3, -2.8]], i ? '#4a4a52' : '#8a3a2a', 0.05);
      rect(c, -0.4, -1.7, 0.8, 1.7, '#5a3a22', 0.03);
      rect(c, 1.2, -2.2, 0.7, 0.6, '#9fd0f0', 0.03);
    }), 0.3);
for (let i = 0; i < 2; i++)
  add(`milkcan.${i}`, `Bidons de lait ${i + 1}`, 'alpes', 'ground', () =>
    sprite(1, 0.9, (c) => {
      for (let k = 0; k < 1 + i; k++) {
        const x = -0.2 + k * 0.4;
        rect(c, x - 0.15, -0.6, 0.3, 0.6, sideGrad(c, x - 0.15, x + 0.15, '#c8ccd4'), 0.03, 0.05);
        rect(c, x - 0.08, -0.75, 0.16, 0.15, '#c8ccd4', 0.025);
      }
    }),
  );
for (let i = 0; i < 2; i++)
  add(`hayrack.${i}`, `Séchoir à foin ${i + 1}`, 'alpes', 'structure', (r) =>
    sprite(3, 2.2, (c) => {
      for (const x of [-1.3, 1.3]) rect(c, x - 0.06, -2, 0.12, 2, '#7a4a2a', 0.03);
      for (let k = 0; k < 4; k++) rect(c, -1.4, -0.5 - k * 0.42, 2.8, 0.06, '#8a5a33', 0.02);
      if (i) for (let k = 0; k < 4; k++) crown(c, r, r.range(-0.8, 0.8), -0.7 - k * 0.42, 0.5, 0.2, '#d9c25a', 4);
    }),
  );

export const NATURE_ASSETS = out;
