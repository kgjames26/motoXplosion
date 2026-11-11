import { Rng } from '../core/math';
import { INK } from '../render/palette';
import { make } from '../render/sprites';
import { crown, Ctx, ell, HAIRS, label, line, PANTS, person, poly, rect, rngFor, shade, sideGrad, SKINS, sprite } from './paint';
import type { AssetDef, Obstacle, Slot } from './types';

/**
 * v2.8: San Francisco, 3500 assets. Painted Victorian houses, apartment and office towers,
 * shops, warehouses, painted walls, billboards, cable cars and trams, boats on the bay, street
 * furniture, street trees, parked cars, food trucks, walkers, animals, and cheering
 * supporters (animated in the game). Parked cars, skips, planters and benches are also
 * physical trial obstacles.
 */

const out: AssetDef[] = [];
const PRE = 'sf.';

/** Big objects (buildings) get a lower resolution so textures stay small. */
function bigSprite(w: number, h: number, draw: (c: Ctx) => void) {
  return make(w, h, draw, Math.max(14, Math.min(36, 520 / Math.max(w, h))));
}

function add(id: string, name: string, slot: Slot, w: number, h: number, draw: (c: Ctx, r: Rng) => void, opt: { weight?: number; anim?: boolean; big?: boolean } = {}): void {
  const full = PRE + id;
  out.push({
    id: full,
    name,
    group: 'sf',
    slot,
    weight: opt.weight ?? 1,
    anim: opt.anim,
    draw: () => (opt.big ? bigSprite : sprite)(w, h, (c) => draw(c, rngFor(full))),
  });
}

function addObstacle(id: string, name: string, o: Obstacle, draw: (c: Ctx, r: Rng) => void): void {
  const full = 'sfo.' + id;
  out.push({ id: full, name, group: 'trial', slot: 'obstacle', world: 'sf', weight: 1, obstacle: o, draw: () => sprite(o.w + 0.4, o.h + 0.3, (c) => draw(c, rngFor(full))) });
}

const LADIES = [
  ['#e8a0b8', '#f2efe6', '#7a3a5a'],
  ['#8ac8e0', '#f2efe6', '#2a5a8a'],
  ['#f2d27a', '#ffffff', '#8a5a2a'],
  ['#a8d8a0', '#f2efe6', '#3a6a3a'],
  ['#c8a8e0', '#ffffff', '#5a3a8a'],
  ['#f2b080', '#f2efe6', '#8a3a2a'],
  ['#e8e0c8', '#3a5a8a', '#8a2a2a'],
  ['#9ab0d8', '#f2d27a', '#2a3a6a'],
  ['#d8e8f0', '#d84a6a', '#2a4a6a'],
  ['#e86a5a', '#f2efe6', '#2a2a3a'],
  ['#7ac8b8', '#ffffff', '#2a5a5a'],
  ['#f2efe6', '#5a8a3a', '#3a3a3a'],
];

// 1. Victorian "painted ladies": 12 palettes × 4 roofs × 3 storeys × 3 widths × 2 bays = 864
const ROOFS = ['à pignon', 'en tourelle', 'à corniche', 'mansardé'];
for (let p = 0; p < 12; p++)
  for (let rf = 0; rf < 4; rf++)
    for (let st = 2; st <= 4; st++)
      for (let wd = 0; wd < 3; wd++)
        for (const bay of [0, 1]) {
          const W = 4.5 + wd * 1.2;
          const H = st * 3 + 2.4;
          add(`vic.${p}.${rf}.${st}.${wd}.${bay}`, `Maison victorienne ${ROOFS[rf]} ${st} étages`, 'structure', W + 1, H + 1, (c) => {
            const [wall, trim, accent] = LADIES[p];
            rect(c, -W / 2, -H + 2, W, H - 2, sideGrad(c, -W / 2, W / 2, wall), 0.06);
            // stairs + porch
            for (let k = 0; k < 4; k++) rect(c, -W * 0.38, -k * 0.25 - 0.25, W * 0.3, 0.25, shade(trim, -0.1 * k), 0.02);
            rect(c, -W * 0.36, -2.2, W * 0.26, 1.9, accent, 0.03);
            // windows per storey
            for (let s = 0; s < st; s++) {
              const y = -2.6 - s * 3;
              if (bay && s > 0) poly(c, [[W * 0.02, y + 0.3], [W * 0.1, y - 1.9], [W * 0.42, y - 1.9], [W * 0.5, y + 0.3]], shade(wall, -0.08), 0.04);
              for (const x of bay && s > 0 ? [W * 0.14, W * 0.3] : [-W * 0.05, W * 0.25]) {
                rect(c, x - 0.35, y - 1.6, 0.7, 1.5, '#5a7a9a', 0.03);
                rect(c, x - 0.45, y - 1.75, 0.9, 0.18, trim, 0.02);
                line(c, [[x, y - 1.6], [x, y - 0.1]], trim, 0.04, false);
              }
              rect(c, -W / 2, y + 0.15, W, 0.15, trim, 0.02);
            }
            // roofs
            const top = -H + 2;
            if (rf === 0) poly(c, [[-W / 2 - 0.2, top], [0, top - 2.2], [W / 2 + 0.2, top]], accent, 0.05);
            else if (rf === 1) {
              rect(c, -W / 2, top - 0.6, W, 0.6, trim, 0.04);
              rect(c, W * 0.12, top - 2.2, W * 0.34, 2.2, wall, 0.04);
              poly(c, [[W * 0.08, top - 2.2], [W * 0.29, top - 3.6], [W * 0.5, top - 2.2]], accent, 0.04);
            } else if (rf === 2) {
              rect(c, -W / 2 - 0.3, top - 0.9, W + 0.6, 0.5, trim, 0.04);
              for (let k = 0; k < 8; k++) rect(c, -W / 2 + (k * W) / 7.5, top - 0.45, 0.2, 0.3, accent, 0.015);
            } else {
              poly(c, [[-W / 2, top], [-W / 2 + 0.6, top - 1.9], [W / 2 - 0.6, top - 1.9], [W / 2, top]], accent, 0.05);
              for (const x of [-W * 0.18, W * 0.18]) rect(c, x - 0.3, top - 1.5, 0.6, 0.9, '#5a7a9a', 0.03);
            }
          }, { weight: 0.5, big: true });
        }

