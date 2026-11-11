import { Rng } from '../core/math';
import { INK } from '../render/palette';
import { quad, RED, rockShape, trunk } from './nature';
import { BRANDS, crown, Ctx, ell, HAIRS, label, line, PANTS, person, poly, Pt, rect, rngFor, shade, SHIRTS, sideGrad, SKINS, sprite } from './paint';
import type { AssetDef, AssetGroup, Obstacle, Slot } from './types';

/**
 * v2.6 expansion: 350 more assets.
 *  - 55 per world (Alpes, Grande Forêt, Canyon, Désert)
 *  - 80 trial: big physical obstacles for the trial circuits (+ circuit decor)
 *  - 70 enduro: hill-climb dressing and physical steps for the big hills
 */

const out: AssetDef[] = [];
function add(id: string, name: string, group: AssetGroup, slot: Slot, draw: (r: Rng) => ReturnType<typeof sprite>, weight = 1, obstacle?: Obstacle): void {
  out.push({ id, name, group, slot, draw: () => draw(rngFor(id)), weight, obstacle });
}
const fan = (r: Rng, pose: 'stand' | 'cheer' | 'point' | 'flag' | 'camera' | 'sit', shirt?: string) => ({
  shirt: shirt ?? r.pick(SHIRTS),
  pants: r.pick(PANTS),
  skin: r.pick(SKINS),
  hair: r.pick(HAIRS),
  hat: r.chance(0.35) ? r.pick(SHIRTS) : undefined,
  pose,
});
const box = (bevel: number) => (u: number) => Math.min(1, u / bevel, (1 - u) / bevel);
const round = (u: number) => Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
/** Smooth hump: rounded top, ~40° flanks. */
const hump = (u: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, u))) ** 0.7;

// ======================================================================= ALPES (55)

for (let i = 0; i < 3; i++)
  add(`x.pylon.${i}`, `Pylône de télésiège ${i + 1}`, 'alpes', 'structure', () =>
    sprite(3, 9, (c) => {
      line(c, [[0, 0], [0, -8]], '#8a8f9a', 0.22);
      rect(c, -1.4, -8.3, 2.8, 0.3, '#5a5f6a', 0.04);
      for (const x of [-1.2, 1.2]) ell(c, x, -8.1, 0.2, 0.2, '#2a2a2e', 0.03);
      line(c, [[-1.5, -8.2], [1.5, -8.2]], '#3a3a40', 0.03, false);
      if (i) {
        line(c, [[1.2, -8.1], [1.2, -7]], '#3a3a40', 0.04);
        rect(c, 0.8, -7.1, 0.8, 0.5, ['#d8261f', '#ffd21f'][i - 1], 0.03, 0.05);
      }
    }), 0.25);
for (const [i, col] of [[0, '#d8261f'], [1, '#2a5ad8'], [2, '#ffd21f']] as [number, string][])
  add(`x.flaghut.${i}`, `Cabane au drapeau ${i + 1}`, 'alpes', 'structure', () =>
    sprite(4, 5, (c) => {
      rect(c, -1.6, -2.4, 3.2, 2.4, sideGrad(c, -1.6, 1.6, '#a86a3a'), 0.04);
      poly(c, [[-2, -2.4], [0, -3.6], [2, -2.4]], '#5e3a22', 0.04);
      line(c, [[1.4, -2.4], [1.4, -4.8]], '#e6e6e6', 0.05);
      rect(c, 1.43, -4.8, 0.7, 0.45, col, 0.02);
      rect(c, -0.4, -1.5, 0.8, 1.5, '#5e3a22', 0.03);
    }), 0.4);
for (let i = 0; i < 3; i++)
  add(`x.marmot.${i}`, `Marmotte ${i + 1}`, 'alpes', 'animal', () =>
    sprite(0.6, 0.6, (c) => {
      ell(c, 0, -0.25, 0.16, 0.24, '#a8784e', 0.025);
      ell(c, 0, -0.52, 0.11, 0.1, '#a8784e', 0.025);
      ell(c, 0.05, -0.52, 0.02, 0.02, INK, 0);
      if (i === 2) {
        ell(c, -0.09, -0.35, 0.05, 0.04, '#a8784e', 0.015);
        ell(c, 0.09, -0.35, 0.05, 0.04, '#a8784e', 0.015);
      }
    }), 0.4);
for (let i = 0; i < 3; i++)
  add(`x.ibex.${i}`, `Bouquetin ${i + 1}`, 'alpes', 'animal', (r) =>
    sprite(2, 1.8, (c) => {
      quad(c, '#8a7458', null, 1.3, 1.1, 'goat', r);
      c.beginPath();
      c.arc(0.74, -1.12, 0.3 + i * 0.05, Math.PI * 1.1, Math.PI * 1.75);
      c.strokeStyle = '#6a5a48';
      c.lineWidth = 0.06;
      c.stroke();
    }), 0.25);
for (let i = 0; i < 2; i++) add(`x.stbernard.${i}`, `Chien de montagne ${i + 1}`, 'alpes', 'animal', (r) => sprite(1.4, 1, (c) => quad(c, '#f2efe6', '#a8582a', 0.9, 0.75, 'cow', r)), 0.2);
for (let i = 0; i < 4; i++)
  add(`x.lakerock.${i}`, `Rocher de lac ${i + 1}`, 'alpes', 'ground', (r) =>
    sprite(2, 0.8, (c) => {
      ell(c, 0, -0.04, 0.95, 0.06, 'rgba(90,170,230,0.7)', 0);
      rockShape(c, r, 1 + i * 0.2, 0.55, '#9a9ca6', i % 2 ? '#6aa84a' : null);
    }));
for (let i = 0; i < 4; i++)
  add(`x.snow.${i}`, `Névé ${i + 1}`, 'alpes', 'ground', (r) =>
    sprite(2.4, 0.5, (c) => {
      const pts: Pt[] = [[-1.1, 0]];
      for (let k = 0; k <= 8; k++) pts.push([-1.1 + k * 0.275, -0.15 - r.range(0, 0.25)]);
      pts.push([1.1, 0]);
      poly(c, pts, '#f4f8ff', 0.03);
      ell(c, -0.3, -0.18, 0.4, 0.05, '#c8d6f0', 0);
    }));
for (let i = 0; i < 4; i++) add(`x.glacierrock.${i}`, `Bloc erratique ${i + 1}`, 'alpes', 'structure', (r) => sprite(3 + i * 0.4, 2.4, (c) => rockShape(c, r, 3 + i * 0.4, 1.6 + i * 0.15, '#8e9098', '#7ab05a')), 0.5);
for (let i = 0; i < 2; i++)
  add(`x.fountain.${i}`, `Fontaine en bois ${i + 1}`, 'alpes', 'structure', () =>
    sprite(2.2, 1.6, (c) => {
      rect(c, -1, -0.6, 2, 0.6, sideGrad(c, -1, 1, '#7a4a2a'), 0.04, 0.05);
      rect(c, -0.95, -0.6, 1.9, 0.08, '#4fb3ff', 0.02);
      rect(c, 0.65, -1.5, 0.18, 0.9, '#5e3a22', 0.03);
      line(c, [[0.7, -1.25], [0.35, -1.25]], '#9a9aa2', 0.05);
      line(c, [[0.35, -1.22], [0.35, -0.65]], 'rgba(120,200,255,0.8)', 0.03, false);
    }), 0.4);
for (let i = 0; i < 2; i++)
  add(`x.cheesehut.${i}`, `Fromagerie d’alpage ${i + 1}`, 'alpes', 'structure', () =>
    sprite(5.5, 4.5, (c) => {
      rect(c, -2.4, -2.6, 4.8, 2.6, sideGrad(c, -2.4, 2.4, i ? '#e6dcc6' : '#a86a3a'), 0.05);
      poly(c, [[-2.8, -2.6], [0, -4.2], [2.8, -2.6]], '#5e5048', 0.05);
      for (let k = 0; k < 3; k++) ell(c, -1.6 + k * 0.45, -0.25, 0.2, 0.15, '#f2c23a', 0.02);
      rect(c, 0.6, -1.8, 0.8, 1.8, '#5e3a22', 0.03);
    }), 0.3);
for (const [i, col] of [[0, '#d8261f'], [1, '#2a8ad8'], [2, '#2fa84f']] as [number, string][])
  add(`x.mtb.${i}`, `Vététiste ${i + 1}`, 'alpes', 'animal', (r) =>
    sprite(1.8, 1.9, (c) => {
      for (const x of [-0.5, 0.5]) ell(c, x, -0.32, 0.32, 0.32, 'rgba(0,0,0,0)', 0.04);
      line(c, [[-0.5, -0.32], [-0.05, -0.8], [0.4, -0.85], [0.5, -0.32]], col, 0.05);
      c.save();
      c.translate(-0.05, -0.6);
      person(c, 0, { ...fan(r, 'stand', col), scale: 0.6 });
      c.restore();
    }), 0.3);
for (let i = 0; i < 2; i++)
  add(`x.cabin.${i}`, `Cabine de téléphérique ${i + 1}`, 'alpes', 'structure', () =>
    sprite(2.4, 3, (c) => {
      line(c, [[0, -3], [0, -2.2]], '#5a5f6a', 0.06);
      rect(c, -1, -2.2, 2, 1.6, i ? '#d8261f' : '#f2d22a', 0.05, 0.2);
      rect(c, -0.8, -2, 0.7, 0.6, '#9fd0f0', 0.03);
      rect(c, 0.1, -2, 0.7, 0.6, '#9fd0f0', 0.03);
    }), 0.2);
for (let i = 0; i < 2; i++)
  add(`x.summitcross.${i}`, `Croix de sommet ${i + 1}`, 'alpes', 'structure', () =>
    sprite(1.8, 3.4, (c) => {
      for (let k = 0; k < 3; k++) ell(c, -0.3 + k * 0.3, -0.12, 0.25, 0.14, '#9a9aa2', 0.02);
      rect(c, -0.08, -3.2, 0.16, 3.1, i ? '#c8a050' : '#7a4a2a', 0.03);
      rect(c, -0.7, -2.6, 1.4, 0.16, i ? '#c8a050' : '#7a4a2a', 0.03);
    }), 0.2);
for (let i = 0; i < 3; i++)
  add(`x.avalanche.${i}`, `Paravalanche ${i + 1}`, 'alpes', 'structure', () =>
    sprite(4, 2.6, (c) => {
      for (let k = 0; k < 3; k++) {
        const x = -1.6 + k * 1.6;
        line(c, [[x, 0], [x + 0.4, -2.3]], '#6a5040', 0.1);
        for (let j = 0; j < 4; j++) line(c, [[x + 0.05 + j * 0.09, -0.4 - j * 0.5], [x + 1.65 + j * 0.09, -0.4 - j * 0.5]], '#8a6a4a', 0.07);
      }
    }), 0.3);
