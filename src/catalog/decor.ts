import { Rng } from '../core/math';
import { INK } from '../render/palette';
import { house, rockShape, trunk } from './nature';
import { crown, Ctx, ell, label, line, poly, Pt, rect, rngFor, shade, sideGrad, sprite } from './paint';
import type { AssetDef, AssetGroup, Slot } from './types';

/**
 * v2.8: 2000 decoration assets, 500 per world (Alpes, Grande Forêt, Canyon, Désert), to dress
 * the randomly built levels: trees and bushes of the local species, ground plants, houses and
 * outbuildings in the local style, fences, street/yard furniture and rocks. Every entry is a
 * distinct combination (species × size × colours × shape).
 */

type World = 'alpes' | 'foret' | 'canyon' | 'desert';
const out: AssetDef[] = [];

function add(world: World, id: string, name: string, slot: Slot, w: number, h: number, draw: (c: Ctx, r: Rng) => void, weight = 1): void {
  const full = `d.${world}.${id}`;
  out.push({ id: full, name, group: world as AssetGroup, slot, weight, draw: () => sprite(w, h, (c) => draw(c, rngFor(full))) });
}

interface Pal {
  treeA: { name: string; kind: 'spruce' | 'larch' | 'oak' | 'beech' | 'juniper' | 'cotton' | 'palm' | 'acacia' };
  treeB: { name: string; kind: 'spruce' | 'larch' | 'oak' | 'beech' | 'juniper' | 'cotton' | 'palm' | 'acacia' };
  leaf: string[][]; // 4 colourways × shades
  bushCols: string[];
  plants: string[];
  plantCols: string[];
  houseStyle: string[];
  walls: string[];
  roofs: string[];
  sheds: string[];
  fences: string[];
  fenceCols: string[];
  furniture: string[];
  furnCols: string[];
  stones: string[];
}