// 2. apartment & office towers: 10 colours × 6 heights × 4 window patterns × 3 roofs = 720
const TOWER = ['#c8c0b0', '#a8b0bc', '#8a96a8', '#d8cbb0', '#b88a6a', '#6a7488', '#e6e2d8', '#9aa89a', '#c8a890', '#5a6478'];
for (let ci = 0; ci < 10; ci++)
  for (let hi = 0; hi < 6; hi++)
    for (let wp = 0; wp < 4; wp++)
      for (let rf = 0; rf < 3; rf++) {
        const floors = 4 + hi * 4;
        const H = floors * 3;
        const W = 8 + (hi % 3) * 3;
        add(`tower.${ci}.${hi}.${wp}.${rf}`, `${hi < 2 ? 'Immeuble' : hi < 4 ? 'Tour de bureaux' : 'Gratte-ciel'} ${floors} étages`, 'structure', W + 1, H + 4, (c) => {
          const col = TOWER[ci];
          rect(c, -W / 2, -H, W, H, sideGrad(c, -W / 2, W / 2, col), 0.07);
          const glass = wp === 3;
          if (glass) {
            for (let x = -W / 2 + 0.4; x < W / 2 - 0.3; x += 1.2) rect(c, x, -H + 0.5, 0.9, H - 1.5, 'rgba(120,170,210,0.75)', 0);
          } else
            for (let f = 0; f < floors; f++)
              for (let x = -W / 2 + 0.6; x < W / 2 - 0.6; x += wp === 1 ? 2 : 1.4) {
                const lit = ((f * 31 + Math.round(x * 7) + ci) % 7) < 2;
                rect(c, x, -f * 3 - 2.4, wp === 2 ? 1.6 : 0.9, 1.6, lit ? '#ffe7a0' : '#4a6a8a', 0.02);
              }
          rect(c, -W / 2 - 0.2, -2.6, W + 0.4, 0.3, shade(col, -0.3), 0.03);
          rect(c, -1, -2.3, 2, 2.3, '#3a4a5a', 0.03);
          if (rf === 0) rect(c, -W / 2 - 0.3, -H - 0.6, W + 0.6, 0.6, shade(col, -0.2), 0.04);
          else if (rf === 1) {
            rect(c, -W * 0.25, -H - 2.5, W * 0.5, 2.5, shade(col, -0.1), 0.04);
            line(c, [[0, -H - 2.5], [0, -H - 6]], '#3a3a40', 0.12);
          } else poly(c, [[-W / 2, -H], [0, -H - 3.5], [W / 2, -H]], shade(col, -0.15), 0.05);
        }, { weight: 0.35, big: true });
      }

// 3. storefronts: 12 colours × 8 shops × 3 awnings = 288
const SHOPS = ['CAFÉ', 'BAKERY', 'FLOWERS', 'BOOKS', 'PIZZA', 'SURF', 'DINER', 'MARKET'];
const AWN = ['#d8261f', '#2a5ad8', '#2fa84f'];
for (let ci = 0; ci < 12; ci++)
  for (let s = 0; s < 8; s++)
    for (let a = 0; a < 3; a++) {
      add(`shop.${ci}.${s}.${a}`, `Boutique ${SHOPS[s].toLowerCase()} ${ci + 1}`, 'structure', 7.5, 7, (c) => {
        const wall = LADIES[ci][0];
        rect(c, -3.5, -6.5, 7, 6.5, sideGrad(c, -3.5, 3.5, wall), 0.05);
        rect(c, -3.2, -2.9, 4.2, 2.6, 'rgba(150,190,220,0.85)', 0.03);
        rect(c, 1.4, -2.7, 1.4, 2.7, '#4a3a2a', 0.03);
        for (let k = 0; k < 9; k++) poly(c, [[-3.4 + k * 0.76, -3.2], [-3.4 + (k + 1) * 0.76, -3.2], [-3.4 + (k + 0.5) * 0.76, -2.9]], k % 2 ? AWN[a] : '#f2efe6', 0.015);
        rect(c, -3.5, -3.6, 7, 0.45, AWN[a], 0.03);
        label(c, SHOPS[s], -0.2, -5.1, 0.85, '#ffffff', INK);
        for (const x of [-2.4, 0.6]) rect(c, x, -6.2, 1.2, 1.4, '#5a7a9a', 0.03);
      }, { weight: 0.5 });
    }