for (let i = 0; i < 2; i++)
  add(`x.shelter.${i}`, `Abri de pierre ${i + 1}`, 'alpes', 'structure', (r) =>
    sprite(3.5, 2.6, (c) => {
      for (let row = 0; row < 4; row++) for (let x = -1.5 + (row % 2) * 0.2; x < 1.5; x += 0.42) ell(c, x, -0.22 - row * 0.4, 0.22, 0.2, shade('#9a978e', r.range(-0.15, 0.1)), 0.02);
      poly(c, [[-1.8, -1.6], [0, -2.5], [1.8, -1.6]], '#5a5a5e', 0.04);
      rect(c, -0.35, -1.1, 0.7, 1.1, '#2a2420', 0.03);
    }), 0.3);
for (let i = 0; i < 6; i++)
  add(`x.sapling.${i}`, `Jeune épicéa ${i + 1}`, 'alpes', 'bush', () =>
    sprite(1.2, 1.4 + i * 0.15, (c) => {
      const H = 1.3 + i * 0.15;
      const col = ['#2f6e3a', '#3f7a52', '#1d5232'][i % 3];
      for (let k = 0; k < 4; k++) poly(c, [[0, -H + k * 0.25], [-0.5 + k * 0.05, -H * 0.35 + k * 0.08], [0.5 - k * 0.05, -H * 0.35 + k * 0.08]], k % 2 ? col : shade(col, -0.15), 0.03);
      rect(c, -0.05, -0.35, 0.1, 0.35, '#6e4326', 0.02);
    }));
for (let i = 0; i < 4; i++) add(`x.alprose.${i}`, `Rhododendron ${i + 1}`, 'alpes', 'bush', (r) => sprite(1.4, 0.9, (c) => {
  crown(c, r, 0, -0.42, 0.7, 0.4, '#3f6a3a', 8);
  for (let k = 0; k < 14; k++) ell(c, r.range(-0.55, 0.55), -r.range(0.2, 0.75), 0.05, 0.05, ['#e84a8a', '#d8268a', '#f28ab8', '#c84ad8'][i], 0.01);
}));
for (let i = 0; i < 3; i++)
  add(`x.ropefence.${i}`, `Clôture de corde ${i + 1}`, 'alpes', 'structure', () =>
    sprite(3.2, 1.1, (c) => {
      for (let k = 0; k < 3; k++) line(c, [[-1.5 + k * 1.5, 0], [-1.5 + k * 1.5, -1]], '#8a5a33', 0.07);
      for (let k = 0; k < 2; k++) {
        c.beginPath();
        c.moveTo(-1.5 + k * 1.5, -0.9);
        c.quadraticCurveTo(-0.75 + k * 1.5, -0.65, k * 1.5, -0.9);
        c.strokeStyle = ['#e6c890', '#d8261f', '#ffd21f'][i];
        c.lineWidth = 0.04;
        c.stroke();
      }
    }));
for (let i = 0; i < 2; i++)
  add(`x.picnic.${i}`, `Table de pique-nique ${i + 1}`, 'alpes', 'structure', () =>
    sprite(2, 1, (c) => {
      rect(c, -0.9, -0.75, 1.8, 0.1, '#a8733e', 0.03);
      line(c, [[-0.7, -0.7], [-0.9, 0]], '#7a4a2a', 0.06);
      line(c, [[0.7, -0.7], [0.9, 0]], '#7a4a2a', 0.06);
      rect(c, -1, -0.4, 2, 0.08, '#a8733e', 0.02);
      if (i) rect(c, -0.2, -0.95, 0.25, 0.2, '#d8261f', 0.02);
    }), 0.4);
for (let i = 0; i < 3; i++)
  add(`x.flagline.${i}`, `Guirlande de fanions ${i + 1}`, 'alpes', 'structure', () =>
    sprite(4, 2.2, (c) => {
      for (const x of [-1.9, 1.9]) line(c, [[x, 0], [x, -2]], '#8a5a33', 0.06);
      c.beginPath();
      c.moveTo(-1.9, -1.9);
      c.quadraticCurveTo(0, -1.4, 1.9, -1.9);
      c.strokeStyle = '#3a3a3a';
      c.lineWidth = 0.02;
      c.stroke();
      for (let k = 0; k < 9; k++) {
        const t = (k + 0.5) / 9;
        const x = -1.9 + 3.8 * t;
        const y = -1.9 + Math.sin(Math.PI * t) * 0.25;
        poly(c, [[x - 0.12, y], [x + 0.12, y], [x, y + 0.28]], SHIRTS[(k + i * 3) % 12], 0.015);
      }
    }), 0.3);

// ======================================================================= GRANDE FORÊT (55)

for (let i = 0; i < 4; i++) add(`x.bigmoss.${i}`, `Gros rocher moussu ${i + 1}`, 'foret', 'structure', (r) => sprite(2.6 + i * 0.4, 2, (c) => rockShape(c, r, 2.6 + i * 0.4, 1.2 + i * 0.15, '#7e8088', '#4f9a3c')), 0.6);
for (let i = 0; i < 4; i++)
  add(`x.fungilog.${i}`, `Tronc à champignons ${i + 1}`, 'foret', 'ground', (r) =>
    sprite(2.6, 0.9, (c) => {
      rect(c, -1.2, -0.55, 2.4, 0.5, sideGrad(c, -1.2, 1.2, '#6a4a2a'), 0.04, 0.24);
      ell(c, 1.15, -0.3, 0.12, 0.25, '#d6a670', 0.03);
      for (let k = 0; k < 5; k++) ell(c, r.range(-1, 0.9), -0.55, 0.12, 0.05, ['#f2c23a', '#e8e0c8', '#d8783a', '#a87a5a'][i], 0.015);
    }));
for (let i = 0; i < 4; i++)
  add(`x.ivystump.${i}`, `Souche au lierre ${i + 1}`, 'foret', 'ground', (r) =>
    sprite(1.2, 1.1, (c) => {
      const h = 0.5 + i * 0.12;
      poly(c, [[-0.5, 0], [-0.35, -h], [0.35, -h], [0.5, 0]], sideGrad(c, -0.5, 0.5, '#6a4a2a'), 0.04);
      for (let k = 0; k < 12; k++) ell(c, r.range(-0.45, 0.45), -r.range(0, h), 0.07, 0.05, k % 2 ? '#3f8a3a' : '#5aa83f', 0.01);
    }));
for (let i = 0; i < 2; i++)
  add(`x.huntstand.${i}`, `Mirador en bois ${i + 1}`, 'foret', 'structure', () =>
    sprite(2.4, 4.8, (c) => {
      for (const x of [-0.9, 0.9]) line(c, [[x, 0], [x * 0.7, -3.4]], '#7a4a2a', 0.1);
      line(c, [[-0.8, -1.2], [0.8, -2.4]], '#7a4a2a', 0.06);
      rect(c, -0.8, -4.4, 1.6, 1.1, '#8a5a33', 0.04);
      poly(c, [[-1, -4.4], [0, -4.8], [1, -4.4]], '#4a3a30', 0.04);
      rect(c, -0.5, -4.1, 1, 0.4, '#2a2420', 0.02);
    }), 0.2);
for (let i = 0; i < 2; i++)
  add(`x.woodhut.${i}`, `Cabane de bûcheron ${i + 1}`, 'foret', 'structure', () =>
    sprite(5, 4, (c) => {
      for (let k = 0; k < 7; k++) rect(c, -2.2, -0.36 - k * 0.36, 4.4, 0.36, k % 2 ? '#8a5a33' : '#7a4a2a', 0.025, 0.1);
      poly(c, [[-2.6, -2.5], [0, -3.8], [2.6, -2.5]], '#4a5a3a', 0.04);
      rect(c, -0.4, -1.6, 0.8, 1.6, '#3a2a20', 0.03);
      if (i) line(c, [[1.6, -2.5], [1.6, -3.6]], '#5a5a5e', 0.15);
    }), 0.3);
for (let i = 0; i < 2; i++)
  add(`x.barrow.${i}`, `Brouette ${i + 1}`, 'foret', 'ground', () =>
    sprite(1.6, 0.8, (c) => {
      poly(c, [[-0.6, -0.65], [0.4, -0.65], [0.3, -0.3], [-0.5, -0.3]], i ? '#2f8a3a' : '#d8261f', 0.03);
      if (i) for (let k = 0; k < 3; k++) ell(c, -0.3 + k * 0.25, -0.7, 0.12, 0.12, '#d6a670', 0.02);
      ell(c, 0.5, -0.17, 0.17, 0.17, '#2a2420', 0.03);
      line(c, [[-0.5, -0.4], [-0.75, -0.45]], '#7a4a2a', 0.04);
    }), 0.4);
add('x.axestump.0', 'Hache dans une souche', 'foret', 'ground', () =>
  sprite(1, 1, (c) => {
    poly(c, [[-0.45, 0], [-0.35, -0.45], [0.35, -0.45], [0.45, 0]], sideGrad(c, -0.45, 0.45, '#7a4a2a'), 0.04);
    ell(c, 0, -0.45, 0.35, 0.08, '#d6a670', 0.03);
    line(c, [[0.05, -0.45], [0.35, -0.95]], '#a8733e', 0.05);
    poly(c, [[-0.05, -0.38], [0.15, -0.5], [0.12, -0.32]], '#c8ccd4', 0.02);
  }), 0.4);
for (let i = 0; i < 2; i++)
  add(`x.owl.${i}`, `Chouette ${i + 1}`, 'foret', 'ground', () =>
    sprite(0.8, 1.1, (c) => {
      poly(c, [[-0.35, 0], [-0.3, -0.45], [0.3, -0.45], [0.35, 0]], sideGrad(c, -0.35, 0.35, '#7a4a2a'), 0.03);
      ell(c, 0, -0.68, 0.18, 0.23, i ? '#c8b48a' : '#8a6a4a', 0.025);
      for (const x of [-0.07, 0.07]) {
        ell(c, x, -0.74, 0.06, 0.06, '#ffd23f', 0.015);
        ell(c, x, -0.74, 0.025, 0.025, INK, 0);
      }
    }), 0.3);
for (const [i, nm, col, L, H] of [[0, 'Renard', '#d8782a', 1.1, 0.6], [1, 'Renard roux', '#c85a1a', 1.1, 0.6], [2, 'Sanglier', '#4a3a30', 1.3, 0.8], [3, 'Laie et marcassin', '#5a4a3a', 1.2, 0.75]] as [number, string, string, number, number][])
  add(`x.wild.${i}`, nm, 'foret', 'animal', (r) => sprite(L + 0.6, H + 0.4, (c) => quad(c, col, i < 2 ? '#f2efe6' : null, L, H, i < 2 ? 'goat' : 'cow', r)), 0.3);
for (let i = 0; i < 2; i++)
  add(`x.rabbit.${i}`, `Lapin ${i + 1}`, 'foret', 'animal', () =>
    sprite(0.5, 0.5, (c) => {
      ell(c, 0, -0.14, 0.16, 0.12, i ? '#f2efe6' : '#a8886a', 0.02);
      ell(c, 0.13, -0.24, 0.07, 0.07, i ? '#f2efe6' : '#a8886a', 0.02);
      ell(c, 0.13, -0.38, 0.025, 0.08, i ? '#f2efe6' : '#a8886a', 0.015);
    }), 0.3);