const PAL: Record<World, Pal> = {
  alpes: {
    treeA: { name: 'Épicéa', kind: 'spruce' },
    treeB: { name: 'Mélèze', kind: 'larch' },
    leaf: [['#2f6e3a', '#1d5232'], ['#3f7a52', '#2a5a3a'], ['#6a9a3a', '#4a7a2a'], ['#d9a02a', '#a8781a']],
    bushCols: ['#3f7a3a', '#5a8a3a', '#2f6a4a', '#7a9a4a', '#a8603a'],
    plants: ['Gentiane', 'Edelweiss', 'Touffe d’herbe', 'Myrtilles', 'Chardon', 'Fougère', 'Arnica', 'Crocus'],
    plantCols: ['#2a5ad8', '#f2efe6', '#d84a8a', '#ffd21f', '#8a4ad8'],
    houseStyle: ['Chalet', 'Ferme alpine', 'Mazot', 'Maison de pierre'],
    walls: ['#a86a3a', '#8a5a33', '#e6dcc6', '#b8b0a4'],
    roofs: ['#4a4a50', '#6a4a30', '#8a3a2a'],
    sheds: ['Grange', 'Remise', 'Clocher'],
    fences: ['Barrière en bois', 'Clôture à vaches', 'Muret de pierre', 'Palissade', 'Clôture tressée'],
    fenceCols: ['#8a5a33', '#a8733e', '#b8b0a4', '#6a4a30'],
    furniture: ['Bidon de lait', 'Tas de bois', 'Banc', 'Poteau indicateur', 'Ruche', 'Abreuvoir', 'Boîte aux lettres', 'Jardinière', 'Cloche de vache', 'Charrette', 'Porte-skis', 'Fontaine'],
    furnCols: ['#c8ccd4', '#8a5a33', '#d8261f', '#2f6e3a', '#ffd21f'],
    stones: ['#9a9ca6', '#8e9098', '#a6a4a0'],
  },
  foret: {
    treeA: { name: 'Chêne', kind: 'oak' },
    treeB: { name: 'Hêtre', kind: 'beech' },
    leaf: [['#4f9a3c', '#3a7a2c'], ['#3a7a3a', '#2a5a2a'], ['#d99a2a', '#a8681a'], ['#c8502a', '#983a1a']],
    bushCols: ['#3f8a3a', '#5aa83f', '#2f6e3a', '#7a9a3a', '#c8783a'],
    plants: ['Champignons', 'Fougère', 'Muguet', 'Jacinthes', 'Mousse', 'Ronces', 'Lierre', 'Violettes'],
    plantCols: ['#d8261f', '#f2efe6', '#5a6ad8', '#ffd21f', '#a84ad8'],
    houseStyle: ['Cabane', 'Maison forestière', 'Moulin', 'Chaumière'],
    walls: ['#8a5a33', '#a8733e', '#e6dcc6', '#9a9a8a'],
    roofs: ['#4a5a3a', '#6a4a30', '#c8a050'],
    sheds: ['Abri à bois', 'Cabanon', 'Tour de guet'],
    fences: ['Clôture de branches', 'Barrière rustique', 'Haie basse', 'Muret moussu', 'Ganivelle'],
    fenceCols: ['#6a4a30', '#8a5a33', '#4f7a3a', '#7a7a6a'],
    furniture: ['Nichoir', 'Souche-tabouret', 'Lanterne', 'Brouette', 'Panneau du sentier', 'Totem sculpté', 'Banc rustique', 'Tas de bûches', 'Seau', 'Hache plantée', 'Mangeoire', 'Puits'],
    furnCols: ['#8a5a33', '#a8733e', '#d8261f', '#2f6e3a', '#ffd21f'],
    stones: ['#7e8088', '#86827a', '#76786e'],
  },
  canyon: {
    treeA: { name: 'Genévrier', kind: 'juniper' },
    treeB: { name: 'Peuplier deltoïde', kind: 'cotton' },
    leaf: [['#6a7a3a', '#4a5a2a'], ['#7a8a4a', '#5a6a3a'], ['#8a9a4a', '#6a7a3a'], ['#d8b03a', '#a8801a']],
    bushCols: ['#8a8a4a', '#9a9a5a', '#6a7a3a', '#a8a060', '#b8784a'],
    plants: ['Sauge', 'Yucca nain', 'Herbe sèche', 'Pavot', 'Figuier de Barbarie', 'Agave', 'Fleurs sauvages', 'Cactus boule'],
    plantCols: ['#ff7a2a', '#f2d22a', '#d84ad8', '#f2efe6', '#d8261f'],
    houseStyle: ['Ranch', 'Maison en adobe', 'Cabane de mineur', 'Relais de diligence'],
    walls: ['#c8925a', '#d9a870', '#a8733e', '#e6d2b0'],
    roofs: ['#6a4026', '#8a3a2a', '#5a5a5e'],
    sheds: ['Grange rouge', 'Éolienne de pompage', 'Château d’eau'],
    fences: ['Clôture de ranch', 'Barbelés', 'Corral', 'Muret d’adobe', 'Palissade'],
    fenceCols: ['#8a5a33', '#6a4026', '#c8925a', '#9a8270'],
    furniture: ['Roue de chariot', 'Tonneau', 'Crâne de vache', 'Poteau indicateur', 'Boîte aux lettres', 'Abreuvoir', 'Selle sur barrière', 'Lanterne', 'Pompe à eau', 'Caisse de dynamite', 'Totem', 'Wagonnet'],
    furnCols: ['#8a5a33', '#c8925a', '#d8261f', '#2a5ad8', '#e6d2b0'],
    stones: ['#c8643a', '#b8583a', '#d07a4a'],
  },
  desert: {
    treeA: { name: 'Palmier dattier', kind: 'palm' },
    treeB: { name: 'Acacia', kind: 'acacia' },
    leaf: [['#3f8a3a', '#2a6a2a'], ['#5a8a3a', '#3a6a2a'], ['#7a9a42', '#5a7a32'], ['#8a9a4a', '#6a7a3a']],
    bushCols: ['#8a9a4a', '#a8a85a', '#7a8a3a', '#b8b060', '#9a7a4a'],
    plants: ['Touffe saharienne', 'Coloquinte', 'Rose des sables', 'Euphorbe', 'Herbe à chameau', 'Lys du désert', 'Cactus colonne', 'Aloès'],
    plantCols: ['#d84a4a', '#f2d22a', '#ff8a2a', '#f2efe6', '#d84ad8'],
    houseStyle: ['Maison en terre', 'Tente nomade', 'Ksar', 'Maison à coupole'],
    walls: ['#d9a870', '#c8925a', '#e0bc8a', '#f2e6d0'],
    roofs: ['#8a5a33', '#a8582a', '#d8261f'],
    sheds: ['Grenier fortifié', 'Abri en palmes', 'Minaret'],
    fences: ['Palissade de palmes', 'Muret de terre', 'Haie d’épineux', 'Clôture de corde', 'Muret de pierres'],
    fenceCols: ['#a8a05a', '#c8925a', '#8a7a4a', '#d9a870'],
    furniture: ['Jarre', 'Puits', 'Tapis suspendu', 'Lanterne', 'Selle de dromadaire', 'Caisse de dattes', 'Plateau de thé', 'Poterie', 'Panneau de piste', 'Bidon d’eau', 'Pneu de 4x4', 'Brasero'],
    furnCols: ['#c86a3a', '#d9a870', '#a8282a', '#2a4a8a', '#f2d22a'],
    stones: ['#d9a870', '#c8925a', '#e0b880'],
  },
};