// 4. street furniture: 20 types × 10 variants = 200
const FURN = ['Bouche d’incendie', 'Lampadaire', 'Banc public', 'Poubelle', 'Parcmètre', 'Range-vélos', 'Abribus', 'Boîte à journaux', 'Feu tricolore', 'Plaque de rue', 'Jardinière', 'Boîte aux lettres', 'Borne', 'Cabine téléphonique', 'Fontaine à eau', 'Horloge de rue', 'Panneau stop', 'Cône de chantier', 'Barrière de chantier', 'Kiosque'];
const FCOL = ['#d8261f', '#2a5ad8', '#2fa84f', '#ffd21f', '#3a3a40', '#f2efe6', '#ff7a1a', '#7a3fd1', '#8a5a33', '#14d1c0'];
FURN.forEach((name, t) => {
  for (let v = 0; v < 10; v++)
    // tall pieces stand behind the track (never in the foreground band)
    add(`furn.${t}.${v}`, `${name} ${v + 1}`, [1, 6, 8, 13, 15, 18, 19].includes(t) ? 'structure' : 'ground', 2.6, t === 1 || t === 8 || t === 15 ? 4.6 : t === 6 || t === 13 || t === 19 ? 3 : 1.8, (c) => {
      const col = FCOL[v];
      switch (t) {
        case 0:
          rect(c, -0.18, -0.7, 0.36, 0.7, col, 0.03, 0.1);
          ell(c, 0, -0.72, 0.2, 0.1, shade(col, -0.2), 0.02);
          rect(c, -0.3, -0.5, 0.6, 0.12, shade(col, -0.2), 0.02);
          break;
        case 1:
        case 15:
          line(c, [[0, 0], [0, -4.2]], '#2a2a30', 0.12);
          if (t === 1) {
            line(c, [[0, -4.2], [0.7, -4.3]], '#2a2a30', 0.08);
            rect(c, 0.5, -4.35, 0.4, 0.2, '#ffe7a0', 0.02);
          } else {
            ell(c, 0, -4.2, 0.35, 0.35, '#f2efe6', 0.05);
            line(c, [[0, -4.2], [0, -4.45]], INK, 0.03, false);
            line(c, [[0, -4.2], [0.18, -4.2]], INK, 0.03, false);
          }
          break;
        case 2:
          rect(c, -0.9, -0.5, 1.8, 0.1, '#8a5a33', 0.02);
          rect(c, -0.9, -0.95, 1.8, 0.1, '#8a5a33', 0.02);
          for (const x of [-0.75, 0.75]) line(c, [[x, -0.95], [x, 0]], col, 0.06);
          break;
        case 3:
          rect(c, -0.25, -0.9, 0.5, 0.9, sideGrad(c, -0.25, 0.25, col), 0.03, 0.06);
          break;
        case 4:
          line(c, [[0, 0], [0, -1.1]], '#3a3a40', 0.07);
          rect(c, -0.13, -1.5, 0.26, 0.4, col, 0.02, 0.06);
          break;
        case 5:
          for (let k = 0; k < 4; k++) c.beginPath(), c.arc(-0.75 + k * 0.5, -0.3, 0.25, Math.PI, 0), (c.strokeStyle = col), (c.lineWidth = 0.05), c.stroke();
          break;
        case 6:
        case 13:
          rect(c, -1.1, -2.6, 2.2, 0.15, col, 0.02);
          line(c, [[-1, -2.5], [-1, 0]], '#3a3a40', 0.06);
          line(c, [[1, -2.5], [1, 0]], '#3a3a40', 0.06);
          rect(c, -0.95, -2.4, 1.9, 1.6, 'rgba(160,200,230,0.5)', 0.02);
          break;
        case 7:
        case 11:
          rect(c, -0.3, -1.1, 0.6, 0.8, col, 0.03, 0.05);
          line(c, [[0, -0.3], [0, 0]], '#3a3a40', 0.06);
          break;
        case 8:
          line(c, [[0, 0], [0, -3.2]], '#2a2a30', 0.1);
          rect(c, -0.22, -4.4, 0.44, 1.2, '#2a2a30', 0.03, 0.06);
          for (let k = 0; k < 3; k++) ell(c, 0, -4.2 + k * 0.38, 0.13, 0.13, ['#ff3a2a', '#ffc21f', '#3aff6a'][k], 0.02);
          break;
        case 9:
        case 16:
          line(c, [[0, 0], [0, -1.6]], '#5a5a60', 0.05);
          if (t === 16) {
            const R = 0.35;
            const pts: [number, number][] = [];
            for (let k = 0; k < 8; k++) pts.push([Math.cos((k + 0.5) * 0.785) * R, -1.7 + Math.sin((k + 0.5) * 0.785) * R]);
            poly(c, pts, '#d8261f', 0.025);
            label(c, 'STOP', 0, -1.7, 0.16, '#ffffff', null, false);
          } else rect(c, -0.5, -1.75, 1, 0.25, '#2f8a3a', 0.02);
          break;
        case 10:
          poly(c, [[-0.5, -0.5], [-0.4, 0], [0.4, 0], [0.5, -0.5]], col, 0.03);
          crown(c, new Rng(v + 3), 0, -0.75, 0.45, 0.3, '#3f8a3a', 5);
          break;
        case 12:
          rect(c, -0.12, -0.8, 0.24, 0.8, col, 0.02, 0.1);
          break;
        case 14:
          rect(c, -0.2, -0.95, 0.4, 0.95, col, 0.03, 0.05);
          break;
        case 17:
          poly(c, [[-0.25, 0], [0, -0.7], [0.25, 0]], '#ff7a1a', 0.025);
          rect(c, -0.12, -0.45, 0.24, 0.08, '#f2efe6', 0);
          break;
        case 18:
          rect(c, -1, -1, 2, 0.3, '#f2efe6', 0.02);
          for (let k = 0; k < 4; k++) rect(c, -0.95 + k * 0.5, -1, 0.25, 0.3, '#d8261f', 0);
          for (const x of [-0.85, 0.85]) line(c, [[x, -0.7], [x, 0]], '#3a3a40', 0.05);
          break;
        default:
          rect(c, -1, -2.5, 2, 2.5, sideGrad(c, -1, 1, col), 0.04, 0.1);
          poly(c, [[-1.2, -2.5], [0, -3], [1.2, -2.5]], shade(col, -0.25), 0.03);
      }
    }, { weight: 0.7 });
});

