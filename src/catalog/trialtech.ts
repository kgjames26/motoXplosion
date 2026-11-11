import { Rng } from '../core/math';
import { INK } from '../render/palette';
import { ell, label, line, poly, Pt, rect, rngFor, shade, sideGrad, sprite, Ctx } from './paint';
import type { AssetDef } from './types';

/**
 * v2.8: 350 technical trial obstacles, half "mobilier" (believable yard / farm / building-site
 * objects), half nature. All physical: the track follows their profile. Objects taller than
 * ~0.6 m get an access wedge (plank, sandbag or packed earth) drawn in the sprite, which is
 * exactly the slope the physics uses, so what you see is what the wheel climbs.
 */

const out: AssetDef[] = [];
let count = 0;

/** Face angle (deg) like the rocks: steeper as it grows. */
const faceDeg = (h: number) => Math.min(58, 38 + h * 22);

interface Shape {
  w: number;
  h: number;
  /** Front access length (0 = the object's own face). */
  front: number;
  back: number;
  top: (u: number) => number; // 0..1 along the top → fraction of h
}

function profileOf(s: Shape): (u: number) => number {
  return (u) => {
    const x = u * s.w;
    if (x < s.front) return (x / s.front) * s.top(0);
    if (x > s.w - s.back) return ((s.w - x) / s.back) * s.top(1);
    return s.top((x - s.front) / Math.max(0.01, s.w - s.front - s.back));
  };
}

/** Shape with sloped faces (deg) and a body of length `body`. */
function wedgeShape(h: number, body: number, topFn: (u: number) => number = () => 1, backDeg = 40): Shape {
  const front = h / Math.tan((faceDeg(h) * Math.PI) / 180);
  const back = (h * topFn(1)) / Math.tan((backDeg * Math.PI) / 180);
  return { w: front + body + back, h, front, back, top: topFn };
}

function add(id: string, name: string, s: Shape, draw: (c: Ctx, r: Rng, s: Shape) => void, kind: 'mobilier' | 'nature'): void {
  count++;
  const tier = s.h < 0.55 ? 1 : s.h < 1 ? 2 : 3;
  out.push({
    id: `tt.${id}`,
    name,
    group: 'trial',
    slot: 'obstacle',
    weight: 1,
    obstacle: { w: s.w, h: s.h, profile: profileOf(s), tier, tech: kind },
    draw: () => sprite(s.w + 0.5, s.h + 0.25, (c) => {
      c.save();
      c.translate(-s.w / 2, 0);
      draw(c, rngFor('tt.' + id), s);
      c.restore();
    }),
  });
}

// ------------------------------------------------------------------ drawing helpers (x from 0 to s.w)

/** Access wedge on the front (and a short one at the back), drawn as planks / earth / sandbags. */
function access(c: Ctx, s: Shape, style: 'plank' | 'earth' | 'bags', r: Rng): void {
  const sides: [number, number, number][] = [[0, s.front, s.h * s.top(0)], [s.w, s.w - s.back, s.h * s.top(1)]];
  for (const [x0, x1, h] of sides) {
    if (Math.abs(x1 - x0) < 0.05) continue;
    if (style === 'earth') {
      poly(c, [[x0, 0], [x1, -h], [x1, 0]], sideGrad(c, Math.min(x0, x1), Math.max(x0, x1), '#8a6440'), 0.035);
      for (let k = 0; k < 5; k++) ell(c, x0 + (x1 - x0) * r.range(0.2, 0.9), -h * r.range(0.05, 0.4), 0.04, 0.025, '#5e4228', 0, null);
    } else if (style === 'bags') {
      const n = Math.max(1, Math.round(h / 0.22));
      for (let j = 0; j < n; j++) {
        const t = (j + 0.5) / n;
        const x = x0 + (x1 - x0) * (1 - t * 0.5);
        const wd = Math.abs(x1 - x0) * (1 - t) + 0.25;
        rect(c, Math.min(x, x1) - (x1 > x0 ? wd : 0) * 0 - 0.02, -(j + 1) * (h / n), Math.max(0.3, wd), h / n, sideGrad(c, x - 0.3, x + 0.3, '#c8b48a'), 0.025, 0.06);
      }
    } else {
      // plank laid on the edge, with a small block under it
      line(c, [[x0, -0.02], [x1, -h + 0.02]], INK, 0.11);
      line(c, [[x0, -0.02], [x1, -h + 0.02]], '#b8864e', 0.075, false);
      rect(c, x0 + (x1 - x0) * 0.55 - 0.08, -h * 0.55, 0.16, h * 0.55, '#7a5a3a', 0.02);
    }
  }
}

/** Body box between the wedges. */
function body(s: Shape): [number, number, number] {
  return [s.front, s.w - s.front - s.back, s.h];
}

const STONES = ['#9a9ca6', '#7e8078', '#c8643a', '#d9a870'];
const BARKS = ['#6a4a2a', '#5a4030', '#7a5a3a', '#4e3a2a'];
const PAINTS = ['#d8261f', '#1f6fd6', '#ffd21f', '#2fa84f', '#ff7a1a'];

// ================================================================== MOBILIER (189)