// ------------------------------------------------------------------ painters

function tree(c: Ctx, r: Rng, kind: Pal['treeA']['kind'], H: number, cols: string[], v: number): void {
  const [lc, dc] = cols;
  switch (kind) {
    case 'spruce':
    case 'larch': {
      line(c, [[0, 0], [0, -H]], '#5e3a22', 0.12 + H * 0.02);
      const tiers = 5 + v;
      for (let k = 0; k < tiers; k++) {
        const t = k / tiers;
        const w = (H * (kind === 'spruce' ? 0.32 : 0.26)) * (1 - t * 0.85) * (1 + v * 0.06);
        const y = -H * (0.18 + t * 0.78);
        poly(c, [[0, y - H * 0.2], [-w, y + H * 0.02], [w, y + H * 0.02]], k % 2 ? lc : dc, 0.035);
      }
      break;
    }
    case 'oak':
    case 'beech':
    case 'cotton': {
      trunk(c, H * 0.55, 0.15 + H * 0.025, kind === 'beech' ? '#8a8a80' : '#6e4326', r.range(-0.1, 0.1));
      const rx = H * (kind === 'oak' ? 0.42 : kind === 'cotton' ? 0.32 : 0.36) * (1 + v * 0.08);
      crown(c, r, 0, -H * 0.68, rx, H * 0.34, lc, 8 + v * 2);
      for (let k = 0; k < 4; k++) ell(c, r.range(-rx * 0.6, rx * 0.6), -H * r.range(0.55, 0.85), rx * 0.25, H * 0.08, shade(dc, 0.05), 0, null);
      break;
    }
    case 'juniper': {
      trunk(c, H * 0.4, 0.12 + H * 0.02, '#7a5a40', r.range(-0.3, 0.3));
      for (let k = 0; k < 3 + v; k++) crown(c, r, r.range(-H * 0.2, H * 0.2), -H * r.range(0.45, 0.9), H * 0.2, H * 0.15, k % 2 ? lc : dc, 5);
      break;
    }
    case 'palm': {
      const lean = (v - 1) * 0.12 * H;
      c.beginPath();
      c.moveTo(-0.15, 0);
      c.quadraticCurveTo(lean * 0.3, -H * 0.5, lean, -H);
      c.lineTo(lean + 0.12, -H);
      c.quadraticCurveTo(lean * 0.3 + 0.2, -H * 0.5, 0.15, 0);
      c.closePath();
      c.fillStyle = '#a8784e';
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.04;
      c.stroke();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const ex = lean + Math.cos(a) * H * 0.3;
        const ey = -H + Math.sin(a) * H * 0.1 + H * 0.06;
        c.beginPath();
        c.moveTo(lean, -H);
        c.quadraticCurveTo((lean + ex) / 2, -H - H * 0.08, ex, ey);
        c.strokeStyle = INK;
        c.lineWidth = 0.18;
        c.stroke();
        c.strokeStyle = k % 2 ? lc : dc;
        c.lineWidth = 0.13;
        c.stroke();
      }
      break;
    }
    case 'acacia': {
      line(c, [[0, 0], [0.05, -H * 0.6], [-H * 0.15, -H * 0.8]], '#6a5040', 0.15 + H * 0.02);
      line(c, [[0.05, -H * 0.6], [H * 0.18, -H * 0.82]], '#6a5040', 0.12 + H * 0.015);
      c.beginPath();
      c.ellipse(0, -H * 0.86, H * (0.45 + v * 0.05), H * 0.1, 0, 0, Math.PI * 2);
      c.fillStyle = lc;
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.05;
      c.stroke();
      break;
    }
  }
}