for (let i = 0; i < 2; i++)
  add(`x.squirrel.${i}`, `Écureuil ${i + 1}`, 'foret', 'animal', () =>
    sprite(0.6, 0.6, (c) => {
      ell(c, 0.05, -0.15, 0.1, 0.13, '#c85a1a', 0.02);
      c.beginPath();
      c.ellipse(-0.12, -0.28, 0.1, 0.2, -0.3, 0, Math.PI * 2);
      c.fillStyle = '#d8783a';
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.02;
      c.stroke();
      ell(c, 0.1, -0.32, 0.06, 0.06, '#c85a1a', 0.02);
      if (i) ell(c, 0.18, -0.22, 0.04, 0.04, '#8a5a33', 0.01);
    }), 0.3);
for (let i = 0; i < 2; i++)
  add(`x.fairy.${i}`, `Rond de sorcière ${i + 1}`, 'foret', 'ground', (r) =>
    sprite(1.6, 0.4, (c) => {
      for (let k = 0; k < 7; k++) {
        const x = -0.7 + k * 0.23;
        rect(c, x - 0.02, -0.12, 0.04, 0.12, '#f2efe6', 0.01);
        c.beginPath();
        c.ellipse(x, -0.12, 0.07, 0.05, 0, Math.PI, 0);
        c.fillStyle = i ? '#e8e0c8' : '#a87a5a';
        c.fill();
        void r;
      }
    }));
for (let i = 0; i < 4; i++) add(`x.leaves.${i}`, `Tas de feuilles ${i + 1}`, 'foret', 'ground', (r) => sprite(1.4, 0.4, (c) => { for (let k = 0; k < 30; k++) ell(c, r.range(-0.6, 0.6), -r.range(0, 0.2) * (1 - Math.abs(k / 30 - 0.5)), 0.06, 0.035, ['#d9772a', '#e2c13a', '#c8502a', '#a86a3a'][(k + i) % 4], 0.008); }));
for (let i = 0; i < 4; i++) add(`x.birchsap.${i}`, `Jeune bouleau ${i + 1}`, 'foret', 'bush', (r) => sprite(1.4, 2.4, (c) => { line(c, [[0, 0], [0.05, -1.6]], '#f1efe6', 0.06); crown(c, r, 0, -1.7, 0.55, 0.55, ['#78b84a', '#5ea43c', '#e2c13a', '#e88a2a'][i], 6); }));
for (let i = 0; i < 3; i++) add(`x.holly.${i}`, `Houx ${i + 1}`, 'foret', 'bush', (r) => sprite(1.4, 1.2, (c) => { crown(c, r, 0, -0.55, 0.65, 0.55, '#1f5a2e', 8); for (let k = 0; k < 10; k++) ell(c, r.range(-0.5, 0.5), -r.range(0.2, 1), 0.04, 0.04, '#d8261f', 0.01); }));
for (let i = 0; i < 2; i++)
  add(`x.footbridge.${i}`, `Passerelle sur ruisseau ${i + 1}`, 'foret', 'structure', () =>
    sprite(3.6, 1.4, (c) => {
      ell(c, 0, -0.05, 1.7, 0.08, 'rgba(90,170,230,0.75)', 0);
      c.beginPath();
      c.moveTo(-1.6, -0.1);
      c.quadraticCurveTo(0, -0.7, 1.6, -0.1);
      c.strokeStyle = INK;
      c.lineWidth = 0.18;
      c.stroke();
      c.strokeStyle = '#a8733e';
      c.lineWidth = 0.12;
      c.stroke();
      for (const x of [-1.2, 0, 1.2]) line(c, [[x, -0.25 - (x ? 0 : 0.3)], [x, -1.05 - (x ? 0 : 0.3)]], '#7a4a2a', 0.05);
    }), 0.3);
for (let i = 0; i < 3; i++)
  add(`x.forestsign.${i}`, ['Panneau Forêt domaniale', 'Panneau Sentier', 'Panneau Point de vue'][i], 'foret', 'structure', () =>
    sprite(1.6, 2, (c) => {
      for (const x of [-0.6, 0.6]) rect(c, x - 0.05, -1.9, 0.1, 1.9, '#6a4026', 0.02);
      rect(c, -0.75, -1.9, 1.5, 0.75, '#2f6e3a', 0.03, 0.05);
      label(c, ['FORÊT', 'SENTIER', 'VUE'][i], 0, -1.52, 0.28, '#f2efe6', null, false);
    }), 0.4);
for (let i = 0; i < 2; i++)
  add(`x.woodshed.${i}`, `Abri à bois ${i + 1}`, 'foret', 'structure', () =>
    sprite(3.2, 2.4, (c) => {
      for (const x of [-1.4, 1.4]) rect(c, x - 0.07, -2, 0.14, 2, '#6a4026', 0.02);
      poly(c, [[-1.6, -2], [1.6, -2.2], [1.6, -2.05], [-1.6, -1.85]], '#5a5a5e', 0.03);
      for (let row = 0; row < 4 + i; row++) for (let k = 0; k < 7; k++) ell(c, -1.2 + k * 0.4, -0.18 - row * 0.34, 0.17, 0.16, '#d6a670', 0.02);
    }), 0.3);
for (let i = 0; i < 2; i++)
  add(`x.treehouse.${i}`, `Cabane dans l’arbre ${i + 1}`, 'foret', 'tree', (r) =>
    sprite(4.4, 8, (c) => {
      trunk(c, 7, 0.4, '#5e3a22');
      crown(c, r, 0, -6.6, 2, 1.4, '#3f8a3a', 10);
      rect(c, -1.2, -4.6, 2.4, 1.4, '#a8733e', 0.04);
      poly(c, [[-1.4, -4.6], [0, -5.4], [1.4, -4.6]], '#d8261f', 0.04);
      for (let k = 0; k < 6; k++) line(c, [[1.3, -k * 0.55], [1.7, -k * 0.55]], '#8a5a33', 0.05);
      line(c, [[1.3, 0], [1.3, -3.2]], '#8a5a33', 0.04);
      line(c, [[1.7, 0], [1.7, -3.2]], '#8a5a33', 0.04);
    }), 0.2);
add('x.swing.0', 'Arbre à balançoire', 'foret', 'tree', (r) =>
  sprite(4, 6, (c) => {
    trunk(c, 5, 0.35, '#5e3a22');
    line(c, [[0, -3.8], [1.6, -4.3]], '#5e3a22', 0.18);
    crown(c, r, 0.4, -5, 2, 1.2, '#4f9a3c', 10);
    line(c, [[1.2, -4.2], [1.2, -0.8]], '#d9c290', 0.02, false);
    line(c, [[1.5, -4.3], [1.5, -0.8]], '#d9c290', 0.02, false);
    rect(c, 1.1, -0.85, 0.5, 0.08, '#8a5a33', 0.02);
  }), 0.2);
for (let i = 0; i < 3; i++) add(`x.beechsap.${i}`, `Jeune hêtre ${i + 1}`, 'foret', 'bush', (r) => sprite(1.8, 2.6, (c) => { line(c, [[0, 0], [0, -1.6]], '#8a8a80', 0.08); crown(c, r, 0, -1.8, 0.8, 0.7, ['#5ea43c', '#d99a2a', '#c8502a'][i], 7); }));

// ======================================================================= CANYON (55)

for (let i = 0; i < 2; i++) add(`x.bighorn.${i}`, `Mouflon ${i + 1}`, 'canyon', 'animal', (r) => sprite(2, 1.8, (c) => { quad(c, '#a8886a', '#e8e0c8', 1.3, 1.1, 'goat', r); c.beginPath(); c.arc(0.78, -1.05, 0.18, 0, Math.PI * 1.7); c.strokeStyle = '#8a7a6a'; c.lineWidth = 0.07; c.stroke(); }), 0.25);
for (let i = 0; i < 2; i++) add(`x.coyote.${i}`, `Coyote ${i + 1}`, 'canyon', 'animal', (r) => sprite(1.6, 1, (c) => quad(c, '#b8987a', null, 1.1, 0.7, 'goat', r)), 0.2);
for (let i = 0; i < 2; i++)
  add(`x.roadrunner.${i}`, `Géocoucou ${i + 1}`, 'canyon', 'animal', () =>
    sprite(0.9, 0.6, (c) => {
      ell(c, 0, -0.3, 0.2, 0.09, '#6a5a48', 0.02);
      line(c, [[-0.2, -0.32], [-0.42, -0.42]], '#4a3a30', 0.05);
      ell(c, 0.22, -0.4, 0.07, 0.06, '#6a5a48', 0.02);
      line(c, [[0.28, -0.4], [0.38, -0.38]], '#c8a03a', 0.02, false);
      for (const x of [-0.05, 0.05]) line(c, [[x, -0.22], [x + (i ? 0.08 : -0.05), 0]], '#c8a03a', 0.02, false);
    }), 0.25);
add('x.eaglenest.0', 'Nid d’aigle sur rocher', 'canyon', 'structure', (r) =>
  sprite(2.4, 4, (c) => {
    poly(c, [[-0.8, 0], [-0.5, -3.4], [0.5, -3.5], [0.8, 0]], sideGrad(c, -0.8, 0.8, RED[1]), 0.04);
    ell(c, 0, -3.55, 0.6, 0.18, '#8a6a4a', 0.03);
    ell(c, 0.1, -3.85, 0.18, 0.2, '#5a4030', 0.02);
    ell(c, 0.22, -4, 0.09, 0.08, '#f2efe6', 0.02);
    void r;
  }), 0.2);
for (let i = 0; i < 2; i++)
  add(`x.saloon.${i}`, `Façade de saloon ${i + 1}`, 'canyon', 'structure', () =>
    sprite(5, 4.5, (c) => {
      rect(c, -2.3, -4.2, 4.6, 4.2, sideGrad(c, -2.3, 2.3, i ? '#a8733e' : '#c8925a'), 0.05);
      rect(c, -2.5, -2.2, 5, 0.2, '#6a4026', 0.03);
      label(c, i ? 'HOTEL' : 'SALOON', 0, -3.6, 0.55, '#3a2a20', null, false);
      rect(c, -0.5, -1.6, 1, 1.6, '#5a3a22', 0.03);
      for (const x of [-1.6, 1.0]) rect(c, x, -1.6, 0.6, 0.7, '#3a2a20', 0.03);
    }), 0.25);
for (let i = 0; i < 3; i++)
  add(`x.rails.${i}`, `Rails abandonnés ${i + 1}`, 'canyon', 'ground', () =>
    sprite(3.2, 0.4, (c) => {
      for (let k = 0; k < 7; k++) rect(c, -1.5 + k * 0.5, -0.1, 0.18, 0.08, '#6a4a30', 0.015);
      line(c, [[-1.6, -0.17], [1.6, -0.17 - i * 0.04]], '#7a7a80', 0.04);
    }));