// 1. tractor tyres lying flat (stacked 1-2), 15
for (let k = 0; k < 5; k++)
  for (let v = 0; v < 3; v++) {
    const h = 0.45 + k * 0.11;
    const s = wedgeShape(h, 1.4 + k * 0.15, (u) => 0.92 + 0.08 * Math.sin(Math.PI * u));
    add(`tyre.${k}.${v}`, `Pneu de tracteur ${Math.round(h * 100)} cm${['', ' boueux', ' peint'][v]}`, s, (c, r) => {
      if (h > 0.6) access(c, s, 'plank', r);
      const [x, w, H] = body(s);
      const n = h > 0.7 ? 2 : 1;
      for (let j = 0; j < n; j++) {
        const y = -H + (j * H) / n;
        rect(c, x - 0.05, y, w + 0.1, H / n, sideGrad(c, x, x + w, '#2a2724'), 0.04, (H / n) * 0.45);
        for (let q = 0; q < 9; q++) line(c, [[x + (w * (q + 0.5)) / 9, y + 0.05], [x + (w * (q + 0.8)) / 9, y + H / n - 0.05]], '#45403a', 0.05, false);
        if (v === 2) line(c, [[x, y + H / n / 2], [x + w, y + H / n / 2]], '#f2f2f2', 0.05, false);
        if (v === 1) for (let q = 0; q < 6; q++) ell(c, x + r.range(0, w), y + r.range(0.05, H / n), 0.08, 0.04, '#6a4a2a', 0, null);
      }
    }, 'mobilier');
  }
// 2. railway sleeper staircases, 16
for (let n = 2; n <= 5; n++)
  for (const [v, wood] of [[0, '#6a4a30'], [1, '#4e3a2a']] as [number, string][])
    for (const L of [0, 1]) {
      const h = n * 0.18;
      const stepW = 0.5 + L * 0.25;
      const s: Shape = { w: stepW * n * 2, h, front: 0.01, back: 0.01, top: (u) => Math.max(0.15, Math.ceil(Math.min(u, 1 - u) * 2 * n + 0.001) / n) };
      s.top = (u) => Math.min(1, Math.ceil(Math.max(0.001, Math.min(u, 1 - u) * 2 * n)) / n);
      add(`sleeper.${n}.${v}.${L}`, `Escalier de traverses ${n} marches${v ? ' sombres' : ''}${L ? ' larges' : ''}`, s, (c) => {
        for (let j = 0; j < n; j++) {
          const x0 = j * stepW;
          const w = s.w - 2 * x0;
          rect(c, x0, -(j + 1) * 0.18, w, 0.18, sideGrad(c, x0, x0 + w, wood), 0.03, 0.02);
          for (let q = 0; q < 3; q++) ell(c, x0 + 0.12 + q * 0.12, -(j + 0.5) * 0.18, 0.02, 0.02, '#2a2a2e', 0, null);
        }
      }, 'mobilier');
    }
// 3. concrete pipe stacks, 9
for (let rows = 1; rows <= 3; rows++)
  for (let d = 0; d < 3; d++) {
    const R = 0.22 + d * 0.06;
    const h = R * 2 * (1 + (rows - 1) * 0.85);
    const s = wedgeShape(h, R * 2 * rows, (u) => 0.9 + 0.1 * Math.sin(Math.PI * u));
    add(`pipes.${rows}.${d}`, `Buses béton ${rows} rang${rows > 1 ? 's' : ''} Ø${Math.round(R * 200)}`, s, (c, r) => {
      if (h > 0.55) access(c, s, 'earth', r);
      const [x, w] = body(s);
      for (let row = 0; row < rows; row++)
        for (let k = 0; k < rows - row; k++) {
          const cx = x + w / 2 + (k - (rows - row - 1) / 2) * R * 2;
          const cy = -R - row * R * 1.7;
          ell(c, cx, cy, R, R, sideGrad(c, cx - R, cx + R, '#b0b0b4'), 0.035);
          ell(c, cx, cy, R * 0.7, R * 0.7, '#4a4a50', 0.025);
        }
    }, 'mobilier');
  }
// 4. cable drums on their side, 12
for (let k = 0; k < 4; k++)
  for (let v = 0; v < 3; v++) {
    const R = 0.3 + k * 0.12;
    const h = R * 2;
    const s = wedgeShape(h, R * 1.2, (u) => 0.85 + 0.15 * Math.sin(Math.PI * u));
    add(`drum.${k}.${v}`, `Touret de câble Ø${Math.round(h * 100)}${['', ' rouge', ' gris'][v]}`, s, (c, r) => {
      access(c, s, k > 1 ? 'plank' : 'earth', r);
      const [x, w] = body(s);
      const cx = x + w / 2;
      ell(c, cx, -R, R, R, sideGrad(c, cx - R, cx + R, ['#a8733e', '#b8402a', '#8a8a92'][v]), 0.05);
      ell(c, cx, -R, R * 0.35, R * 0.35, '#2a2a2e', 0.03);
      for (let q = 0; q < 8; q++) line(c, [[cx, -R], [cx + Math.cos(q * 0.785) * R * 0.92, -R + Math.sin(q * 0.785) * R * 0.92]], 'rgba(0,0,0,0.25)', 0.03, false);
    }, 'mobilier');
  }