function bush(c: Ctx, r: Rng, form: number, s: number, col: string): void {
  switch (form) {
    case 0:
      crown(c, r, 0, -s * 0.45, s * 0.6, s * 0.45, col, 7);
      break;
    case 1:
      for (let k = 0; k < 14; k++) {
        const a = -Math.PI / 2 + (k / 13 - 0.5) * 2.4;
        line(c, [[0, 0], [Math.cos(a) * s, Math.sin(a) * s]], col, 0.05, false);
      }
      break;
    case 2:
      crown(c, r, 0, -s * 0.4, s * 0.55, s * 0.4, col, 6);
      for (let k = 0; k < 10; k++) ell(c, r.range(-s * 0.45, s * 0.45), -r.range(s * 0.2, s * 0.75), 0.05, 0.05, r.pick(['#f2efe6', '#e84a8a', '#ffd21f']), 0.01);
      break;
    default:
      for (let k = 0; k < 3; k++) crown(c, r, (k - 1) * s * 0.45, -s * 0.3, s * 0.35, s * 0.3, shade(col, (k - 1) * 0.1), 5);
  }
}

function plant(c: Ctx, r: Rng, k: number, col: string): void {
  if (k % 4 === 0) {
    for (let q = 0; q < 9; q++) {
      const x = r.range(-0.3, 0.3);
      const h = r.range(0.2, 0.5);
      line(c, [[x, 0], [x, -h]], '#5a8a3a', 0.02, false);
      ell(c, x, -h, 0.05, 0.04, col, 0.01);
    }
  } else if (k % 4 === 1) {
    for (let q = 0; q < 12; q++) {
      const x = r.range(-0.3, 0.3);
      line(c, [[x, 0], [x + r.range(-0.2, 0.2), -r.range(0.2, 0.5)]], shade('#6a9a3a', r.range(-0.2, 0.2)), 0.025, false);
    }
  } else if (k % 4 === 2) {
    for (let q = 0; q < 3; q++) {
      const x = (q - 1) * 0.18;
      rect(c, x - 0.02, -0.15, 0.04, 0.15, '#f2efe6', 0.01);
      c.beginPath();
      c.ellipse(x, -0.15, 0.09, 0.06, 0, Math.PI, 0);
      c.fillStyle = col;
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.015;
      c.stroke();
    }
  } else {
    for (let q = 0; q < 7; q++) {
      const a = -Math.PI / 2 + (q / 6 - 0.5) * 2.2;
      poly(c, [[0, 0], [Math.cos(a - 0.12) * 0.45, Math.sin(a - 0.12) * 0.45], [Math.cos(a) * 0.55, Math.sin(a) * 0.55]], q % 2 ? '#6a8a4a' : '#5a7a3a', 0.015);
    }
    ell(c, 0, -0.5, 0.05, 0.05, col, 0.01);
  }
}