// 5. parked cars (decor): 10 bodies × 12 colours = 120
const CARCOL = ['#d8261f', '#2a5ad8', '#f2f2f2', '#1e1e24', '#ffd21f', '#2fa84f', '#8a96a8', '#ff7a1a', '#7a3fd1', '#e84a8a', '#5a3a22', '#14d1c0'];
const BODIES = ['Citadine', 'Berline', 'Break', 'Coupé', 'Pick-up', 'Fourgon', 'Taxi', 'Cabriolet', 'Combi', 'SUV'];
function car(c: Ctx, body: number, col: string): void {
  const L = [3.6, 4.6, 4.7, 4.2, 5, 5, 4.6, 4.2, 4.4, 4.7][body];
  const roofH = [1.45, 1.45, 1.5, 1.3, 1.75, 2.2, 1.45, 1.1, 2.0, 1.75][body];
  const x0 = -L / 2;
  poly(c, [[x0, -0.35], [x0 + 0.1, -0.85], [x0 + L * 0.22, -0.95], [x0 + L * 0.32, -roofH], [x0 + L * (body === 2 || body >= 5 ? 0.95 : 0.72), -roofH], [x0 + L * (body === 2 || body >= 5 ? 0.98 : 0.85), -0.95], [x0 + L, -0.85], [x0 + L, -0.35]], sideGrad(c, x0, -x0, body === 6 ? '#ffd21f' : col), 0.04);
  if (body !== 7) rect(c, x0 + L * 0.35, -roofH + 0.12, L * 0.33, roofH - 1.05, 'rgba(150,190,220,0.8)', 0.02);
  for (const wx of [x0 + L * 0.2, x0 + L * 0.8]) {
    ell(c, wx, -0.33, 0.33, 0.33, '#1e1e22', 0.03);
    ell(c, wx, -0.33, 0.14, 0.14, '#b0b0b8', 0.015);
  }
  if (body === 6) label(c, 'TAXI', 0, -roofH - 0.12, 0.22, INK, null, false);
}
for (let b = 0; b < 10; b++) for (let k = 0; k < 12; k++) add(`car.${b}.${k}`, `${BODIES[b]} garée ${k + 1}`, 'structure', 5.4, 2.6, (c) => car(c, b, CARCOL[k]), { weight: 0.6 });

// 6. supporters (animated): 8 poses × 12 shirts × 3 looks = 288
const POSES = ['cheer', 'flag', 'camera', 'point', 'stand', 'cheer', 'flag', 'sit'] as const;
for (let p = 0; p < 8; p++)
  for (let s = 0; s < 12; s++)
    for (let l = 0; l < 3; l++)
      add(`fan.${p}.${s}.${l}`, `Supporter ${p * 36 + s * 3 + l + 1}`, 'trackside', 1.2, 2.3, (c) => {
        person(c, 0, { shirt: CARCOL[s], pants: PANTS[(s + l) % PANTS.length], skin: SKINS[(l * 2 + s) % SKINS.length], hair: HAIRS[(p + l) % HAIRS.length], hat: p % 3 === 0 ? CARCOL[(s + 3) % 12] : undefined, pose: POSES[p], flag: CARCOL[(s + 5) % 12] });
      }, { weight: 0.8, anim: true });

// 7. street trees: 5 species × 5 sizes × 2 = 50
const STREES = [['Platane', '#5a8a3a'], ['Ginkgo', '#a8c84a'], ['Palmier des Canaries', '#3f7a3a'], ['Eucalyptus', '#7a9a8a'], ['Cyprès de Monterey', '#2f5a3a']];
STREES.forEach(([name, col], t) => {
  for (let z = 0; z < 5; z++)
    for (let v = 0; v < 2; v++) {
      const H = 4 + z * 1.4;
      add(`tree.${t}.${z}.${v}`, `${name} ${z + 1}`, 'tree', H * 0.8, H + 0.4, (c, r) => {
        rect(c, -0.6, -0.12, 1.2, 0.12, '#8a8a8a', 0.02);
        if (t === 2) {
          line(c, [[0, 0], [0, -H]], '#8a6a4a', 0.35);
          for (let k = 0; k < 9; k++) {
            const a = (k / 9) * Math.PI * 2;
            line(c, [[0, -H], [Math.cos(a) * H * 0.3, -H + Math.sin(a) * H * 0.12 + H * 0.05]], col, 0.14);
          }
        } else {
          line(c, [[0, 0], [0, -H * 0.5]], t === 3 ? '#c8c0b0' : '#6e4326', 0.25);
          crown(c, r, 0, -H * 0.68, H * (t === 4 ? 0.42 : 0.32) * (1 + v * 0.1), H * (t === 4 ? 0.22 : 0.32), col, 8);
        }
      }, { weight: 0.6 });
    }
});