// 5. steel beams on blocks, 9
for (let k = 0; k < 3; k++)
  for (let v = 0; v < 3; v++) {
    const h = 0.4 + k * 0.2;
    const s = wedgeShape(h, 1.6 + v * 0.4);
    add(`beam.${k}.${v}`, `Poutre IPN sur blocs ${Math.round(h * 100)} cm`, s, (c, r) => {
      access(c, s, 'plank', r);
      const [x, w, H] = body(s);
      for (const bx of [x + 0.1, x + w - 0.45]) rect(c, bx, -H + 0.16, 0.35, H - 0.16, sideGrad(c, bx, bx + 0.35, '#9a9aa2'), 0.03);
      rect(c, x - 0.05, -H, w + 0.1, 0.05, '#8a3a2a', 0.025);
      rect(c, x - 0.05, -H + 0.12, w + 0.1, 0.05, '#8a3a2a', 0.025);
      rect(c, x + w * 0.1, -H + 0.04, w * 0.8, 0.09, '#6a2a1a', 0.015);
    }, 'mobilier');
  }
// 6. pallet stacks with plank, 18
for (let k = 0; k < 6; k++)
  for (let v = 0; v < 3; v++) {
    const n = 2 + k;
    const h = n * 0.15;
    const s = wedgeShape(h, 1.2);
    add(`pallet.${k}.${v}`, `Pile de ${n} palettes${['', ' bleues', ' grises'][v]}`, s, (c, r) => {
      if (h > 0.45) access(c, s, 'plank', r);
      const [x, w] = body(s);
      const col = ['#c8a070', '#3a6ab0', '#9a9a9a'][v];
      for (let j = 0; j < n; j++) {
        const y = -(j + 1) * 0.15;
        rect(c, x, y, w, 0.04, col, 0.02);
        rect(c, x, y + 0.11, w, 0.04, col, 0.02);
        for (const bx of [0.02, 0.5, 0.92]) rect(c, x + w * bx - 0.04, y + 0.04, 0.08, 0.07, shade(col, -0.25), 0.015);
      }
    }, 'mobilier');
  }
// 7. IBC tanks, 8
for (let k = 0; k < 2; k++)
  for (let v = 0; v < 4; v++) {
    const h = 0.95 + k * 0.2;
    const s = wedgeShape(h, 1.1);
    add(`ibc.${k}.${v}`, `Cuve IBC${['', ' pleine', ' bleue', ' blanche'][v]}`, s, (c, r) => {
      access(c, s, 'earth', r);
      const [x, w, H] = body(s);
      rect(c, x, -0.15, w, 0.15, '#7a5a3a', 0.02);
      rect(c, x + 0.03, -H, w - 0.06, H - 0.15, ['rgba(235,235,225,0.95)', '#d8d4c0', '#3a7ad8', '#f2f2f2'][v], 0.03);
      if (v === 1) rect(c, x + 0.05, -H * 0.55, w - 0.1, H * 0.4, 'rgba(120,160,200,0.5)', 0);
      for (let q = 1; q < 5; q++) line(c, [[x + (w * q) / 5, -H], [x + (w * q) / 5, -0.15]], '#9a9aa2', 0.025, false);
      for (let q = 1; q < 4; q++) line(c, [[x, -0.15 - ((H - 0.15) * q) / 4], [x + w, -0.15 - ((H - 0.15) * q) / 4]], '#9a9aa2', 0.025, false);
    }, 'mobilier');
  }
// 8. drums lying in a row, 12
for (let n = 2; n <= 4; n++)
  for (let v = 0; v < 4; v++) {
    const R = 0.29;
    const s = wedgeShape(R * 2, R * 2 * (n - 1) + 0.2, (u) => 0.85 + 0.15 * Math.abs(Math.sin(Math.PI * u * (n - 0.01))));
    add(`drums.${n}.${v}`, `${n} fûts couchés ${['rouges', 'bleus', 'jaunes', 'verts'][v]}`, s, (c, r) => {
      access(c, s, 'earth', r);
      const [x, w] = body(s);
      for (let k = 0; k < n; k++) {
        const cx = x + (w * (k + 0.5)) / n;
        ell(c, cx, -R, R, R, sideGrad(c, cx - R, cx + R, PAINTS[v]), 0.035);
        ell(c, cx, -R, R * 0.75, R * 0.75, 'rgba(0,0,0,0)', 0.02, shade(PAINTS[v], -0.3));
      }
    }, 'mobilier');
  }