for (let i = 0; i < 2; i++)
  add(`x.trestle.${i}`, `Pont ferroviaire en bois ${i + 1}`, 'canyon', 'structure', () =>
    sprite(7, 4.5, (c) => {
      rect(c, -3.4, -4.2, 6.8, 0.3, '#5a3a22', 0.04);
      for (let k = 0; k < 5; k++) {
        const x = -3 + k * 1.5;
        line(c, [[x - 0.5, 0], [x, -4]], '#7a4a2a', 0.1);
        line(c, [[x + 0.5, 0], [x, -4]], '#7a4a2a', 0.1);
        line(c, [[x - 0.4, -1.2], [x + 0.4, -1.2]], '#7a4a2a', 0.06);
      }
    }), 0.2);
for (let i = 0; i < 2; i++)
  add(`x.headframe.${i}`, `Chevalement de mine ${i + 1}`, 'canyon', 'structure', () =>
    sprite(3.4, 6.5, (c) => {
      line(c, [[-1.4, 0], [-0.3, -5.8]], '#6a4026', 0.12);
      line(c, [[1.4, 0], [0.3, -5.8]], '#6a4026', 0.12);
      line(c, [[1.6, 0], [0.3, -5.6]], '#6a4026', 0.08);
      for (let k = 1; k < 5; k++) line(c, [[-1.4 + k * 0.22, -k * 1.15], [1.4 - k * 0.22, -k * 1.15]], '#6a4026', 0.06);
      ell(c, 0, -5.9, 0.45, 0.45, 'rgba(0,0,0,0)', 0.07);
    }), 0.2);
for (let i = 0; i < 3; i++) add(`x.ore.${i}`, `Tas de minerai ${i + 1}`, 'canyon', 'ground', (r) => sprite(1.8, 0.9, (c) => { for (let k = 0; k < 14; k++) ell(c, r.range(-0.7, 0.7) * (1 - k / 20), -0.1 - k * 0.04, 0.15, 0.1, shade(['#7a6a5a', '#9a7a5a', '#5a5a62'][i], r.range(-0.15, 0.1)), 0.015); }));
for (let i = 0; i < 2; i++)
  add(`x.oldcar.${i}`, `Voiture abandonnée ${i + 1}`, 'canyon', 'structure', () =>
    sprite(4.2, 1.8, (c) => {
      poly(c, [[-2, -0.4], [-1.9, -1.0], [-1.0, -1.1], [-0.5, -1.6], [0.9, -1.6], [1.4, -1.1], [2, -1.0], [2, -0.4]], sideGrad(c, -2, 2, i ? '#5a7aa8' : '#a85a3a'), 0.04);
      rect(c, -0.35, -1.5, 1.1, 0.35, 'rgba(160,200,220,0.5)', 0.02);
      for (const x of [-1.2, 1.2]) ell(c, x, -0.35, 0.35, 0.33, '#3a3530', 0.035);
      for (let k = 0; k < 5; k++) ell(c, -1.5 + k * 0.7, -0.8, 0.1, 0.06, '#8a4a2a', 0);
    }), 0.2);
add('x.gas.0', 'Vieille station-service', 'canyon', 'structure', () =>
  sprite(5, 4, (c) => {
    rect(c, -2.2, -3, 3, 3, sideGrad(c, -2.2, 0.8, '#e6d2b0'), 0.04);
    rect(c, -2.4, -3.3, 4.6, 0.3, '#d8261f', 0.04);
    for (const x of [1.4, 2.1]) {
      rect(c, x - 0.2, -1.5, 0.4, 1.5, '#d8261f', 0.03, 0.05);
      ell(c, x, -1.15, 0.12, 0.12, '#f2efe6', 0.02);
    }
    label(c, 'GAS', -0.7, -2.4, 0.5, '#d8261f', null, false);
  }), 0.2);
for (let i = 0; i < 3; i++)
  add(`x.routesign.${i}`, `Panneau de route ${i + 1}`, 'canyon', 'structure', () =>
    sprite(1.3, 2.2, (c) => {
      line(c, [[0, 0], [0, -1.6]], '#9a9aa2', 0.05);
      if (i === 0) {
        poly(c, [[0, -2.2], [0.45, -1.8], [0, -1.4], [-0.45, -1.8]], '#ffd21f', 0.035);
        label(c, '!', 0, -1.8, 0.3, INK, null, false);
      } else {
        rect(c, -0.45, -2.1, 0.9, 0.55, i === 1 ? '#2a5ad8' : '#2f8a3a', 0.03, 0.05);
        label(c, i === 1 ? '66' : 'MESA', 0, -1.82, i === 1 ? 0.3 : 0.2, '#ffffff', null, false);
      }
    }), 0.4);
for (const [i, col, nm] of [[0, '#ff7a2a', 'Globemallow'], [1, '#f2d22a', 'Bricklebush'], [2, '#d84ad8', 'Phacélie'], [3, '#ffffff', 'Pavot des sables']] as [number, string, string][])
  add(`x.cflower.${i}`, nm, 'canyon', 'ground', (r) => sprite(0.9, 0.7, (c) => { for (let k = 0; k < 9; k++) { const x = r.range(-0.35, 0.35); const h = r.range(0.25, 0.6); line(c, [[x, 0], [x, -h]], '#7a8a5a', 0.02, false); ell(c, x, -h, 0.05, 0.04, col, 0.01); } }));
for (let i = 0; i < 4; i++) add(`x.cdrytree.${i}`, `Arbre sec du canyon ${i + 1}`, 'canyon', 'tree', (r) => sprite(3, 3.6, (c) => {
  const br = (x: number, y: number, a: number, L: number, w: number, d: number) => {
    const ex = x + Math.cos(a) * L;
    const ey = y + Math.sin(a) * L;
    line(c, [[x, y], [ex, ey]], '#9a8270', w);
    if (d < 3) for (let k = 0; k < 2; k++) br(ex, ey, a + (k ? 1 : -1) * r.range(0.3, 0.7), L * 0.68, w * 0.65, d + 1);
  };
  br(0, 0, -Math.PI / 2 + r.range(-0.2, 0.2), 1.2 + i * 0.12, 0.18, 0);
}));
for (let i = 0; i < 6; i++) add(`x.cboulders.${i}`, `Amas de rochers rouges ${i + 1}`, 'canyon', 'ground', (r) => sprite(2.6, 1.4, (c) => { for (let k = 0; k < 3; k++) { c.save(); c.translate(-0.7 + k * 0.7, 0); rockShape(c, r, 0.9 + r.range(0, 0.4), 0.5 + r.range(0, 0.5), RED[(k + i) % 4], null); c.restore(); } }));
for (let i = 0; i < 4; i++)
  add(`x.slickrock.${i}`, `Dôme de grès lisse ${i + 1}`, 'canyon', 'structure', () =>
    sprite(5 + i, 2.6, (c) => {
      const W = 4.6 + i;
      c.beginPath();
      c.moveTo(-W / 2, 0);
      c.quadraticCurveTo(0, -4.6, W / 2, 0);
      c.closePath();
      c.fillStyle = sideGrad(c, -W / 2, W / 2, ['#e0a070', '#d98a5a', '#e8b080', '#c8784a'][i]);
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.05;
      c.stroke();
      for (let k = 1; k < 4; k++) {
        c.beginPath();
        c.moveTo(-W / 2 + k * 0.4, -0.05);
        c.quadraticCurveTo(0, -4.6 + k * 0.9, W / 2 - k * 0.4, -0.05);
        c.strokeStyle = 'rgba(255,230,190,0.35)';
        c.lineWidth = 0.05;
        c.stroke();
      }
    }), 0.4);
for (let i = 0; i < 2; i++)
  add(`x.cliffruin.${i}`, `Ruines troglodytes ${i + 1}`, 'canyon', 'structure', (r) =>
    sprite(6, 4, (c) => {
      rockShape(c, r, 6, 3.6, RED[i], null);
      for (let k = 0; k < 3; k++) {
        rect(c, -1.8 + k * 1.2, -2.2 + (k % 2) * 0.4, 0.9, 0.8, '#d9a870', 0.03);
        rect(c, -1.55 + k * 1.2, -1.95 + (k % 2) * 0.4, 0.35, 0.45, '#2a1a10', 0.02);
      }
    }), 0.2);
add('x.ladder.0', 'Échelle contre la roche', 'canyon', 'structure', (r) =>
  sprite(2.4, 3.4, (c) => {
    rockShape(c, r, 2.2, 3, RED[2], null);
    line(c, [[0.8, 0], [1.1, -3]], '#8a5a33', 0.05);
    line(c, [[1.1, 0], [1.4, -3]], '#8a5a33', 0.05);
    for (let k = 1; k < 9; k++) line(c, [[0.8 + k * 0.033, -k * 0.33], [1.1 + k * 0.033, -k * 0.33]], '#8a5a33', 0.03, false);
  }), 0.2);
for (let i = 0; i < 2; i++) add(`x.waterbarrel.${i}`, `Tonneaux d’eau ${i + 1}`, 'canyon', 'ground', () => sprite(1.4, 1, (c) => { for (let k = 0; k <= i; k++) { const x = -0.3 + k * 0.6; rect(c, x - 0.25, -0.8, 0.5, 0.8, sideGrad(c, x - 0.25, x + 0.25, '#8a5a33'), 0.03, 0.08); for (const y of [-0.62, -0.18]) line(c, [[x - 0.25, y], [x + 0.25, y]], '#5a5a5e', 0.03, false); } }), 0.4);

for (let i = 0; i < 4; i++) add(`x.yucca.${i}`, `Yucca ${i + 1}`, 'canyon', 'bush', (r) => sprite(1.4, 2.2, (c) => { line(c, [[0, 0], [0, -0.8 - i * 0.2]], '#7a6a50', 0.1); for (let k = 0; k < 12; k++) { const a = -Math.PI / 2 + (k / 11 - 0.5) * 2.4; line(c, [[0, -0.8 - i * 0.2], [Math.cos(a) * 0.6, -0.8 - i * 0.2 + Math.sin(a) * 0.6]], '#6a8a4a', 0.04, false); } if (i % 2) line(c, [[0, -1.3 - i * 0.2], [0, -2 - i * 0.05]], '#f2efe6', 0.06); void r; }));
for (let i = 0; i < 3; i++) add(`x.hoodoo.${i}`, `Cheminée de fée ${i + 1}`, 'canyon', 'structure', () => sprite(1.8, 4.4, (c) => { const H = 3 + i * 0.5; poly(c, [[-0.5, 0], [-0.3, -H], [0.3, -H], [0.5, 0]], sideGrad(c, -0.5, 0.5, RED[i]), 0.04); ell(c, 0, -H - 0.2, 0.7, 0.28, '#8a7a6a', 0.04); }), 0.4);

// ======================================================================= DÉSERT (55)