// 8. cable cars, trams, buses: 4 types × 6 liveries = 24
const VEH = ['Cable car', 'Tramway historique', 'Bus électrique', 'Trolleybus'];
const LIV = ['#d8261f', '#2a5ad8', '#2fa84f', '#ff7a1a', '#ffd21f', '#8a5a33'];
for (let t = 0; t < 4; t++)
  for (let l = 0; l < 6; l++)
    add(`veh.${t}.${l}`, `${VEH[t]} ${l + 1}`, 'structure', 11, 4.6, (c) => {
      const L = t === 0 ? 8 : 10;
      rect(c, -L / 2, -3.2, L, 2.8, sideGrad(c, -L / 2, L / 2, LIV[l]), 0.05, 0.3);
      rect(c, -L / 2, -1.2, L, 0.5, '#f2efe6', 0.02);
      for (let k = 0; k < (t === 0 ? 6 : 8); k++) rect(c, -L / 2 + 0.4 + k * (L - 0.8) / (t === 0 ? 6 : 8), -2.9, (L - 1.2) / (t === 0 ? 6 : 8) - 0.15, 1.3, 'rgba(160,200,230,0.85)', 0.02);
      if (t >= 2) for (const x of [-L * 0.35, L * 0.35]) ell(c, x, -0.4, 0.45, 0.45, '#1e1e22', 0.04);
      else for (const x of [-L * 0.3, L * 0.3]) ell(c, x, -0.25, 0.3, 0.25, '#3a3a40', 0.03);
      if (t === 1 || t === 3) line(c, [[0, -3.2], [-1, -4.4], [3, -4.4]], '#3a3a40', 0.05);
      if (t === 0) rect(c, -L / 2 - 0.3, -2.3, 0.3, 1.6, '#c8a050', 0.03);
    }, { weight: 0.15 });

// 9. warehouses & garages: 6 types × 6 colours × 5 sizes = 180
const WH = ['Entrepôt de briques', 'Garage', 'Hangar du port', 'Atelier', 'Parking couvert', 'Caserne de pompiers'];
const WHC = ['#a85a3a', '#8a96a8', '#c8b090', '#6a7488', '#d8261f', '#5a6a4a'];
for (let t = 0; t < 6; t++)
  for (let k = 0; k < 6; k++)
    for (let z = 0; z < 5; z++) {
      const W = 8 + z * 2;
      const H = 5 + z;
      add(`wh.${t}.${k}.${z}`, `${WH[t]} ${z + 1}`, 'structure', W + 1, H + 1.5, (c) => {
        const col = t === 5 ? '#c8402a' : WHC[k];
        rect(c, -W / 2, -H, W, H, sideGrad(c, -W / 2, W / 2, col), 0.06);
        if (t === 0) for (let y = -0.4; y > -H; y -= 0.4) line(c, [[-W / 2, y], [W / 2, y]], 'rgba(0,0,0,0.15)', 0.03, false);
        if (t === 2) poly(c, [[-W / 2 - 0.3, -H], [0, -H - 2], [W / 2 + 0.3, -H]], shade(col, -0.2), 0.05);
        const doors = t === 1 || t === 5 ? 3 : 2;
        for (let d = 0; d < doors; d++) {
          const x = -W / 2 + ((d + 0.5) * W) / doors;
          rect(c, x - W / doors / 3, -H * 0.55, (W / doors) * 0.66, H * 0.55, t === 5 ? '#d8261f' : '#6a6a70', 0.03);
          for (let y = -H * 0.5; y < 0; y += 0.3) line(c, [[x - W / doors / 3, y], [x + W / doors / 3, y]], 'rgba(0,0,0,0.2)', 0.02, false);
        }
        for (let x = -W / 2 + 1; x < W / 2 - 0.5; x += 1.6) rect(c, x, -H * 0.85, 1, H * 0.18, '#5a7a9a', 0.02);
        label(c, t === 5 ? 'ENGINE 7' : t === 4 ? 'PARKING' : t === 2 ? `PIER ${k + z * 6 + 10}` : '', 0, -H * 0.66, 0.7, '#ffffff', INK);
      }, { weight: 0.35, big: true });
    }