// 9. jersey barriers, 12
for (let L = 0; L < 3; L++)
  for (let v = 0; v < 4; v++) {
    const h = 0.6 + (v % 2) * 0.2;
    const s = wedgeShape(h, 1.2 + L * 0.8, (u) => 0.94 + 0.06 * Math.cos(Math.PI * 2 * u));
    add(`jersey.${L}.${v}`, `Séparateur ${['béton', 'béton haut', 'rouge et blanc', 'jaune'][v]} ${['court', 'moyen', 'long'][L]}`, s, (c, r) => {
      access(c, s, 'earth', r);
      const [x, w, H] = body(s);
      poly(c, [[x, 0], [x + 0.08, -H * 0.3], [x + 0.18, -H], [x + w - 0.18, -H], [x + w - 0.08, -H * 0.3], [x + w, 0]], sideGrad(c, x, x + w, v === 2 ? '#f2f2f2' : v === 3 ? '#ffd21f' : '#b0aca4'), 0.04);
      if (v === 2) for (let q = 0; q < Math.floor(w / 0.4); q++) rect(c, x + 0.2 + q * 0.4, -H, 0.2, H, 'rgba(216,38,31,0.9)', 0);
      void r;
    }, 'mobilier');
  }
// 10. brick pallets, 9
for (let k = 0; k < 3; k++)
  for (let v = 0; v < 3; v++) {
    const h = 0.5 + k * 0.2;
    const s = wedgeShape(h, 1.1 + v * 0.2);
    add(`bricks.${k}.${v}`, `Palette de ${['briques', 'parpaings', 'pavés'][v]} ${Math.round(h * 100)} cm`, s, (c, r) => {
      access(c, s, 'plank', r);
      const [x, w, H] = body(s);
      rect(c, x, -0.12, w, 0.12, '#a8865a', 0.02);
      const bw = [0.22, 0.4, 0.15][v];
      const bh = [0.07, 0.2, 0.1][v];
      for (let y = -0.12 - bh; y > -H - 0.001; y -= bh)
        for (let xx = x + (Math.round(y / bh) % 2 ? bw / 2 : 0); xx < x + w - 0.01; xx += bw) rect(c, xx, y, Math.min(bw, x + w - xx), bh, shade(['#b8502a', '#a8a8a8', '#8a8a92'][v], r.range(-0.1, 0.08)), 0.012);
    }, 'mobilier');
  }
// 11. big bags, 12
for (let n = 1; n <= 3; n++)
  for (let v = 0; v < 4; v++) {
    const h = 0.75 + (n > 2 ? 0.1 : 0);
    const s = wedgeShape(h, 0.9 * n, (u) => 0.92 + 0.08 * Math.abs(Math.sin(Math.PI * u * n)));
    add(`bigbag.${n}.${v}`, `${n} big bag${n > 1 ? 's' : ''} de ${['sable', 'gravier', 'terre', 'cailloux'][v]}`, s, (c, r) => {
      access(c, s, 'bags', r);
      const [x, w, H] = body(s);
      for (let k = 0; k < n; k++) {
        const bx = x + (w * k) / n;
        poly(c, [[bx + 0.03, 0], [bx, -H * 0.85], [bx + 0.08, -H], [bx + w / n - 0.08, -H], [bx + w / n, -H * 0.85], [bx + w / n - 0.03, 0]], sideGrad(c, bx, bx + w / n, '#f2efe6'), 0.035);
        ell(c, bx + w / n / 2, -H + 0.02, w / n / 2 - 0.1, 0.06, ['#e6c890', '#9a9a92', '#6a4a30', '#8a8a82'][v], 0.02);
        for (const lx of [bx + 0.12, bx + w / n - 0.12]) line(c, [[lx, -H], [lx, -H - 0.12]], '#2f6ad8', 0.03);
      }
    }, 'mobilier');
  }
// 12. hay bales (round lying, square stacks), 16
for (let k = 0; k < 4; k++)
  for (let v = 0; v < 4; v++) {
    const round = v < 2;
    const h = round ? 0.7 + k * 0.12 : 0.4 * (1 + Math.min(k, 2));
    const s = wedgeShape(h, round ? h * 1.1 : 1.2 + k * 0.2, round ? (u) => 0.85 + 0.15 * Math.sin(Math.PI * u) : () => 1);
    add(`hay.${k}.${v}`, round ? `Botte ronde${v ? ' enrubannée' : ''} Ø${Math.round(h * 100)}` : `Meule de bottes ${Math.round(h * 100)} cm${v === 3 ? ' de paille' : ''}`, s, (c, r) => {
      access(c, s, round ? 'earth' : 'plank', r);
      const [x, w, H] = body(s);
      if (round) {
        const R = H / 2;
        ell(c, x + w / 2, -R, Math.max(R, w / 2), R, v ? '#1f2a22' : sideGrad(c, x, x + w, '#e6c25a'), 0.04);
        if (!v) for (let q = 1; q < 4; q++) ell(c, x + w / 2, -R, R * q * 0.25, R * q * 0.25, 'rgba(0,0,0,0)', 0.015, '#b8943a');
      } else {
        const rows = Math.round(H / 0.4);
        for (let j = 0; j < rows; j++) for (let q = 0; q < Math.ceil(w / 0.8); q++) rect(c, x + q * 0.8, -(j + 1) * 0.4, Math.min(0.8, w - q * 0.8), 0.4, sideGrad(c, x + q * 0.8, x + q * 0.8 + 0.8, v === 3 ? '#efd88a' : '#e6c25a'), 0.025, 0.04);
      }
    }, 'mobilier');
  }