for (let i = 0; i < 2; i++)
  add(`x.caravan.${i}`, `Caravane de dromadaires ${i + 1}`, 'desert', 'animal', () =>
    sprite(7, 2.6, (c) => {
      for (let k = 0; k < 3; k++) {
        c.save();
        c.translate(-2.4 + k * 2.3, 0);
        c.scale(0.75, 0.75);
        for (const x of [-0.8, -0.6, 0.6, 0.8]) rect(c, x - 0.06, -1.3, 0.12, 1.3, '#b8875a', 0.025);
        ell(c, 0, -1.55, 1.1, 0.4, sideGrad(c, -1.1, 1.1, '#c8975a'), 0.04);
        ell(c, -0.1, -2, 0.45, 0.35, '#c8975a', 0.04);
        rect(c, -0.6, -2.3, 1, 0.3, SHIRTS[k + i * 3], 0.03);
        line(c, [[0.9, -1.65], [1.25, -2.25], [1.35, -2.45]], '#c8975a', 0.22);
        c.restore();
      }
    }), 0.2);
for (let i = 0; i < 3; i++)
  add(`x.pond.${i}`, `Mare d’oasis ${i + 1}`, 'desert', 'ground', (r) =>
    sprite(3, 1.4, (c) => {
      ell(c, 0, -0.08, 1.4, 0.12, 'rgba(60,160,220,0.85)', 0.03);
      ell(c, -0.4, -0.1, 0.5, 0.03, 'rgba(220,245,255,0.8)', 0);
      for (let k = 0; k < 10; k++) {
        const x = (k < 5 ? -1.4 : 1.0) + r.range(0, 0.4);
        line(c, [[x, -0.05], [x + r.range(-0.1, 0.1), -r.range(0.6, 1.2)]], '#5a8a3a', 0.03, false);
      }
    }), 0.5);
for (let i = 0; i < 3; i++)
  add(`x.palmcluster.${i}`, `Bosquet de palmiers ${i + 1}`, 'desert', 'tree', (r) =>
    sprite(5, 6.5, (c) => {
      for (let k = 0; k < 3; k++) {
        const x = -1.4 + k * 1.4;
        const H = r.range(3.6, 6);
        line(c, [[x, 0], [x + r.range(-0.4, 0.4), -H]], '#a8784e', 0.2);
        crown(c, r, x, -H, 1.1, 0.4, '#3f8a3a', 6);
      }
    }), 0.5);
for (let i = 0; i < 3; i++)
  add(`x.stall.${i}`, `Étal de marché ${i + 1}`, 'desert', 'structure', (r) =>
    sprite(3.4, 2.8, (c) => {
      for (const x of [-1.5, 1.5]) line(c, [[x, 0], [x, -2.3]], '#7a4a2a', 0.06);
      poly(c, [[-1.7, -2.3], [1.7, -2.3], [1.4, -2.7], [-1.4, -2.7]], ['#d8261f', '#2a5ad8', '#ffd21f'][i], 0.03);
      rect(c, -1.5, -1, 3, 0.15, '#8a5a33', 0.03);
      for (let k = 0; k < 6; k++) ell(c, -1.2 + k * 0.48, -1.12, 0.18, 0.13, r.pick(['#ff8a2a', '#f2d22a', '#7ab85a', '#d84a4a', '#8a5a33']), 0.02);
    }), 0.3);
for (let i = 0; i < 4; i++)
  add(`x.pottery.${i}`, `Poteries ${i + 1}`, 'desert', 'ground', (r) =>
    sprite(1.4, 0.9, (c) => {
      for (let k = 0; k < 3; k++) {
        const x = -0.45 + k * 0.45;
        const h = r.range(0.4, 0.75);
        ell(c, x, -h * 0.45, 0.18, h * 0.45, sideGrad(c, x - 0.2, x + 0.2, ['#c86a3a', '#d9a870', '#a8582a', '#e0bc8a'][(k + i) % 4]), 0.025);
        rect(c, x - 0.07, -h, 0.14, 0.1, '#a8582a', 0.02);
      }
    }));
for (let i = 0; i < 3; i++)
  add(`x.rug.${i}`, `Tapis suspendu ${i + 1}`, 'desert', 'structure', () =>
    sprite(2.6, 2.4, (c) => {
      for (const x of [-1.2, 1.2]) line(c, [[x, 0], [x, -2.3]], '#7a4a2a', 0.05);
      line(c, [[-1.25, -2.2], [1.25, -2.2]], '#7a4a2a', 0.04);
      const col = ['#a8282a', '#2a4a8a', '#d9782a'][i];
      rect(c, -1, -2.15, 2, 1.5, col, 0.03);
      rect(c, -0.8, -1.95, 1.6, 1.1, 'rgba(0,0,0,0)', 0.04, 0, '#f2d22a');
      poly(c, [[0, -1.8], [0.4, -1.4], [0, -1.0], [-0.4, -1.4]], '#f2efe6', 0.02);
    }), 0.3);
for (let i = 0; i < 2; i++)
  add(`x.campfire.${i}`, `Feu de camp ${i + 1}`, 'desert', 'ground', () =>
    sprite(1.2, 0.9, (c) => {
      for (let k = 0; k < 6; k++) ell(c, -0.4 + k * 0.16, -0.06, 0.08, 0.06, '#8a8a92', 0.015);
      line(c, [[-0.35, -0.05], [0.25, -0.3]], '#6a4026', 0.06);
      line(c, [[0.35, -0.05], [-0.25, -0.3]], '#6a4026', 0.06);
      poly(c, [[-0.2, -0.15], [0, -0.75], [0.2, -0.15]], '#ff8a2a', 0.02);
      poly(c, [[-0.1, -0.15], [0, -0.5], [0.1, -0.15]], '#ffd23f', 0);
      if (i) rect(c, 0.3, -0.5, 0.3, 0.3, '#5a5a5e', 0.02, 0.05);
    }), 0.4);
for (let i = 0; i < 2; i++)
  add(`x.fennec.${i}`, `Fennec ${i + 1}`, 'desert', 'animal', () =>
    sprite(0.8, 0.6, (c) => {
      ell(c, 0, -0.18, 0.2, 0.1, '#e6c08a', 0.02);
      ell(c, 0.22, -0.26, 0.08, 0.07, '#e6c08a', 0.02);
      for (const dx of [0.17, 0.27]) poly(c, [[0.22 + dx - 0.22 - 0.03, -0.3], [0.22 + dx - 0.22, -0.48], [0.22 + dx - 0.22 + 0.04, -0.3]], '#e6c08a', 0.015);
      line(c, [[-0.18, -0.18], [-0.35, -0.12]], '#e6c08a', 0.06);
      for (const x of [-0.1, 0.1]) line(c, [[x, -0.12], [x, 0]], '#e6c08a', 0.025, false);
    }), 0.3);
add('x.scorpion.0', 'Scorpion', 'desert', 'ground', () =>
  sprite(0.6, 0.3, (c) => {
    ell(c, 0, -0.05, 0.12, 0.04, '#5a3a22', 0.012);
    c.beginPath();
    c.moveTo(-0.1, -0.05);
    c.quadraticCurveTo(-0.3, -0.25, -0.1, -0.22);
    c.strokeStyle = '#5a3a22';
    c.lineWidth = 0.03;
    c.stroke();
  }), 0.2);
for (let i = 0; i < 2; i++)
  add(`x.saltflat.${i}`, `Croûte de sel ${i + 1}`, 'desert', 'ground', (r) =>
    sprite(2.4, 0.2, (c) => {
      ell(c, 0, -0.04, 1.1, 0.05, '#f2ece0', 0.02);
      for (let k = 0; k < 8; k++) line(c, [[r.range(-1, 1), -0.04], [r.range(-1, 1), -0.03]], '#c8bca8', 0.01, false);
    }));
for (let i = 0; i < 4; i++)
  add(`x.pillar.${i}`, `Pilier de roche ${i + 1}`, 'desert', 'structure', (r) =>
    sprite(1.8, 4 + i * 0.6, (c) => {
      const H = 3.6 + i * 0.6;
      poly(c, [[-0.7, 0], [-0.45, -H * 0.6], [-0.6, -H], [0.5, -H - r.range(0, 0.3)], [0.4, -H * 0.55], [0.7, 0]], sideGrad(c, -0.7, 0.7, ['#d9985f', '#c8885a', '#e0a870', '#b8784a'][i]), 0.05);
      for (let k = 1; k < 5; k++) line(c, [[-0.5, -H * k / 5], [0.5, -H * k / 5]], 'rgba(255,214,160,0.4)', 0.05, false);
    }), 0.4);
for (let i = 0; i < 4; i++) add(`x.broom.${i}`, `Genêt du désert ${i + 1}`, 'desert', 'bush', (r) => sprite(1.2, 1.3, (c) => { for (let k = 0; k < 14; k++) { const a = -Math.PI / 2 + r.range(-0.6, 0.6); line(c, [[0, 0], [Math.cos(a) * 1.1, Math.sin(a) * 1.1]], ['#8a9a4a', '#a8a85a', '#7a8a3a', '#b8b060'][i], 0.03, false); } if (i % 2) for (let k = 0; k < 8; k++) ell(c, r.range(-0.4, 0.4), -r.range(0.6, 1.1), 0.04, 0.04, '#f2d22a', 0.01); }));
for (let i = 0; i < 4; i++)
  add(`x.acacia.${i}`, `Acacia ${i + 1}`, 'desert', 'tree', (r) =>
    sprite(5, 4.2, (c) => {
      line(c, [[0, 0], [0.1, -2.2], [-0.8, -3.2]], '#6a5040', 0.2);
      line(c, [[0.1, -2.2], [0.9, -3.3]], '#6a5040', 0.16);
      c.beginPath();
      c.ellipse(0, -3.5, 2.2, 0.45, 0, 0, Math.PI * 2);
      c.fillStyle = ['#6a8a3a', '#7a9a42', '#5a7a32', '#8a9a4a'][i];
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.05;
      c.stroke();
      for (let k = 0; k < 8; k++) ell(c, r.range(-1.8, 1.8), -3.6 - r.range(0, 0.2), 0.3, 0.1, 'rgba(180,210,110,0.5)', 0);
    }), 0.6);
for (let i = 0; i < 2; i++)
  add(`x.fort.${i}`, `Fort en ruine ${i + 1}`, 'desert', 'structure', () =>
    sprite(7, 4.4, (c) => {
      rect(c, -3.2, -2.8, 6.4, 2.8, sideGrad(c, -3.2, 3.2, '#d9a870'), 0.05);
      for (let k = 0; k < 8; k++) rect(c, -3.2 + k * 0.82, -3.2, 0.5, 0.4, '#d9a870', 0.03);
      rect(c, -3.6, -4.2, 1.2, 4.2, sideGrad(c, -3.6, -2.4, '#e0b07a'), 0.05);
      if (!i) rect(c, 2.4, -4, 1.2, 4, sideGrad(c, 2.4, 3.6, '#e0b07a'), 0.05);
      rect(c, -0.6, -1.8, 1.2, 1.8, '#3a2a20', 0.03, 0.5);
    }), 0.2);
for (let i = 0; i < 2; i++)
  add(`x.obelisk.${i}`, `Obélisque ${i + 1}`, 'desert', 'structure', () =>
    sprite(1.4, 5.4, (c) => {
      poly(c, [[-0.5, 0], [-0.35, -4.6], [0, -5.2], [0.35, -4.6], [0.5, 0]], sideGrad(c, -0.5, 0.5, i ? '#c8a070' : '#e0c890'), 0.04);
      for (let k = 0; k < 6; k++) rect(c, -0.12, -1 - k * 0.55, 0.24, 0.25, 'rgba(120,80,40,0.35)', 0);
    }), 0.2);