function building(c: Ctx, r: Rng, style: number, W: number, H: number, wall: string, roof: string, world: World): void {
  if (world === 'desert' && style === 1) {
    // nomad tent
    poly(c, [[-W / 2, 0], [-W * 0.35, -H * 0.6], [0, -H], [W * 0.35, -H * 0.6], [W / 2, 0]], sideGrad(c, -W / 2, W / 2, roof), 0.05);
    for (let k = 0; k < 4; k++) line(c, [[-W / 2 + (k * W) / 3, 0], [-W * 0.3 + (k * W * 0.2), -H * 0.7]], shade(roof, -0.2), 0.03, false);
    rect(c, -W * 0.12, -H * 0.45, W * 0.24, H * 0.45, '#2a1a10', 0.03);
    return;
  }
  if (world === 'desert' && style === 3) {
    rect(c, -W / 2, -H * 0.6, W, H * 0.6, sideGrad(c, -W / 2, W / 2, wall), 0.05);
    c.beginPath();
    c.ellipse(0, -H * 0.6, W * 0.32, H * 0.38, 0, Math.PI, 0);
    c.fillStyle = sideGrad(c, -W * 0.32, W * 0.32, shade(wall, 0.1));
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 0.05;
    c.stroke();
    rect(c, -W * 0.1, -H * 0.38, W * 0.2, H * 0.38, '#3a2a20', 0.03, W * 0.1);
    return;
  }
  if (world === 'canyon' || world === 'desert') {
    // flat roof adobe / ranch
    rect(c, -W / 2, -H * 0.75, W, H * 0.75, sideGrad(c, -W / 2, W / 2, wall), 0.05, 0.08);
    if (style === 0 || style === 3) poly(c, [[-W / 2 - 0.3, -H * 0.72], [0, -H], [W / 2 + 0.3, -H * 0.72]], roof, 0.05);
    else for (let k = 0; k < 5; k++) ell(c, -W / 2 + 0.3 + (k * (W - 0.6)) / 4, -H * 0.68, 0.08, 0.08, '#6a4026', 0.02);
    for (let k = 0; k < 2; k++) rect(c, -W * 0.35 + k * W * 0.45, -H * 0.55, W * 0.16, H * 0.2, '#3a2a20', 0.03);
    rect(c, -W * 0.08, -H * 0.45, W * 0.16, H * 0.45, shade(roof, -0.2), 0.03);
    if (style === 2) rect(c, -W / 2 - 0.2, -H * 0.4, W + 0.4, 0.12, '#8a5a33', 0.02);
    void r;
    return;
  }
  house(c, W, H * 0.62, wall, roof, ['#d8261f', '#2f6e3a', '#2a5ad8', '#f2efe6'][style], style === 0 || style === 2);
  if (style === 3) for (let k = 0; k < 10; k++) ell(c, r.range(-W / 2, W / 2), -r.range(0.2, H * 0.55), 0.18, 0.1, shade('#9a978e', r.range(-0.15, 0.1)), 0.015);
  if (style === 2) rect(c, W * 0.2, -H * 0.95, 0.35, 0.6, '#6a6a6a', 0.03);
}

function outbuilding(c: Ctx, r: Rng, type: number, W: number, H: number, wall: string, roof: string): void {
  if (type === 2) {
    // tall structure: bell tower / windpump / water tower / watchtower / minaret
    rect(c, -W * 0.2, -H * 0.8, W * 0.4, H * 0.8, sideGrad(c, -W * 0.2, W * 0.2, wall), 0.05);
    poly(c, [[-W * 0.3, -H * 0.8], [0, -H], [W * 0.3, -H * 0.8]], roof, 0.05);
    rect(c, -W * 0.08, -H * 0.72, W * 0.16, H * 0.1, '#2a2420', 0.02);
    return;
  }
  rect(c, -W / 2, -H * 0.6, W, H * 0.6, sideGrad(c, -W / 2, W / 2, wall), 0.05);
  poly(c, [[-W / 2 - 0.25, -H * 0.6], [0, -H], [W / 2 + 0.25, -H * 0.6]], roof, 0.05);
  if (type === 0) {
    rect(c, -W * 0.2, -H * 0.5, W * 0.4, H * 0.5, shade(wall, -0.3), 0.03);
    line(c, [[-W * 0.2, -H * 0.5], [W * 0.2, 0]], '#f2efe6', 0.04, false);
    line(c, [[W * 0.2, -H * 0.5], [-W * 0.2, 0]], '#f2efe6', 0.04, false);
  } else {
    for (let k = 0; k < 4; k++) for (let j = 0; j < 3; j++) ell(c, -W * 0.35 + k * W * 0.23, -0.2 - j * 0.35, 0.16, 0.15, '#d6a670', 0.015);
  }
  void r;
}