// 13. water troughs and carts, 8
for (let v = 0; v < 4; v++)
  for (const t of [0, 1]) {
    const h = t ? 0.75 : 0.55;
    const s = wedgeShape(h, t ? 1.8 : 1.5);
    add(`farm.${t}.${v}`, t ? `Charrette en bois ${v + 1}` : `Abreuvoir ${['galvanisé', 'en pierre', 'en bois', 'en plastique'][v]}`, s, (c, r) => {
      access(c, s, 'earth', r);
      const [x, w, H] = body(s);
      if (t) {
        rect(c, x, -H, w, H * 0.6, sideGrad(c, x, x + w, '#8a5a33'), 0.035);
        ell(c, x + w / 2, -H * 0.35, H * 0.35, H * 0.35, '#5a3a22', 0.04);
      } else {
        poly(c, [[x, -H], [x + 0.1, 0], [x + w - 0.1, 0], [x + w, -H]], sideGrad(c, x, x + w, ['#a8acb4', '#8e8a82', '#8a5a33', '#2f6ad8'][v]), 0.035);
        rect(c, x + 0.05, -H, w - 0.1, 0.06, 'rgba(90,170,230,0.8)', 0.015);
      }
      void r;
    }, 'mobilier');
  }
// 14. benches, planters, picnic tables, 12
for (let t = 0; t < 3; t++)
  for (let v = 0; v < 4; v++) {
    const h = [0.45, 0.6, 0.75][t];
    const s = wedgeShape(h, [1.8, 1.2, 1.6][t]);
    add(`park.${t}.${v}`, `${['Banc en béton', 'Bac à fleurs', 'Table de pique-nique'][t]} ${v + 1}`, s, (c, r) => {
      if (h > 0.55) access(c, s, 'plank', r);
      const [x, w, H] = body(s);
      if (t === 0) {
        rect(c, x, -H, w, 0.12, sideGrad(c, x, x + w, ['#b0aca4', '#c8b48a', '#8e8a82', '#a8a8b0'][v]), 0.03);
        for (const bx of [x + 0.15, x + w - 0.4]) rect(c, bx, -H + 0.12, 0.25, H - 0.12, '#8e8a82', 0.025);
      } else if (t === 1) {
        rect(c, x, -H * 0.8, w, H * 0.8, sideGrad(c, x, x + w, ['#b0aca4', '#a85a3a', '#7a5a3a', '#4a4a50'][v]), 0.035);
        for (let q = 0; q < 6; q++) ell(c, x + 0.15 + (q * (w - 0.3)) / 5, -H * 0.85 - r.range(0, 0.12), 0.12, 0.1, ['#3f8a3a', '#e84a8a', '#ffd21f'][q % 3], 0.015);
      } else {
        rect(c, x, -H, w, 0.08, '#a8733e', 0.025);
        rect(c, x - 0.1, -H * 0.5, w + 0.2, 0.07, '#a8733e', 0.025);
        line(c, [[x + 0.3, -H], [x + 0.1, 0]], '#7a4a2a', 0.06);
        line(c, [[x + w - 0.3, -H], [x + w - 0.1, 0]], '#7a4a2a', 0.06);
      }
    }, 'mobilier');
  }
// 15. kerb-stone stairs, 12
for (let n = 2; n <= 5; n++)
  for (let v = 0; v < 3; v++) {
    const h = n * 0.15;
    const st = 0.35;
    const s: Shape = { w: st * n * 2 + 0.4, h, front: 0.01, back: 0.01, top: (u) => Math.min(1, Math.ceil(Math.max(0.001, Math.min(u, 1 - u) * ((st * n * 2 + 0.4) / st))) / n) };
    add(`kerb.${n}.${v}`, `Escalier de bordures ${n} marches ${['grises', 'granit', 'roses'][v]}`, s, (c) => {
      for (let j = 0; j < n; j++) {
        const x0 = j * st;
        rect(c, x0, -(j + 1) * 0.15, s.w - 2 * x0, 0.15, sideGrad(c, x0, s.w - x0, ['#b0b0b4', '#8e9098', '#c8a09a'][v]), 0.025);
      }
    }, 'mobilier');
  }
// 16. scaffold planks on trestles, 9
for (let k = 0; k < 3; k++)
  for (let v = 0; v < 3; v++) {
    const h = 0.5 + k * 0.15;
    const s = wedgeShape(h, 2 + v * 0.5);
    add(`plank.${k}.${v}`, `Madriers sur tréteaux ${Math.round(h * 100)} cm`, s, (c, r) => {
      access(c, s, 'plank', r);
      const [x, w, H] = body(s);
      rect(c, x - 0.05, -H, w + 0.1, 0.07, '#d9b070', 0.02);
      for (const bx of [x + 0.25, x + w - 0.25]) {
        line(c, [[bx - 0.2, 0], [bx, -H + 0.07]], '#9a9aa2', 0.05);
        line(c, [[bx + 0.2, 0], [bx, -H + 0.07]], '#9a9aa2', 0.05);
      }
    }, 'mobilier');
  }

// ================================================================== NATURE (161)