for (let i = 0; i < 2; i++)
  add(`x.statue.${i}`, `Statue érodée ${i + 1}`, 'desert', 'structure', () =>
    sprite(2.4, 3.6, (c) => {
      rect(c, -1, -0.8, 2, 0.8, '#d9b886', 0.04);
      ell(c, 0, -1.9, 0.55, 1.0, sideGrad(c, -0.55, 0.55, '#e0c08a'), 0.04);
      ell(c, 0, -3.1, 0.32, 0.35, '#e0c08a', 0.04);
      if (i) poly(c, [[-0.4, -3.3], [0, -3.7], [0.4, -3.3]], '#e0c08a', 0.03);
    }), 0.2);
for (let i = 0; i < 2; i++)
  add(`x.oasissign.${i}`, `Panneau Oasis ${i + 1}`, 'desert', 'structure', () =>
    sprite(1.6, 2, (c) => {
      line(c, [[0, 0], [0, -1.9]], '#7a4a2a', 0.06);
      poly(c, [[-0.7, -1.85], [0.55, -1.85], [0.75, -1.6], [0.55, -1.35], [-0.7, -1.35]], '#d9a870', 0.03);
      label(c, i ? '12 KM' : 'OASIS', -0.05, -1.6, 0.22, '#5a3a22', null, false);
    }), 0.3);
add('x.dtower.0', 'Château d’eau du désert', 'desert', 'structure', () =>
  sprite(3, 6, (c) => {
    for (const x of [-1, 1]) line(c, [[x * 1.1, 0], [x * 0.8, -3.6]], '#8a8a92', 0.1);
    ell(c, 0, -4.4, 1.2, 0.9, sideGrad(c, -1.2, 1.2, '#e6e6ea'), 0.05);
  }), 0.2);
for (const [i, col] of [[0, '#ff7a1a'], [1, '#1f6fd6']] as [number, string][])
  add(`x.rallytruck.${i}`, `Camion de rallye ${i + 1}`, 'desert', 'structure', () =>
    sprite(6, 3.4, (c) => {
      rect(c, -2.8, -2.8, 3.6, 2.2, sideGrad(c, -2.8, 0.8, col), 0.05, 0.1);
      rect(c, 0.8, -2.8, 2, 2.2, sideGrad(c, 0.8, 2.8, '#f2f2f2'), 0.05, 0.2);
      rect(c, 1.4, -2.6, 1, 0.8, 'rgba(160,210,240,0.8)', 0.03, 0.05);
      label(c, BRANDS[i + 1], -1, -1.8, 0.45, '#ffffff', INK);
      for (const x of [-2, 2]) ell(c, x, -0.55, 0.55, 0.55, '#2a2420', 0.04);
    }), 0.2);
for (let i = 0; i < 4; i++) add(`x.dgrass.${i}`, `Touffe saharienne ${i + 1}`, 'desert', 'ground', (r) => sprite(1, 0.6, (c) => { for (let k = 0; k < 12; k++) { const x = r.range(-0.4, 0.4); line(c, [[x, 0], [x + r.range(-0.25, 0.25), -r.range(0.2, 0.55)]], ['#c8b06a', '#d8c07a', '#a8a05a', '#e0c890'][i], 0.022, false); } }));
for (let i = 0; i < 2; i++) add(`x.jar.${i}`, `Jarres d’eau ${i + 1}`, 'desert', 'ground', () => sprite(1, 0.9, (c) => { for (let k = 0; k <= i; k++) { const x = -0.2 + k * 0.4; ell(c, x, -0.35, 0.2, 0.32, sideGrad(c, x - 0.2, x + 0.2, '#c86a3a'), 0.025); rect(c, x - 0.08, -0.75, 0.16, 0.1, '#a8582a', 0.02); } }), 0.4);
add('x.dunehut.0', 'Abri en palmes', 'desert', 'structure', () =>
  sprite(3.4, 2.6, (c) => {
    for (const x of [-1.4, 1.4]) line(c, [[x, 0], [x, -2]], '#8a6a4a', 0.07);
    poly(c, [[-1.7, -2], [1.7, -2], [1.4, -2.5], [-1.4, -2.5]], '#a8a05a', 0.03);
    for (let k = 0; k < 10; k++) line(c, [[-1.6 + k * 0.35, -2], [-1.5 + k * 0.35, -2.5]], '#8a8040', 0.02, false);
  }), 0.3);

// ======================================================================= TRIAL (80): big obstacles for the circuits

const TB = (id: string, name: string, w: number, h: number, profile: (u: number) => number, tier: 1 | 2 | 3, draw: (c: Ctx, r: Rng) => void) =>
  add(id, name, 'trial', 'obstacle', (r) => sprite(w, h, (c) => draw(c, r)), 1, { w, h, profile, tier, big: true });

for (let n = 1; n <= 3; n++)
  for (const [k, w] of [[0, 1.6], [1, 2.2]] as [number, number][])
    TB(`tb.bigtyres.${n}.${k}`, `${n} pneu${n > 1 ? 's' : ''} de chantier ${k ? 'larges' : ''}`.trim(), w, 0.42 * n, box(0.22), n === 1 ? 1 : n === 2 ? 2 : 3, (c) => {
      for (let j = 0; j < n; j++) {
        rect(c, -w / 2, -0.42 * (j + 1), w, 0.42, sideGrad(c, -w / 2, w / 2, '#2a2724'), 0.04, 0.18);
        for (let q = 0; q < 7; q++) line(c, [[-w / 2 + 0.15 + q * (w - 0.3) / 6, -0.42 * (j + 1) + 0.06], [-w / 2 + 0.2 + q * (w - 0.3) / 6, -0.42 * j - 0.06]], '#45403a', 0.04, false);
      }
    });
for (const h of [0.7, 0.9, 1.1])
  for (const [k, col] of [[0, '#9a9aa2'], [1, '#b0aaa0']] as [number, string][])
    TB(`tb.bigblock.${h}.${k}`, `Gros bloc béton ${Math.round(h * 100)} cm${k ? ' beige' : ''}`, 2.2, h, box(0.24), h > 1 ? 3 : h > 0.8 ? 2 : 1, (c) => {
      rect(c, -1.1, -h, 2.2, h, sideGrad(c, -1.1, 1.1, col), 0.05, 0.1);
      line(c, [[-0.6, -h * 0.7], [-0.1, -h * 0.3]], 'rgba(40,40,50,0.4)', 0.03, false);
      for (let q = 0; q < 3; q++) ell(c, -0.7 + q * 0.6, -h * 0.85, 0.05, 0.05, '#7a7a82', 0);
    });
for (let i = 0; i < 8; i++)
  TB(`tb.boulder.${i}`, `Gros rocher ${i + 1}`, 2 + (i % 4) * 0.4, 0.7 + (i % 4) * 0.15, hump, (i % 4) < 2 ? 1 : (i % 4) < 3 ? 2 : 3, (c, r) => {
    const W = 2 + (i % 4) * 0.4;
    const H = 0.7 + (i % 4) * 0.15;
    const col = i < 4 ? '#8e9098' : RED[i % 4];
    const pts: Pt[] = [[-W / 2, 0]];
    for (let k = 0; k <= 12; k++) pts.push([-W / 2 + (W * k) / 12, -H * hump(k / 12) * r.range(0.95, 1.03)]);
    pts.push([W / 2, 0]);
    poly(c, pts, sideGrad(c, -W / 2, W / 2, col), 0.05);
    poly(c, [[-W * 0.3, -H * 0.5], [-W * 0.05, -H * 0.95], [W * 0.1, -H * 0.6]], shade(col, 0.2), 0);
  });
for (let i = 0; i < 3; i++)
  TB(`tb.carwreck.${i}`, `Épave de voiture ${i + 1}`, 4, 1.2, (u) => Math.min(1, u * 3.2, (1 - u) * 3.2) * (0.75 + 0.25 * Math.sin(Math.PI * u)), 3, (c) => {
    const col = ['#8a3a2a', '#3a5a8a', '#5a6a3a'][i];
    poly(c, [[-2, 0], [-1.8, -0.75], [-0.9, -0.85], [-0.4, -1.2], [0.9, -1.2], [1.4, -0.85], [1.9, -0.75], [2, 0]], sideGrad(c, -2, 2, col), 0.05);
    rect(c, -0.3, -1.1, 1.1, 0.3, 'rgba(140,180,200,0.5)', 0.02);
    for (const x of [-1.25, 1.25]) ell(c, x, -0.3, 0.32, 0.3, '#2a2420', 0.035);
    for (let k = 0; k < 5; k++) ell(c, -1.5 + k * 0.75, -0.6, 0.1, 0.05, '#7a3a1a', 0);
  });
for (let i = 0; i < 2; i++)
  TB(`tb.vanwreck.${i}`, `Épave de fourgon ${i + 1}`, 4.6, 1.3, box(0.2), 3, (c) => {
    rect(c, -2.3, -1.3, 4.6, 1.15, sideGrad(c, -2.3, 2.3, i ? '#d8d8dc' : '#c8a03a'), 0.05, 0.15);
    rect(c, 1.3, -1.2, 0.8, 0.4, 'rgba(140,180,200,0.5)', 0.02);
    for (const x of [-1.5, 1.5]) ell(c, x, -0.2, 0.25, 0.22, '#2a2420', 0.03);
  });
for (const [i, R] of [[0, 0.4], [1, 0.48], [2, 0.56], [3, 0.65]] as [number, number][])
  TB(`tb.biglog.${i}`, `Tronc géant Ø${Math.round(R * 200)} cm`, R * 2, R * 2, round, R < 0.45 ? 1 : R < 0.6 ? 2 : 3, (c) => {
    ell(c, 0, -R, R, R, sideGrad(c, -R, R, '#6a4026'), 0.05);
    ell(c, -R * 0.12, -R * 1.04, R * 0.78, R * 0.78, '#d6a670', 0.035);
    for (let k = 1; k < 5; k++) ell(c, -R * 0.12, -R * 1.04, R * 0.16 * k, R * 0.16 * k, 'rgba(0,0,0,0)', 0.015, '#a8733e');
  });
for (let i = 0; i < 3; i++)
  TB(`tb.logpyramid.${i}`, `Pyramide de troncs ${i + 1}`, 1.8 + i * 0.6, 0.85 + i * 0.3, hump, i === 0 ? 2 : 3, (c) => {
    const rows = 2 + i;
    const R = 0.22;
    for (let row = 0; row < rows; row++)
      for (let k = 0; k < rows - row + 1; k++) {
        const x = -(rows - row) * R + k * R * 2;
        ell(c, x, -R - row * R * 1.7, R, R, '#d6a670', 0.03);
        ell(c, x, -R - row * R * 1.7, R * 0.4, R * 0.4, '#b8834e', 0);
      }
  });