// 10. painted walls (murals): 10 themes × 10 palettes = 100
const THEMES = ['Vagues', 'Soleil', 'Oiseaux', 'Fleurs', 'Montagnes', 'Baleine', 'Pont', 'Étoiles', 'Fusée', 'Arc-en-ciel'];
for (let t = 0; t < 10; t++)
  for (let p = 0; p < 10; p++)
    add(`mural.${t}.${p}`, `Mur peint « ${THEMES[t]} » ${p + 1}`, 'structure', 9, 5.6, (c, r) => {
      const pal = [LADIES[p][0], LADIES[(p + 3) % 12][0], LADIES[(p + 6) % 12][0], LADIES[(p + 9) % 12][2]];
      rect(c, -4.4, -5.2, 8.8, 5.2, pal[0], 0.05);
      for (let k = 0; k < 6; k++) {
        const x = r.range(-3.8, 3.8);
        const y = -r.range(0.8, 4.6);
        const s = r.range(0.4, 1.2);
        if (t % 3 === 0) {
          c.beginPath();
          c.arc(x, y, s, Math.PI, 0);
          c.strokeStyle = pal[1 + (k % 3)];
          c.lineWidth = 0.3;
          c.stroke();
        } else if (t % 3 === 1) ell(c, x, y, s, s * 0.8, pal[1 + (k % 3)], 0.03);
        else poly(c, [[x - s, y + s * 0.6], [x, y - s], [x + s, y + s * 0.6]], pal[1 + (k % 3)], 0.03);
      }
    }, { weight: 0.3 });

// 11. billboards: 10 brands × 10 colours = 100
const BRANDS = ['BAYWAVE', 'FOGGY COLA', 'HILLTOP', 'SEAL RADIO', 'GOLDEN TOAST', 'CABLE SODA', 'PIER 9', 'SUNSET JEANS', 'MISSION TACO', 'ZIPLINE'];
for (let b = 0; b < 10; b++)
  for (let k = 0; k < 10; k++)
    add(`board.${b}.${k}`, `Panneau ${BRANDS[b]} ${k + 1}`, 'structure', 7, 6.4, (c) => {
      for (const x of [-2, 2]) line(c, [[x, 0], [x, -3.4]], '#3a3a40', 0.18);
      rect(c, -3.3, -6.1, 6.6, 2.8, FCOL[k], 0.05);
      label(c, BRANDS[b], 0, -4.7, 0.7, '#ffffff', INK);
    }, { weight: 0.3 });

// 12. trial obstacles of the city (physical): cars, skips, planters, benches = 100
const box = (bev: number) => (u: number) => Math.min(1, u / bev, (1 - u) / bev);
for (let b = 0; b < 6; b++)
  for (let k = 0; k < 10; k++) {
    const h = [1.45, 1.45, 1.5, 1.3, 1.75, 2.1][b];
    const L = [3.6, 4.6, 4.7, 4.2, 5, 5][b];
    // ride over the car: bonnet, roof, boot (the access is the bumper + a plank)
    const prof = (u: number) => {
      const x = u * (L + 1.6) - 0.8;
      if (x < 0) return Math.max(0, (x + 0.8) / 0.8) * (0.75 / h);
      if (x > L) return Math.max(0, (L + 0.8 - x) / 0.8) * (0.75 / h);
      const t = x / L;
      if (t < 0.22) return (0.8 + t * 0.6) / h;
      if (t < 0.32) return (0.95 + ((t - 0.22) / 0.1) * (h - 0.95)) / h;
      if (t < 0.72) return 1;
      if (t < 0.85) return (h - ((t - 0.72) / 0.13) * (h - 0.95)) / h;
      return 0.9 / h;
    };
    addObstacle(`car.${b}.${k}`, `${BODIES[b]} garée à franchir ${k + 1}`, { w: L + 1.6, h, profile: prof, tier: h > 1.6 ? 3 : 2, tech: 'mobilier' }, (c) => {
      c.save();
      c.translate(0, 0);
      for (const sx of [-1, 1]) {
        line(c, [[sx * (L / 2 + 0.8), -0.02], [sx * (L / 2), -0.78]], INK, 0.11);
        line(c, [[sx * (L / 2 + 0.8), -0.02], [sx * (L / 2), -0.78]], '#b8864e', 0.075, false);
      }
      car(c, b, CARCOL[k]);
      c.restore();
    });
  }
for (let k = 0; k < 4; k++)
  for (let z = 0; z < 3; z++) {
    const h = 0.9 + z * 0.25;
    addObstacle(`skip.${z}.${k}`, `Benne ${['jaune', 'verte', 'bleue', 'rouge'][k]} ${z + 1}`, { w: 3 + z * 0.5, h, profile: box(0.3), tier: z ? 3 : 2, tech: 'mobilier' }, (c) => {
      const W = 3 + z * 0.5;
      poly(c, [[-W / 2, -h], [-W / 2 + 0.4, 0], [W / 2 - 0.4, 0], [W / 2, -h]], sideGrad(c, -W / 2, W / 2, ['#ffd21f', '#2fa84f', '#2a5ad8', '#d8261f'][k]), 0.05);
      for (const sx of [-1, 1]) line(c, [[sx * (W / 2 - 0.05), -0.02], [sx * (W / 2 - 0.55), -h + 0.05]], '#b8864e', 0.08);
    });
  }
for (let k = 0; k < 4; k++)
  for (let z = 0; z < 3; z++) {
    const h = 0.5 + z * 0.2;
    addObstacle(`planter.${z}.${k}`, `Bac à arbre en béton ${z + 1}`, { w: 1.8 + z * 0.3, h, profile: box(0.28), tier: z ? 2 : 1, tech: 'mobilier' }, (c, r) => {
      const W = 1.8 + z * 0.3;
      rect(c, -W / 2, -h, W, h, sideGrad(c, -W / 2, W / 2, ['#b0aca4', '#c8b090', '#8e8a82', '#a8a8b0'][k]), 0.04);
      crown(c, r, 0, -h - 0.4, W * 0.35, 0.35, '#3f8a3a', 6);
    });
  }