// 17. fallen trunks, 24
for (let k = 0; k < 6; k++)
  for (let v = 0; v < 4; v++) {
    const R = 0.15 + k * 0.05;
    const h = R * 2;
    const s = h > 0.55 ? wedgeShape(h, 1.2, (u) => 0.9 + 0.1 * Math.sin(Math.PI * u)) : { w: R * 2 + 0.6, h, front: 0.3, back: 0.3, top: (u: number) => Math.sqrt(Math.max(0.3, 1 - (2 * u - 1) ** 2)) };
    add(`trunk.${k}.${v}`, `Tronc couché Ø${Math.round(h * 100)}${['', ' moussu', ' de bouleau', ' sombre'][v]}`, s, (c, r) => {
      if (h > 0.55) access(c, s, 'earth', r);
      const cx = s.w / 2;
      const bark = v === 2 ? '#e8e6dc' : BARKS[v];
      ell(c, cx, -R, Math.max(R, (s.w - s.front - s.back) / 2 + R * 0.6), R, sideGrad(c, cx - R * 2, cx + R * 2, bark), 0.04);
      ell(c, cx + (s.w - s.front - s.back) / 2 + R * 0.4, -R, R * 0.35, R * 0.92, '#d6a670', 0.03);
      if (v === 1) for (let q = 0; q < 8; q++) ell(c, cx + r.range(-R * 2, R * 2), -R * 2 + 0.03, r.range(0.06, 0.14), 0.04, '#4f9a3c', 0, null);
      if (v === 2) for (let q = 0; q < 6; q++) line(c, [[cx + r.range(-R * 2, R * 2), -R * 1.6], [cx + r.range(-R * 2, R * 2), -R * 1.6]], '#2a2a2a', 0.03, false);
    }, 'nature');
  }
// 18. root plates, 9
for (let k = 0; k < 3; k++)
  for (let v = 0; v < 3; v++) {
    const h = 0.8 + k * 0.3;
    const s = wedgeShape(h, 0.6 + k * 0.2, () => 1, 45);
    add(`roots.${k}.${v}`, `Souche déracinée ${Math.round(h * 100)} cm`, s, (c, r) => {
      access(c, s, 'earth', r);
      const [x, w, H] = body(s);
      ell(c, x + w / 2, -H / 2, w / 2 + 0.2, H / 2, sideGrad(c, x - 0.2, x + w + 0.2, ['#6a4a30', '#5e4228', '#7a5a3a'][v]), 0.045);
      for (let q = 0; q < 10; q++) {
        const a = (q / 10) * Math.PI * 2;
        line(c, [[x + w / 2 + Math.cos(a) * w * 0.2, -H / 2 + Math.sin(a) * H * 0.2], [x + w / 2 + Math.cos(a) * (w / 2 + 0.25), -H / 2 + Math.sin(a) * (H / 2 + 0.05)]], '#4a3020', 0.04);
      }
      for (let q = 0; q < 6; q++) ell(c, x + r.range(0, w), -r.range(0.1, H), 0.06, 0.05, '#8a8a92', 0.01);
    }, 'nature');
  }
// 19. stump clusters, 12
for (let k = 0; k < 3; k++)
  for (let v = 0; v < 4; v++) {
    const n = 2 + k;
    const hs: number[] = [];
    const r0 = rngFor(`stumps.${k}.${v}`);
    for (let j = 0; j < n; j++) hs.push(r0.range(0.25, 0.55));
    const hm = Math.max(...hs);
    const w = n * 0.55 + 0.3;
    const s: Shape = { w, h: hm, front: 0.15, back: 0.15, top: (u) => {
      const j = Math.min(n - 1, Math.floor(u * n));
      return hs[j] / hm;
    } };
    add(`stumps.${k}.${v}`, `${n} souches ${['de chêne', 'de sapin', 'moussues', 'coupées'][v]}`, s, (c) => {
      for (let j = 0; j < n; j++) {
        const x = 0.15 + ((w - 0.3) * (j + 0.5)) / n;
        poly(c, [[x - 0.25, 0], [x - 0.2, -hs[j]], [x + 0.2, -hs[j]], [x + 0.25, 0]], sideGrad(c, x - 0.25, x + 0.25, BARKS[v]), 0.035);
        ell(c, x, -hs[j], 0.2, 0.05, v === 2 ? '#4f9a3c' : '#d6a670', 0.02);
      }
    }, 'nature');
  }
// 20. rock slab steps, 12
for (let n = 2; n <= 4; n++)
  for (let v = 0; v < 4; v++) {
    const h = n * 0.22;
    const st = 0.55;
    const W = st * n + 1.2 + (h / Math.tan((40 * Math.PI) / 180));
    const s: Shape = { w: W, h, front: 0.01, back: h / Math.tan((40 * Math.PI) / 180), top: (u) => Math.min(1, Math.ceil(Math.max(0.001, (u * W) / st)) / n) };
    add(`slabs.${n}.${v}`, `Dalles en escalier ${n} marches${['', ' sombres', ' rouges', ' ocre'][v]}`, s, (c, r) => {
      for (let j = 0; j < n; j++) poly(c, [[j * st, -(j * 0.22)], [j * st, -(j + 1) * 0.22], [W - s.back + 0.1, -(j + 1) * 0.22], [W, 0]], sideGrad(c, 0, W, shade(STONES[v], -0.05 * j)), 0.035);
      for (let q = 0; q < 5; q++) line(c, [[r.range(0.2, W - 0.5), -r.range(0.05, h)], [r.range(0.2, W - 0.5), -r.range(0.05, h)]], 'rgba(0,0,0,0.2)', 0.02, false);
    }, 'nature');
  }