for (let i = 0; i < 2; i++)
  TB(`tb.container.${i}`, `Conteneur couché en rampe ${i + 1}`, 5, 1.3, (u) => (u < 0.35 ? u / 0.35 : u < 0.85 ? 1 : (1 - u) / 0.15), 3, (c) => {
    poly(c, [[-2.5, 0], [-0.75, -1.3], [2.5, -1.3], [2.5, 0]], sideGrad(c, -2.5, 2.5, '#a8a8b0'), 0.04);
    rect(c, -0.75, -1.3, 3.25, 1.3, sideGrad(c, -0.75, 2.5, i ? '#d8261f' : '#2a6ad8'), 0.05);
    for (let k = 1; k < 9; k++) line(c, [[-0.75 + k * 0.36, -1.25], [-0.75 + k * 0.36, -0.05]], 'rgba(0,0,0,0.2)', 0.03, false);
  });
for (const [i, R] of [[0, 0.55], [1, 0.65], [2, 0.75]] as [number, number][])
  TB(`tb.bigspool.${i}`, `Grand touret ${i + 1}`, R * 2, R * 2, round, R < 0.6 ? 2 : 3, (c) => {
    ell(c, 0, -R, R, R, sideGrad(c, -R, R, '#8a5a33'), 0.05);
    ell(c, 0, -R, R * 0.35, R * 0.35, '#3a3a3a', 0.03);
    for (let k = 0; k < 8; k++) line(c, [[0, -R], [Math.cos(k * 0.8) * R * 0.95, -R + Math.sin(k * 0.8) * R * 0.95]], '#6a4026', 0.035, false);
  });
for (let i = 0; i < 3; i++)
  TB(`tb.palletwall.${i}`, `Mur de palettes ${4 + i} étages`, 1.6, 0.15 * (4 + i), box(0.25), i === 0 ? 2 : 3, (c) => {
    for (let k = 0; k < 4 + i; k++) {
      const y = -0.15 * (k + 1);
      rect(c, -0.8, y, 1.6, 0.04, '#c8a070', 0.02);
      rect(c, -0.8, y + 0.11, 1.6, 0.04, '#c8a070', 0.02);
      for (const x of [-0.78, -0.06, 0.66]) rect(c, x, y + 0.04, 0.12, 0.07, '#a8865a', 0.015);
    }
  });
for (let i = 0; i < 4; i++)
  TB(`tb.cratestack.${i}`, `Escalier de caisses ${i + 1}`, 2.4, 0.5 * (2 + (i % 2)), (u) => Math.min(1, Math.ceil(Math.min(u, 1 - u) * 2 * (2 + (i % 2)) + 0.001) / (2 + (i % 2))), i < 2 ? 2 : 3, (c) => {
    const n = 2 + (i % 2);
    for (let row = 0; row < n; row++) {
      const w = 2.4 - row * (2.4 / n);
      rect(c, -w / 2, -0.5 * (row + 1), w, 0.5, sideGrad(c, -w / 2, w / 2, i < 2 ? '#b8864e' : '#8a6a4a'), 0.035);
      line(c, [[-w / 2 + 0.05, -0.5 * (row + 1) + 0.05], [w / 2 - 0.05, -0.5 * row - 0.05]], 'rgba(60,30,10,0.4)', 0.03, false);
    }
  });
for (let i = 0; i < 3; i++)
  TB(`tb.stonewall.${i}`, `Mur de pierres sèches ${i + 1}`, 1.8, 0.65 + i * 0.15, box(0.22), i === 0 ? 2 : 3, (c, r) => {
    const H = 0.65 + i * 0.15;
    for (let row = 0; row * 0.2 < H - 0.05; row++) for (let x = -0.8 + (row % 2) * 0.15; x < 0.85; x += 0.32) ell(c, x, -0.1 - row * 0.2, 0.17, 0.11, shade('#9a978e', r.range(-0.15, 0.12)), 0.02);
  });
for (const [i, R] of [[0, 0.5], [1, 0.6], [2, 0.7]] as [number, number][])
  TB(`tb.bigpipe.${i}`, `Grosse buse béton ${i + 1}`, R * 2, R * 2, round, 3, (c) => {
    ell(c, 0, -R, R, R, sideGrad(c, -R, R, '#b0b0b4'), 0.05);
    ell(c, 0, -R, R * 0.72, R * 0.72, '#4a4a50', 0.035);
  });
for (let i = 0; i < 3; i++)
  TB(`tb.drumpyramid.${i}`, `Pyramide de fûts ${i + 1}`, 1.8, 1.0 + i * 0.3, hump, i ? 3 : 2, (c) => {
    const rows = 2 + i;
    const R = 0.3;
    for (let row = 0; row < rows; row++)
      for (let k = 0; k < rows - row; k++) {
        const x = -(rows - row - 1) * R + k * R * 2;
        rect(c, x - R, -R * 2 - row * R * 1.65, R * 2, R * 1.65, sideGrad(c, x - R, x + R, SHIRTS[(k + row) % 6]), 0.03, 0.12);
      }
  });
for (let i = 0; i < 3; i++)
  TB(`tb.haystack.${i}`, `Meule de bottes ${i + 1}`, 2.4, 0.8 + i * 0.4, box(0.25), i === 0 ? 1 : i === 1 ? 2 : 3, (c) => {
    const rows = 2 + i;
    for (let row = 0; row < rows; row++) for (let k = 0; k < 3; k++) rect(c, -1.2 + k * 0.8, -0.4 * (row + 1), 0.8, 0.4, sideGrad(c, -1.2 + k * 0.8, -0.4 + k * 0.8, '#e6c25a'), 0.03, 0.04);
  });
for (let i = 0; i < 3; i++)
  TB(`tb.ramp.${i}`, `Grande rampe en bois ${i + 1}`, 3.4 + i * 0.6, 1 + i * 0.25, (u) => (u < 0.62 ? u / 0.62 : u < 0.85 ? 1 : (1 - u) / 0.15), i === 0 ? 1 : 2, (c) => {
    const W = 3.4 + i * 0.6;
    const H = 1 + i * 0.25;
    poly(c, [[-W / 2, 0], [W * 0.12, -H], [W * 0.35, -H], [W / 2, 0]], sideGrad(c, -W / 2, W / 2, '#b8864e'), 0.04);
    for (let k = 1; k < 7; k++) line(c, [[-W / 2 + k * W * 0.09, -0.02], [-W / 2 + k * W * 0.09, -H * k * 0.16]], '#7a4a2a', 0.025, false);
  });
for (let i = 0; i < 3; i++)
  TB(`tb.rockgarden.${i}`, `Jardin de rochers ${i + 1}`, 3.6, 0.55 + i * 0.1, (u) => 0.55 + 0.45 * Math.abs(Math.sin(u * Math.PI * 3)), i === 0 ? 1 : 2, (c, r) => {
    for (let k = 0; k < 6; k++) {
      c.save();
      c.translate(-1.5 + k * 0.6, 0);
      rockShape(c, r, 0.7, 0.35 + r.range(0, 0.25) + i * 0.08, i ? RED[k % 4] : '#8e9098', null);
      c.restore();
    }
  });
for (let i = 0; i < 2; i++)
  TB(`tb.slab.${i}`, `Dalle de rocher inclinée ${i + 1}`, 3.2, 0.9 + i * 0.25, (u) => (u < 0.7 ? u / 0.7 : (1 - u) / 0.3), 2, (c) => {
    const H = 0.9 + i * 0.25;
    poly(c, [[-1.6, 0], [0.64, -H], [1.6, 0]], sideGrad(c, -1.6, 1.6, i ? RED[2] : '#9a9ca6'), 0.05);
    line(c, [[-1, -0.2], [0.4, -H * 0.7]], 'rgba(255,255,255,0.25)', 0.04, false);
  });
// trial circuit decor (16)
for (let i = 0; i < 4; i++)
  add(`tb.banner.${i}`, `Banderole trial ${i + 1}`, 'trial', 'trackside', () =>
    sprite(4, 1.4, (c) => {
      for (const x of [-1.9, 1.9]) line(c, [[x, 0], [x, -1.3]], '#9a9aa2', 0.05);
      rect(c, -1.9, -1.3, 3.8, 0.7, ['#d8261f', '#1a1a1e', '#2f8a3a', '#2a5ad8'][i], 0.03);
      label(c, ['TRIAL', 'CHRONO', BRANDS[2], BRANDS[11]][i], 0, -0.95, 0.42, '#ffffff');
    }), 0.6);
for (let i = 0; i < 2; i++)
  add(`tb.arch.${i}`, `Arche de chrono ${i + 1}`, 'trial', 'trackside', () =>
    sprite(5, 4.4, (c) => {
      for (const x of [-2.3, 2.3]) rect(c, x - 0.15, -4, 0.3, 4, i ? '#2a5ad8' : '#d8261f', 0.04);
      rect(c, -2.5, -4.4, 5, 0.6, '#1a1a1e', 0.04);
      label(c, '00:00.0', 0, -4.1, 0.38, '#ff3a2a', null, false);
    }), 0);
for (let i = 0; i < 4; i++) add(`tb.flag.${i}`, `Fanion de circuit ${i + 1}`, 'trial', 'trackside', () => sprite(0.8, 1.9, (c) => { line(c, [[0, 0], [0, -1.8]], '#e6e6e6', 0.05); poly(c, [[0.03, -1.8], [0.6, -1.6], [0.03, -1.4]], ['#d8261f', '#2a5ad8', '#ffd21f', '#2fa84f'][i], 0.02); }), 0.6);
for (let i = 0; i < 4; i++) add(`tb.fan.${i}`, `Spectateur chrono ${i + 1}`, 'trial', 'trackside', (r) => sprite(1.1, 2.2, (c) => person(c, 0, fan(r, (['cheer', 'camera', 'point', 'stand'] as const)[i]))), 0.8);
for (let i = 0; i < 2; i++) add(`tb.mech.${i}`, `Mécanicien trial ${i + 1}`, 'trial', 'trackside', (r) => sprite(1.2, 2.2, (c) => person(c, 0, { ...fan(r, i ? 'point' : 'stand', '#d8261f'), pants: '#d8261f' })), 0.4);

// ======================================================================= ENDURO (70): big hills

for (let i = 0; i < 4; i++)
  add(`eb.hillflag.${i}`, `Drapeau de colline ${i + 1}`, 'enduro', 'trackside', () =>
    sprite(1.4, 3, (c) => {
      line(c, [[0, 0], [0, -2.8]], '#e6e6e6', 0.05);
      c.beginPath();
      c.moveTo(0.03, -2.8);
      c.quadraticCurveTo(0.6, -2.95, 1.2, -2.7);
      c.lineTo(1.1, -2.1);
      c.quadraticCurveTo(0.6, -2.3, 0.03, -2.15);
      c.closePath();
      c.fillStyle = ['#ff7a1a', '#ffd21f', '#d8261f', '#2fa84f'][i];
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.03;
      c.stroke();
    }), 0.8);