for (let k = 0; k < 4; k++)
  for (let z = 0; z < 2; z++) {
    const h = 0.45 + z * 0.15;
    addObstacle(`bench.${z}.${k}`, `Banc de granit ${z + 1}`, { w: 2.2, h, profile: box(0.22), tier: 1, tech: 'mobilier' }, (c) => {
      rect(c, -1.1, -h, 2.2, h, sideGrad(c, -1.1, 1.1, ['#8e9098', '#b0aca4', '#c8a09a', '#6a6e78'][k]), 0.04, 0.05);
    });
  }
for (let k = 0; k < 4; k++)
  for (let z = 0; z < 2; z++) {
    const h = 0.7 + z * 0.3;
    addObstacle(`stairs.${z}.${k}`, `Escalier de rue ${z + 1}`, { w: 3, h, profile: (u) => Math.min(1, Math.ceil(Math.max(0.001, Math.min(u, 1 - u) * 2 * 4)) / 4), tier: 2, tech: 'mobilier' }, (c) => {
      for (let j = 0; j < 4; j++) rect(c, -1.5 + j * 0.37, -(j + 1) * (h / 4), 3 - j * 0.74, h / 4, shade(['#b0b0b4', '#c8c0b0', '#a8a49e', '#8e9098'][k], -0.05 * j), 0.025);
    });
  }

// 13. bushes, planters, flower beds: 60
for (let f = 0; f < 6; f++)
  for (let k = 0; k < 10; k++)
    add(`green.${f}.${k}`, `${['Haie taillée', 'Massif de fleurs', 'Agapanthes', 'Bougainvillier', 'Hortensias', 'Fougères'][f]} ${k + 1}`, f < 2 ? 'bush' : 'ground', 2, 1.4, (c, r) => {
      if (f === 0) rect(c, -0.9, -1, 1.8, 1, sideGrad(c, -0.9, 0.9, '#3f7a3a'), 0.03, 0.2);
      else crown(c, r, 0, -0.45, 0.8, 0.45, ['#3f8a3a', '#5aa83f', '#4a7a3a'][k % 3], 7);
      for (let q = 0; q < 12; q++) ell(c, r.range(-0.7, 0.7), -r.range(0.2, 0.9), 0.06, 0.05, FCOL[(k + q) % 10], 0.01);
    });

// 14. street lamps & traffic lights variants: 60
for (let t = 0; t < 6; t++)
  for (let k = 0; k < 10; k++)
    add(`lamp.${t}.${k}`, `${['Réverbère ancien', 'Lampadaire double', 'Mât de feux', 'Lampadaire moderne', 'Guirlande lumineuse', 'Lanterne de rue'][t]} ${k + 1}`, 'structure', 2.6, 5, (c) => {
      const col = FCOL[k];
      line(c, [[0, 0], [0, -4.4]], t === 0 ? '#2a3a2a' : '#3a3a40', 0.12);
      if (t === 1) for (const s of [-1, 1]) rect(c, s * 0.7 - 0.15, -4.5, 0.3, 0.25, '#ffe7a0', 0.02), line(c, [[0, -4.4], [s * 0.7, -4.5]], '#3a3a40', 0.06);
      else if (t === 2) rect(c, -0.2, -4.2, 0.4, 1.1, col, 0.03);
      else if (t === 4) for (let q = 0; q < 6; q++) ell(c, -1 + q * 0.4, -4 + Math.sin(q) * 0.1, 0.07, 0.09, FCOL[(q + k) % 10], 0.01);
      else rect(c, -0.2, -4.75, 0.4, 0.4, '#ffe7a0', 0.03, t === 5 ? 0.1 : 0);
    }, { weight: 0.5 });

// 15. boats on the bay: 6 types × 10 colours = 60
for (let t = 0; t < 6; t++)
  for (let k = 0; k < 10; k++)
    add(`boat.${t}.${k}`, `${['Voilier', 'Bateau de pêche', 'Ferry', 'Remorqueur', 'Yacht', 'Kayak'][t]} ${k + 1}`, 'structure', 9, 7, (c) => {
      const L = [6, 6, 8, 5, 7, 3][t];
      ell(c, 0, -0.4, 4.5, 0.12, 'rgba(60,130,200,0.7)', 0);
      poly(c, [[-L / 2, -1.2], [-L / 2 + 0.6, -0.3], [L / 2 - 0.4, -0.3], [L / 2, -1.2]], sideGrad(c, -L / 2, L / 2, FCOL[k]), 0.04);
      if (t === 0 || t === 4) {
        line(c, [[0, -1.2], [0, -6.4]], '#3a3a40', 0.08);
        poly(c, [[0.1, -6.3], [2.4, -1.5], [0.1, -1.5]], '#f2efe6', 0.03);
      } else if (t !== 5) rect(c, -L * 0.2, -2.4, L * 0.4, 1.2, '#f2efe6', 0.03);
    }, { weight: 0.25 });