// 21. boulder pairs, 16
for (let k = 0; k < 4; k++)
  for (let v = 0; v < 4; v++) {
    const h = 0.4 + k * 0.15;
    const s = wedgeShape(h, 0.8 + k * 0.2, (u) => (u < 0.5 ? 1 : 0.75 + 0.25 * Math.cos(Math.PI * 2 * u)), 42);
    add(`boulders.${k}.${v}`, `Paire de rochers ${Math.round(h * 100)} cm${['', ' sombres', ' rouges', ' ocre'][v]}`, s, (c, r) => {
      const W = s.w;
      const pts: Pt[] = [[0, 0]];
      for (let q = 0; q <= 20; q++) pts.push([(W * q) / 20, -profileOf(s)(q / 20) * h * r.range(0.97, 1.02)]);
      pts.push([W, 0]);
      poly(c, pts, sideGrad(c, 0, W, STONES[v]), 0.045);
      line(c, [[W * 0.55, -h * 0.8], [W * 0.5, 0]], shade(STONES[v], -0.4), 0.03, false);
      ell(c, W * 0.4, -h * 0.9, W * 0.12, h * 0.05, 'rgba(255,255,255,0.25)', 0, null);
    }, 'nature');
  }
// 22. natural ledges, 12
for (let k = 0; k < 3; k++)
  for (let v = 0; v < 4; v++) {
    const h = 0.45 + k * 0.25;
    const s = wedgeShape(h, 2.5 + k, () => 1, 30);
    add(`ledge.${k}.${v}`, `Marche rocheuse ${Math.round(h * 100)} cm${['', ' sombre', ' rouge', ' ocre'][v]}`, s, (c, r) => {
      const W = s.w;
      poly(c, [[0, 0], [s.front, -h], [W - s.back, -h], [W, 0]], sideGrad(c, 0, W, STONES[v]), 0.045);
      for (let q = 1; q < 3; q++) line(c, [[s.front * 0.5, -h * (q / 3)], [W - s.back * 0.5, -h * (q / 3) + r.range(-0.03, 0.03)]], 'rgba(255,230,190,0.25)', 0.03, false);
      for (let q = 0; q < 5; q++) ell(c, r.range(s.front, W - s.back), -h + 0.02, r.range(0.08, 0.16), 0.03, '#5aa83f', 0, null);
    }, 'nature');
  }
// 23. mossy log stacks, 12
for (let k = 0; k < 3; k++)
  for (let v = 0; v < 4; v++) {
    const n = 2 + (k > 0 ? 1 : 0);
    const R = 0.18 + k * 0.03;
    const h = R * 2 * (n > 2 ? 1.85 : 1);
    const s = wedgeShape(h, R * 2 * 2 + 0.2, (u) => 0.85 + 0.15 * Math.sin(Math.PI * u));
    add(`logpile.${k}.${v}`, `Tas de rondins ${n} ${['moussus', 'secs', 'de bouleau', 'sombres'][v]}`, s, (c, r) => {
      access(c, s, 'earth', r);
      const [x, w] = body(s);
      const pos: [number, number][] = n > 2 ? [[-R, -R], [R, -R], [0, -R * 2.7]] : [[-R, -R], [R, -R]];
      for (const [dx, dy] of pos) {
        ell(c, x + w / 2 + dx, dy, R, R, v === 2 ? '#e8e6dc' : '#d6a670', 0.03);
        ell(c, x + w / 2 + dx, dy, R * 0.5, R * 0.5, 'rgba(0,0,0,0)', 0.015, '#a8733e');
      }
      if (v === 0) for (let q = 0; q < 5; q++) ell(c, x + w / 2 + r.range(-R * 2, R * 2), -h + 0.03, 0.07, 0.03, '#4f9a3c', 0, null);
    }, 'nature');
  }
// 24. earth banks with roots, 12
for (let k = 0; k < 4; k++)
  for (let v = 0; v < 3; v++) {
    const h = 0.4 + k * 0.2;
    const s = wedgeShape(h, 1.5 + v, () => 1, 35);
    add(`bank.${k}.${v}`, `Talus à racines ${Math.round(h * 100)} cm${['', ' herbeux', ' boueux'][v]}`, s, (c, r) => {
      const W = s.w;
      poly(c, [[0, 0], [s.front, -h], [W - s.back, -h], [W, 0]], sideGrad(c, 0, W, ['#8a6440', '#6a7a3a', '#5e4228'][v]), 0.04);
      if (v === 1) poly(c, [[s.front - 0.05, -h], [W - s.back + 0.05, -h], [W - s.back, -h + 0.08], [s.front, -h + 0.08]], '#5aa83f', 0.02);
      for (let q = 0; q < 6; q++) {
        const x0 = r.range(0.1, s.front);
        line(c, [[x0, -r.range(0.1, h)], [x0 + r.range(0.1, 0.4), -r.range(0.05, h)]], '#4a3020', 0.035);
      }
    }, 'nature');
  }