function fence(c: Ctx, r: Rng, type: number, L: number, col: string): void {
  const posts = Math.max(2, Math.round(L / 1.4) + 1);
  if (type === 2 || type === 3) {
    // low wall of stones / adobe
    for (let x = -L / 2; x < L / 2; x += 0.35) for (let j = 0; j < 2; j++) ell(c, x + (j % 2) * 0.15, -0.15 - j * 0.25, 0.2, 0.14, shade(col, r.range(-0.15, 0.1)), 0.02);
    return;
  }
  for (let k = 0; k < posts; k++) {
    const x = -L / 2 + (k * L) / (posts - 1);
    rect(c, x - 0.05, -1.05, 0.1, 1.05, col, 0.02);
  }
  if (type === 4) {
    for (let x = -L / 2; x < L / 2; x += 0.12) line(c, [[x, 0], [x, -0.9 - (Math.floor(x * 8) % 2) * 0.05]], shade(col, 0.1), 0.04, false);
  } else {
    for (const y of type === 1 ? [-0.75, -0.45] : [-0.85, -0.5, -0.2]) line(c, [[-L / 2, y], [L / 2, y]], type === 1 ? '#9a9aa2' : shade(col, 0.1), type === 1 ? 0.02 : 0.07, type !== 1);
  }
}