// 16. small hillside houses: 8 colours × 3 × 4 = 96
for (let k = 0; k < 8; k++)
  for (let s = 0; s < 3; s++)
    for (let v = 0; v < 4; v++)
      add(`hill.${k}.${s}.${v}`, `Maison sur la colline ${k * 12 + s * 4 + v + 1}`, 'structure', 6.5, 6.5, (c) => {
        const W = 4.5 + s;
        const H = 4 + v * 0.5;
        rect(c, -W / 2, -H, W, H, sideGrad(c, -W / 2, W / 2, LADIES[k][0]), 0.05);
        poly(c, [[-W / 2 - 0.2, -H], [0, -H - 1.4 - s * 0.3], [W / 2 + 0.2, -H]], LADIES[k][2], 0.05);
        rect(c, -W * 0.35, -H * 0.6, 1, 1.1, '#5a7a9a', 0.03);
        rect(c, W * 0.1, -H * 0.7, 1.2, 1.2, '#5a7a9a', 0.03);
        rect(c, -0.45, -1.9, 0.9, 1.9, LADIES[k][1], 0.03);
      }, { weight: 0.5 });

// 17. food trucks: 6 × 8 = 48
for (let t = 0; t < 6; t++)
  for (let k = 0; k < 8; k++)
    add(`food.${t}.${k}`, `Food truck ${['TACOS', 'CRÊPES', 'GLACES', 'BURGERS', 'DUMPLINGS', 'COFFEE'][t]} ${k + 1}`, 'structure', 6.6, 3.6, (c) => {
      rect(c, -3, -3, 6, 2.6, sideGrad(c, -3, 3, FCOL[k]), 0.05, 0.2);
      rect(c, -2.2, -2.6, 2.8, 1, '#2a2a30', 0.03);
      rect(c, -2.4, -2.75, 3.2, 0.2, '#f2efe6', 0.02);
      label(c, ['TACOS', 'CRÊPES', 'GLACES', 'BURGERS', 'DUMPLINGS', 'COFFEE'][t], -0.6, -1.2, 0.35, '#ffffff', INK);
      for (const x of [-1.9, 1.9]) ell(c, x, -0.4, 0.4, 0.4, '#1e1e22', 0.04);
    }, { weight: 0.3 });

// 18. walkers (not animated): 8 poses × 12 = 96
for (let p = 0; p < 8; p++)
  for (let s = 0; s < 12; s++)
    add(`walker.${p}.${s}`, `Passant ${p * 12 + s + 1}`, 'animal', 1.2, 2.2, (c) => {
      person(c, 0, { shirt: LADIES[s][0], pants: PANTS[(p + s) % PANTS.length], skin: SKINS[(p + s * 2) % SKINS.length], hair: HAIRS[(s + 1) % HAIRS.length], hat: p % 4 === 0 ? CARCOL[s] : undefined, pose: (['stand', 'point', 'camera', 'stand'] as const)[p % 4] });
      if (p >= 4) line(c, [[0.35, -1], [0.55, 0]], '#8a5a33', 0.03);
    }, { weight: 0.4 });

// 19. animals of the city: 16
const ANIM = ['Mouette', 'Pigeon', 'Chien', 'Chat', 'Otarie', 'Pélican', 'Corbeau', 'Écureuil'];
ANIM.forEach((name, t) => {
  for (const v of [0, 1])
    add(`animal.${t}.${v}`, `${name} ${v + 1}`, 'animal', 1.4, 1, (c) => {
      const col = [['#f2f2f2', '#8a96a8'], ['#8a8a9a', '#5a5a6a'], ['#a8783e', '#1e1e24'], ['#e88a3a', '#3a3a40'], ['#5a4a3a', '#7a6a5a'], ['#e8e0c8', '#a8a090'], ['#1e1e24', '#2a2a30'], ['#8a6a4a', '#a8886a']][t][v];
      if (t === 2 || t === 3 || t === 7) {
        ell(c, 0, -0.35, 0.35, 0.18, col, 0.025);
        ell(c, 0.35, -0.5, 0.14, 0.12, col, 0.02);
        for (const x of [-0.22, 0.22]) line(c, [[x, -0.25], [x, 0]], col, 0.06);
      } else if (t === 4) {
        ell(c, 0, -0.3, 0.6, 0.25, col, 0.03);
        ell(c, 0.55, -0.55, 0.16, 0.14, col, 0.02);
      } else {
        ell(c, 0, -0.25, 0.22, 0.13, col, 0.02);
        ell(c, 0.2, -0.38, 0.09, 0.08, col, 0.015);
        poly(c, [[0.28, -0.38], [0.42, -0.36], [0.28, -0.34]], '#ffb030', 0.01);
      }
    }, { weight: 0.3 });
});

// 20. parked bicycles: 10 × 3 = 30
for (let k = 0; k < 10; k++)
  for (let v = 0; v < 3; v++)
    add(`bike.${k}.${v}`, `Vélo garé ${k * 3 + v + 1}`, 'ground', 2, 1.2, (c) => {
      for (const x of [-0.5, 0.5]) ell(c, x, -0.35, 0.34, 0.34, 'rgba(0,0,0,0)', 0.04, '#2a2a30');
      line(c, [[-0.5, -0.35], [-0.1, -0.75], [0.35, -0.75], [0.5, -0.35]], FCOL[k], 0.05);
      line(c, [[-0.1, -0.75], [0, -0.35], [-0.5, -0.35]], FCOL[k], 0.04);
      if (v === 1) rect(c, 0.3, -0.95, 0.35, 0.22, '#8a5a33', 0.02);
      if (v === 2) ell(c, -0.55, -0.95, 0.18, 0.12, '#d8c890', 0.02);
    }, { weight: 0.4 });

void poly;
export const SF_ASSETS = out;