// 25. scree / gravel mounds, 16
for (let k = 0; k < 4; k++)
  for (let v = 0; v < 4; v++) {
    const h = 0.35 + k * 0.15;
    const s = wedgeShape(h, 0.4 + k * 0.2, (u) => 1 - 0.12 * (2 * u - 1) ** 2, 36);
    add(`scree.${k}.${v}`, `Tas d’éboulis ${Math.round(h * 100)} cm${['', ' sombre', ' rouge', ' ocre'][v]}`, s, (c, r) => {
      const W = s.w;
      const pts: Pt[] = [[0, 0]];
      for (let q = 0; q <= 16; q++) pts.push([(W * q) / 16, -profileOf(s)(q / 16) * h]);
      pts.push([W, 0]);
      poly(c, pts, sideGrad(c, 0, W, STONES[v]), 0.035);
      for (let q = 0; q < 26; q++) {
        const x = r.range(0.05, W - 0.05);
        ell(c, x, -profileOf(s)(x / W) * h * r.range(0.2, 0.95), r.range(0.03, 0.08), r.range(0.02, 0.05), shade(STONES[v], r.range(-0.25, 0.15)), 0.01);
      }
    }, 'nature');
  }
// 26. dead trunks with cut branches, 12
for (let k = 0; k < 4; k++)
  for (let v = 0; v < 3; v++) {
    const R = 0.22 + k * 0.08;
    const h = R * 2;
    const s = h > 0.55 ? wedgeShape(h, 2.2, () => 1) : { w: 2.8, h, front: 0.35, back: 0.35, top: () => 1 };
    add(`deadtrunk.${k}.${v}`, `Arbre mort ébranché Ø${Math.round(h * 100)}`, s, (c, r) => {
      if (h > 0.55) access(c, s, 'earth', r);
      const x = s.front - 0.1;
      const w = s.w - s.front - s.back + 0.2;
      rect(c, x, -h, w, h, sideGrad(c, x, x + w, ['#9a8270', '#8a7a6a', '#7a6a5a'][v]), 0.04, R);
      for (let q = 0; q < 3; q++) {
        const bx = x + w * (0.25 + q * 0.25);
        line(c, [[bx, -h + 0.02], [bx + 0.08, -h - 0.15]], INK, 0.09);
        line(c, [[bx, -h + 0.02], [bx + 0.08, -h - 0.15]], '#9a8270', 0.06, false);
        ell(c, bx + 0.08, -h - 0.15, 0.04, 0.025, '#d6a670', 0.01);
      }
    }, 'nature');
  }
// 27. creek stepping stones, 12
for (let n = 3; n <= 6; n++)
  for (let v = 0; v < 3; v++) {
    const h = 0.28 + (n - 3) * 0.05;
    const w = n * 0.6;
    const s: Shape = { w, h, front: 0.01, back: 0.01, top: (u) => 0.55 + 0.45 * Math.abs(Math.sin(Math.PI * u * n)) };
    add(`creek.${n}.${v}`, `Gué de ${n} pierres${['', ' sombres', ' rouges'][v]}`, s, (c) => {
      ell(c, w / 2, -0.03, w / 2 + 0.2, 0.06, 'rgba(90,170,230,0.75)', 0);
      for (let j = 0; j < n; j++) ell(c, (j + 0.5) * 0.6, -h / 2, 0.28, h / 2, sideGrad(c, j * 0.6, (j + 1) * 0.6, STONES[v]), 0.03);
    }, 'nature');
  }
// 28. log bridges on rocks, 12
for (let k = 0; k < 4; k++)
  for (let v = 0; v < 3; v++) {
    const h = 0.45 + k * 0.15;
    const s = wedgeShape(h, 2 + v * 0.6);
    add(`logbridge.${k}.${v}`, `Tronc posé sur rochers ${Math.round(h * 100)} cm`, s, (c, r) => {
      const [x, w, H] = body(s);
      for (const bx of [0, s.w - s.back - 0.2]) {
        const bw = bx ? s.back + 0.2 : s.front + 0.2;
        poly(c, [[bx, 0], [bx + (bx ? 0 : bw), -H + 0.18], [bx + (bx ? 0.2 : bw), -H + 0.18], [bx + bw, 0]], sideGrad(c, bx, bx + bw, STONES[v]), 0.035);
      }
      rect(c, x - 0.3, -H, w + 0.6, 0.2, sideGrad(c, x, x + w, BARKS[v]), 0.035, 0.1);
      ell(c, x + w + 0.28, -H + 0.1, 0.05, 0.09, '#d6a670', 0.015);
      access(c, s, 'earth', r);
    }, 'nature');
  }

if (count !== 350) console.warn('trial tech assets', count);
export const TECH_ASSETS = out;
void label;