function furniture(c: Ctx, r: Rng, type: number, col: string, v: number): void {
  switch (type % 12) {
    case 0: // can / jar / barrel-like round object
      rect(c, -0.2, -0.6, 0.4, 0.6, sideGrad(c, -0.2, 0.2, col), 0.03, 0.12);
      rect(c, -0.12, -0.72, 0.24, 0.12, shade(col, -0.2), 0.02);
      break;
    case 1: // pile of wood / logs
      for (let j = 0; j < 3 + v; j++) for (let k = 0; k < 5; k++) ell(c, -0.6 + k * 0.3, -0.14 - j * 0.26, 0.14, 0.13, '#d6a670', 0.02);
      break;
    case 2: // bench
      rect(c, -0.8, -0.45, 1.6, 0.08, col, 0.025);
      rect(c, -0.8, -0.85, 1.6, 0.08, col, 0.025);
      for (const x of [-0.65, 0.65]) line(c, [[x, -0.85], [x, 0]], '#4a4a50', 0.05);
      break;
    case 3: // sign post
      line(c, [[0, 0], [0, -1.8]], '#7a4a2a', 0.07);
      for (let k = 0; k < 2 + (v % 2); k++) poly(c, [[-0.1, -1.7 + k * 0.32], [0.65, -1.7 + k * 0.32], [0.78, -1.58 + k * 0.32], [0.65, -1.46 + k * 0.32], [-0.1, -1.46 + k * 0.32]], k % 2 ? col : shade(col, 0.2), 0.02);
      break;
    case 4: // box-like object (hive, crate, mailbox)
      rect(c, -0.3, -0.75, 0.6, 0.55, sideGrad(c, -0.3, 0.3, col), 0.03, 0.04);
      line(c, [[0, -0.2], [0, 0]], '#5a5a5e', 0.06);
      poly(c, [[-0.36, -0.75], [0, -0.92], [0.36, -0.75]], shade(col, -0.25), 0.025);
      break;
    case 5: // trough / tray
      poly(c, [[-0.7, -0.5], [-0.6, 0], [0.6, 0], [0.7, -0.5]], sideGrad(c, -0.7, 0.7, col), 0.03);
      rect(c, -0.65, -0.5, 1.3, 0.06, 'rgba(90,170,230,0.8)', 0.01);
      break;
    case 6: // lantern / lamp
      line(c, [[0, 0], [0, -1.6]], '#3a3a40', 0.05);
      rect(c, -0.1, -1.85, 0.2, 0.26, '#ffe08a', 0.025);
      poly(c, [[-0.14, -1.85], [0, -1.98], [0.14, -1.85]], '#3a3a40', 0.02);
      break;
    case 7: // planter / pot with flowers
      poly(c, [[-0.35, -0.4], [-0.25, 0], [0.25, 0], [0.35, -0.4]], sideGrad(c, -0.35, 0.35, col), 0.025);
      for (let k = 0; k < 6; k++) ell(c, r.range(-0.3, 0.3), -0.45 - r.range(0, 0.15), 0.07, 0.06, r.pick(['#d8261f', '#ffd21f', '#e84a8a', '#f2efe6']), 0.01);
      break;
    case 8: // small hanging object on a post (bell, lamp, saddle)
      line(c, [[-0.4, 0], [-0.4, -1.2], [0.4, -1.2], [0.4, 0]], '#7a4a2a', 0.06);
      ell(c, 0, -0.9, 0.15, 0.18, col, 0.02);
      break;
    case 9: // cart / wheel
      ell(c, 0, -0.45, 0.45, 0.45, 'rgba(0,0,0,0)', 0.06, '#5a3a22');
      for (let k = 0; k < 8; k++) line(c, [[0, -0.45], [Math.cos(k * 0.785) * 0.42, -0.45 + Math.sin(k * 0.785) * 0.42]], '#7a4a2a', 0.03, false);
      if (v % 2) rect(c, 0.2, -0.9, 1, 0.45, col, 0.03);
      break;
    case 10: // rack / totem
      rect(c, -0.15, -1.6, 0.3, 1.6, sideGrad(c, -0.15, 0.15, col), 0.03);
      for (let k = 0; k < 3; k++) ell(c, 0, -0.4 - k * 0.45, 0.12, 0.08, shade(col, k % 2 ? 0.3 : -0.3), 0.015);
      break;
    default: // well / fountain
      rect(c, -0.45, -0.6, 0.9, 0.6, '#9a978e', 0.03, 0.1);
      line(c, [[-0.4, -0.6], [-0.4, -1.4], [0.4, -1.4], [0.4, -0.6]], '#7a4a2a', 0.06);
      poly(c, [[-0.55, -1.4], [0, -1.7], [0.55, -1.4]], col, 0.025);
  }
}

// ------------------------------------------------------------------ catalogue