for (let i = 0; i < 3; i++)
  add(`eb.steep.${i}`, ['Panneau Montée raide', 'Panneau Descente', 'Panneau Prudence'][i], 'enduro', 'trackside', () =>
    sprite(1.2, 1.8, (c) => {
      line(c, [[0, 0], [0, -1.4]], '#9a9aa2', 0.05);
      poly(c, [[0, -1.8], [0.5, -1.05], [-0.5, -1.05]], '#ffd21f', 0.04);
      if (i < 2) poly(c, [[-0.3, -1.15], [0.3, -1.15], [i ? -0.3 : 0.3, -1.5]], INK, 0);
      else label(c, '!', 0, -1.3, 0.35, INK, null, false);
    }), 0.6);
for (let i = 0; i < 4; i++) add(`eb.bigrock.${i}`, `Rocher de colline ${i + 1}`, 'enduro', 'structure', (r) => sprite(2.4 + i * 0.4, 2, (c) => rockShape(c, r, 2.4 + i * 0.4, 1.2 + i * 0.2, ['#8e9098', '#9a8a7a', '#7e8088', '#a89888'][i], i % 2 ? '#5aa83f' : null)), 0.5);
// physical: big root clusters, log steps, stone steps (to break up long climbs)
for (let i = 0; i < 4; i++)
  add(`eb.rootcluster.${i}`, `Grosses racines ${i + 1}`, 'enduro', 'obstacle', (r) =>
    sprite(2.8, 0.3, (c) => {
      for (let k = 0; k < 4; k++) {
        const x0 = r.range(-1.3, 0.3);
        c.beginPath();
        c.moveTo(x0, 0);
        c.bezierCurveTo(x0 + 0.4, -0.35, x0 + 0.8, -0.2, x0 + r.range(1, 1.4), 0);
        c.strokeStyle = INK;
        c.lineWidth = 0.14;
        c.stroke();
        c.strokeStyle = ['#8a5a33', '#7a4a2a'][k % 2];
        c.lineWidth = 0.1;
        c.stroke();
      }
    }), 1, { w: 2.8, h: 0.2, profile: (u) => 0.5 + 0.5 * Math.sin(u * Math.PI * 3) ** 2, tier: 2 });
for (let i = 0; i < 4; i++)
  add(`eb.logstep.${i}`, `Marche en rondins ${i + 1}`, 'enduro', 'obstacle', () =>
    sprite(1.2, 0.36, (c) => {
      rect(c, -0.6, -0.34, 1.2, 0.34, sideGrad(c, -0.6, 0.6, '#7a4a2a'), 0.04, 0.12);
      ell(c, 0.55, -0.17, 0.08, 0.16, '#d6a670', 0.02);
    }), 1, { w: 1.2, h: 0.32, profile: box(0.25), tier: 2 });
for (let i = 0; i < 4; i++)
  add(`eb.stonestep.${i}`, `Marche de pierre ${i + 1}`, 'enduro', 'obstacle', (r) =>
    sprite(1.6, 0.4, (c) => {
      for (let k = 0; k < 4; k++) ell(c, -0.6 + k * 0.4, -0.18, 0.22, 0.18, shade('#9a9aa2', r.range(-0.15, 0.1)), 0.025);
    }), 1, { w: 1.6, h: 0.32, profile: box(0.2), tier: 2 });
for (let i = 0; i < 3; i++) add(`eb.ruts.${i}`, `Ornières de boue ${i + 1}`, 'enduro', 'ground', () => sprite(2.6, 0.2, (c) => { ell(c, 0, -0.05, 1.2, 0.06, '#4a3020', 0.02); line(c, [[-1, -0.07], [1, -0.07]], '#2a1a10', 0.02, false); }), 0.8);
for (let i = 0; i < 4; i++) add(`eb.climbfan.${i}`, `Supporter de colline ${i + 1}`, 'enduro', 'trackside', (r) => sprite(1.1, 2.2, (c) => person(c, 0, fan(r, (['cheer', 'point', 'camera', 'cheer'] as const)[i]))), 0.8);
add('eb.rescue.0', 'Quad de secours', 'enduro', 'trackside', () =>
  sprite(2.4, 1.6, (c) => {
    rect(c, -1, -1.1, 2, 0.5, sideGrad(c, -1, 1, '#d8261f'), 0.035, 0.12);
    rect(c, -0.1, -1.2, 0.2, 0.5, '#ffffff', 0);
    rect(c, -0.25, -1.05, 0.5, 0.2, '#ffffff', 0);
    for (const x of [-0.7, 0.7]) ell(c, x, -0.32, 0.32, 0.32, '#2a2420', 0.035);
  }), 0.2);
for (let i = 0; i < 4; i++)
  add(`eb.altitude.${i}`, `Borne d’altitude ${i + 1}`, 'enduro', 'trackside', () =>
    sprite(0.9, 1.3, (c) => {
      rect(c, -0.35, -1.1, 0.7, 1.1, '#f2f2f2', 0.03, 0.1);
      rect(c, -0.35, -1.1, 0.7, 0.25, '#2f8a3a', 0.02, 0.08);
      label(c, `${(i + 1) * 250}`, 0, -0.55, 0.2, INK, null, false);
    }), 0.4);
for (let i = 0; i < 3; i++)
  add(`eb.finish.${i}`, `Arche d’arrivée enduro ${i + 1}`, 'enduro', 'trackside', () =>
    sprite(5.6, 4.6, (c) => {
      for (const x of [-2.6, 2.6]) rect(c, x - 0.15, -4.2, 0.3, 4.2, ['#ff7a1a', '#2f8a3a', '#1a1a1e'][i], 0.04);
      rect(c, -2.8, -4.6, 5.6, 0.7, '#1a1a1e', 0.04);
      for (let k = 0; k < 18; k++) rect(c, -2.8 + k * 0.311, -3.95, 0.311, 0.15, k % 2 ? INK : '#ffffff', 0);
      label(c, 'ARRIVÉE', 0, -4.25, 0.45, '#ffffff');
    }), 0);
for (let i = 0; i < 3; i++) add(`eb.tent.${i}`, `Tente de paddock enduro ${i + 1}`, 'enduro', 'trackside', () => sprite(3.4, 3, (c) => {
  for (const x of [-1.45, 1.45]) line(c, [[x, 0], [x, -2.1]], '#d8d8de', 0.05);
  poly(c, [[-1.6, -2.1], [0, -2.9], [1.6, -2.1]], sideGrad(c, -1.6, 1.6, ['#ff7a1a', '#2f8a3a', '#2a5ad8'][i]), 0.04);
  label(c, BRANDS[i + 5], 0, -2.35, 0.24, '#ffffff');
}), 0.4);
for (let i = 0; i < 4; i++) add(`eb.benttree.${i}`, `Arbre penché ${i + 1}`, 'enduro', 'tree', (r) => sprite(4, 5.5, (c) => { trunk(c, 4.5, 0.25, '#5e3a22', 1 + i * 0.2); crown(c, r, 1.2 + i * 0.2, -4.6, 1.4, 0.9, ['#3f8a3a', '#2f6e3a', '#5aa83f', '#4a7a3a'][i], 8); }), 0.6);
for (let i = 0; i < 3; i++) add(`eb.bales.${i}`, `Rangée de bottes ${i + 1}`, 'enduro', 'trackside', () => sprite(3.4, 0.8, (c) => { for (let k = 0; k < 4; k++) rect(c, -1.6 + k * 0.82, -0.55, 0.78, 0.55, sideGrad(c, -1.6 + k * 0.82, -0.82 + k * 0.82, '#e6c25a'), 0.03, 0.05); if (i) rect(c, -1.6, -0.4, 3.2, 0.12, i > 1 ? '#d8261f' : '#2a5ad8', 0); }), 0.5);
for (let i = 0; i < 4; i++) add(`eb.tape.${i}`, `Rubalise sur arbres ${i + 1}`, 'enduro', 'trackside', () => sprite(3, 1.4, (c) => {
  for (const x of [-1.4, 1.4]) rect(c, x - 0.08, -1.4, 0.16, 1.4, '#6e4326', 0.02);
  c.beginPath();
  c.moveTo(-1.4, -1.0);
  c.quadraticCurveTo(0, -0.75, 1.4, -1.0);
  c.strokeStyle = ['#ff7a1a', '#ffd21f', '#d8261f', '#ffffff'][i];
  c.lineWidth = 0.05;
  c.stroke();
}), 0.6);
for (let i = 0; i < 4; i++) add(`eb.crestrock.${i}`, `Rochers de crête ${i + 1}`, 'enduro', 'ground', (r) => sprite(2.2, 1.0, (c) => { for (let k = 0; k < 3; k++) { c.save(); c.translate(-0.6 + k * 0.6, 0); rockShape(c, r, 0.8, 0.4 + r.range(0, 0.3), '#8e9098', k === 1 ? '#5aa83f' : null); c.restore(); } }), 0.8);
for (let i = 0; i < 4; i++) add(`eb.ferns.${i}`, `Talus de fougères ${i + 1}`, 'enduro', 'bush', (r) => sprite(1.8, 1.1, (c) => { for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + (k / 8 - 0.5) * 2.6; const L = r.range(0.6, 1); line(c, [[0, 0], [Math.cos(a) * L, Math.sin(a) * L]], ['#3f8a3a', '#5aa83f', '#6a9a3a', '#2f6e3a'][i], 0.05, false); } }), 0.8);
for (let i = 0; i < 4; i++) add(`eb.photog.${i}`, `Photographe de colline ${i + 1}`, 'enduro', 'trackside', (r) => sprite(1.2, 2.2, (c) => person(c, 0, { ...fan(r, 'camera', '#2a2a2e'), hat: SHIRTS[i * 2] })), 0.4);
for (let i = 0; i < 4; i++) add(`eb.marker.${i}`, `Piquet de virage ${i + 1}`, 'enduro', 'trackside', () => sprite(0.5, 1.3, (c) => { line(c, [[0, 0], [0, -1.2]], ['#ff7a1a', '#ffd21f', '#d8261f', '#2a5ad8'][i], 0.07); rect(c, -0.06, -1.25, 0.12, 0.2, '#ffffff', 0.015); }), 0.6);
add('eb.winch.0', 'Treuil de dépannage', 'enduro', 'trackside', () =>
  sprite(1.4, 1.2, (c) => {
    rect(c, -0.6, -0.8, 1.2, 0.8, sideGrad(c, -0.6, 0.6, '#2f8a3a'), 0.035, 0.08);
    ell(c, 0, -0.45, 0.25, 0.25, '#5a5a5e', 0.03);
  }), 0.2);
add('eb.water.0', 'Point d’eau du ravito', 'enduro', 'trackside', () => sprite(1.6, 1.4, (c) => { rect(c, -0.7, -0.8, 1.4, 0.1, '#d8d8de', 0.02); for (const x of [-0.6, 0.6]) line(c, [[x, -0.75], [x, 0]], '#9a9aa2', 0.04); for (let k = 0; k < 4; k++) rect(c, -0.55 + k * 0.3, -1.2, 0.18, 0.4, '#4fb3ff', 0.02, 0.04); }), 0.3);
void Rng;

export const EXTRA_ASSETS = out;