for (const world of ['alpes', 'foret', 'canyon', 'desert'] as World[]) {
  const P = PAL[world];
  // trees 2 species × 5 sizes × 4 colourways × 3 shapes = 120
  for (const [si, sp] of [P.treeA, P.treeB].entries())
    for (let z = 0; z < 5; z++)
      for (let cw = 0; cw < 4; cw++)
        for (let v = 0; v < 3; v++) {
          const H = (sp.kind === 'palm' ? 4 : sp.kind === 'juniper' ? 2.2 : 3) + z * (sp.kind === 'juniper' ? 0.5 : 1.1);
          const W = sp.kind === 'acacia' ? H * 1.1 : sp.kind === 'palm' ? H * 0.75 : H * 0.8;
          add(world, `tree.${si}.${z}.${cw}.${v}`, `${sp.name} ${['jeune', 'petit', 'moyen', 'grand', 'vénérable'][z]}${cw === 3 ? ' d’automne' : ''}`, 'tree', W, H + 0.4, (c, r) => tree(c, r, sp.kind, H, P.leaf[cw], v), 0.6);
        }
  // bushes 4 forms × 3 sizes × 5 colours = 60
  for (let f = 0; f < 4; f++)
    for (let z = 0; z < 3; z++)
      for (let k = 0; k < 5; k++) {
        const S = 0.7 + z * 0.35;
        add(world, `bush.${f}.${z}.${k}`, `${['Buisson rond', 'Touffe raide', 'Buisson fleuri', 'Massif'][f]} ${z + 1}`, 'bush', S * 1.8, S * 1.2, (c, r) => bush(c, r, f, S, P.bushCols[k]));
      }
  // ground plants 8 × 5 = 40
  P.plants.forEach((name, k) => {
    for (let q = 0; q < 5; q++) add(world, `plant.${k}.${q}`, `${name} ${q + 1}`, 'ground', 0.9, 0.7, (c, r) => plant(c, r, k, P.plantCols[q]));
  });
  // houses 4 styles × 4 walls × 3 roofs × 2 sizes = 96
  for (let st = 0; st < 4; st++)
    for (let wi = 0; wi < 4; wi++)
      for (let ri = 0; ri < 3; ri++)
        for (const big of [0, 1]) {
          const W = 5 + big * 2.2;
          const H = 4.2 + big * 1.5;
          add(world, `house.${st}.${wi}.${ri}.${big}`, `${P.houseStyle[st]}${big ? ' (grand)' : ''} ${wi * 3 + ri + 1}`, 'structure', W + 1, H + 0.6, (c, r) => building(c, r, st, W, H, P.walls[wi], P.roofs[ri], world), 0.5);
        }
  // outbuildings 3 × 4 × 3 = 36
  for (let t = 0; t < 3; t++)
    for (let wi = 0; wi < 4; wi++)
      for (let ri = 0; ri < 3; ri++) {
        const W = t === 2 ? 3 : 4.4;
        const H = t === 2 ? 7 : 3.8;
        add(world, `shed.${t}.${wi}.${ri}`, `${P.sheds[t]} ${wi * 3 + ri + 1}`, 'structure', W + 0.8, H + 0.4, (c, r) => outbuilding(c, r, t, W, H, P.walls[wi], P.roofs[ri]), 0.4);
      }
  // fences 5 types × 4 colours × 2 lengths = 40
  for (let t = 0; t < 5; t++)
    for (let k = 0; k < 4; k++)
      for (const L of [2.8, 4.2]) add(world, `fence.${t}.${k}.${L}`, `${P.fences[t]} ${L > 3 ? 'longue' : 'courte'}`, 'ground', L + 0.4, 1.3, (c, r) => fence(c, r, t, L, P.fenceCols[k]), 0.8);
  // furniture 12 types × 5 colours = 60
  P.furniture.forEach((name, t) => {
    for (let k = 0; k < 5; k++) add(world, `furn.${t}.${k}`, `${name} ${k + 1}`, 'ground', 2, 2.1, (c, r) => furniture(c, r, t, P.furnCols[k], k), 0.7);
  });
  // rocks 4 shapes × 4 sizes × 3 colours = 48
  for (let sh = 0; sh < 4; sh++)
    for (let z = 0; z < 4; z++)
      for (let k = 0; k < 3; k++) {
        const W = 0.6 + z * 0.5 + sh * 0.2;
        const H = (0.3 + z * 0.3) * [1, 0.6, 1.4, 0.8][sh];
        add(world, `rock.${sh}.${z}.${k}`, `${['Rocher', 'Pierre plate', 'Roche dressée', 'Galets'][sh]} ${z + 1}`, 'ground', W + 0.4, H + 0.3, (c, r) => {
          if (sh === 3) for (let q = 0; q < 6; q++) ell(c, r.range(-W / 2, W / 2), -r.range(0.05, H * 0.5), W * 0.12, H * 0.25, shade(P.stones[k], r.range(-0.15, 0.1)), 0.015);
          else rockShape(c, r, W, H, P.stones[k], world === 'foret' || world === 'alpes' ? (z % 2 ? '#5aa83f' : null) : null);
        });
      }
}

export const DECOR_ASSETS = out;
void label;
void (null as unknown as Pt);
