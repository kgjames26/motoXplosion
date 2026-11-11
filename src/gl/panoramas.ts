import * as THREE from 'three';
import { Rng } from '../core/math';

/**
 * v2.8: 60 painted panoramas (12 per world) that take turns behind the track while you ride.
 * Each one is painted procedurally on a canvas from a little "recipe": sky, sun, clouds and a
 * few layers of relief (alpine peaks, rounded hills, forest edges, mesas, dunes, sea, city
 * skyline…), with atmospheric perspective. Some are grand (sunsets, lakes mirroring the
 * mountains, many layers); others are plain or a bit clumsy on purpose (flat grey sky, a
 * quarry, pylons, a lonely hill) — like a real trip.
 */

export interface Backdrop {
  tex: THREE.Texture;
  aspect: number;
  horizon: number;
  sky: string;
  ground: string;
}

type Layer =
  | { kind: 'peaks' | 'hills' | 'forest' | 'mesa' | 'dunes' | 'city' | 'cliffs' | 'pines'; color: string; base: number; amp: number; rough?: number; snow?: boolean; seed: number }
  | { kind: 'water'; color: string; base: number; reflect: boolean; seed: number }
  | { kind: 'oddities'; what: 'pylons' | 'quarry' | 'wind' | 'antenna' | 'bridge' | 'tower'; color: string; base: number; seed: number };

export interface PanoSpec {
  id: string;
  name: string;
  grand: boolean;
  skyTop: string;
  skyBottom: string;
  sun?: { x: number; y: number; r: number; color: string; glow: string };
  clouds: number;
  cloudColor: string;
  layers: Layer[];
  ground: string;
}

// ------------------------------------------------------------------ recipes

const SKIES = {
  day: ['#2a78e4', '#cfe8ff'],
  deep: ['#1858c8', '#a8d4ff'],
  sunset: ['#3a2a7a', '#ffb070'],
  dawn: ['#6a7ad8', '#ffd8c0'],
  golden: ['#4a6ad0', '#ffe2a0'],
  grey: ['#8a929c', '#c8ccd0'],
  haze: ['#9ab8d8', '#efe6d0'],
  hot: ['#4a90e0', '#fff0c8'],
  dusk: ['#24184a', '#e8705a'],
  storm: ['#4a5260', '#9aa2aa'],
};

function mk(world: string, i: number, f: (r: Rng) => Omit<PanoSpec, 'id'>): PanoSpec {
  const r = new Rng(9000 + world.length * 131 + i * 977);
  return { id: `${world}.${i}`, ...f(r) };
}

const seed = (r: Rng) => r.int(1, 1e6);

function alpes(i: number): PanoSpec {
  return mk('alpes', i, (r) => {
    const grand = [0, 2, 3, 5, 7, 9, 10].includes(i);
    const sky = grand ? r.pick([SKIES.deep, SKIES.sunset, SKIES.golden, SKIES.dawn, SKIES.day]) : r.pick([SKIES.grey, SKIES.haze, SKIES.day]);
    const layers: Layer[] = [
      { kind: 'peaks', color: '#8a9ab8', base: 0.5, amp: 0.34 + r.range(0, 0.1), rough: 1.4, snow: true, seed: seed(r) },
      { kind: 'peaks', color: '#6a7a90', base: 0.56, amp: 0.22, rough: 1.1, snow: grand, seed: seed(r) },
    ];
    if (grand && i % 3 === 0) layers.push({ kind: 'water', color: '#4a8ac8', base: 0.66, reflect: true, seed: seed(r) });
    layers.push({ kind: 'pines', color: '#2f5a3a', base: 0.68, amp: 0.06, seed: seed(r) });
    layers.push({ kind: 'hills', color: '#5a8a3a', base: 0.74, amp: 0.05, seed: seed(r) });
    if (!grand) layers.splice(2, 0, { kind: 'oddities', what: r.pick(['pylons', 'antenna', 'quarry'] as const), color: '#5a5f6a', base: 0.6, seed: seed(r) });
    return {
      name: grand ? r.pick(['Grand glacier', 'Lac des cimes', 'Couchant sur les aiguilles', 'Aube alpine', 'Vallée des sommets', 'Massif blanc', 'Col doré']) : r.pick(['Vallée grise', 'Pylônes du col', 'Carrière', 'Brume du matin', 'Antenne du sommet']),
      grand,
      skyTop: sky[0],
      skyBottom: sky[1],
      sun: grand ? { x: r.range(0.2, 0.8), y: r.range(0.2, 0.45), r: 0.05, color: '#fff3c8', glow: 'rgba(255,200,120,0.45)' } : undefined,
      clouds: grand ? r.int(2, 6) : r.int(6, 12),
      cloudColor: grand ? '#ffffff' : '#d8dde4',
      layers,
      ground: '#5a8a3a',
    };
  });
}

function foret(i: number): PanoSpec {
  return mk('foret', i, (r) => {
    const grand = [1, 2, 4, 6, 8, 11].includes(i);
    const sky = grand ? r.pick([SKIES.golden, SKIES.sunset, SKIES.deep, SKIES.dawn]) : r.pick([SKIES.grey, SKIES.haze, SKIES.storm]);
    const layers: Layer[] = [
      { kind: 'hills', color: '#7a90a8', base: 0.5, amp: 0.14, seed: seed(r) },
      { kind: 'forest', color: '#4a6a5a', base: 0.56, amp: 0.1, seed: seed(r) },
    ];
    if (grand && i % 2 === 0) layers.push({ kind: 'water', color: '#5a8aa8', base: 0.64, reflect: true, seed: seed(r) });
    layers.push({ kind: 'forest', color: '#2f4a32', base: 0.66, amp: 0.08, seed: seed(r) });
    layers.push({ kind: 'pines', color: '#1f3a26', base: 0.72, amp: 0.1, seed: seed(r) });
    if (!grand) layers.splice(1, 0, { kind: 'oddities', what: r.pick(['wind', 'tower', 'pylons'] as const), color: '#d8dce4', base: 0.56, seed: seed(r) });
    return {
      name: grand ? r.pick(['Forêt dorée', 'Lac des sapins', 'Brumes d’automne', 'Canopée au couchant', 'Clairière', 'Grands chênes']) : r.pick(['Coupe rase', 'Éoliennes', 'Ciel d’orage', 'Château d’eau', 'Lignes électriques']),
      grand,
      skyTop: sky[0],
      skyBottom: sky[1],
      sun: grand ? { x: r.range(0.15, 0.85), y: r.range(0.3, 0.5), r: 0.045, color: '#fff0c0', glow: 'rgba(255,190,110,0.5)' } : undefined,
      clouds: grand ? r.int(1, 4) : r.int(8, 14),
      cloudColor: grand ? '#fff6e8' : '#b8bec6',
      layers,
      ground: '#3f6a32',
    };
  });
}

function canyon(i: number): PanoSpec {
  return mk('canyon', i, (r) => {
    const grand = [0, 1, 3, 5, 8, 10].includes(i);
    const sky = grand ? r.pick([SKIES.sunset, SKIES.golden, SKIES.deep, SKIES.dusk]) : r.pick([SKIES.haze, SKIES.hot, SKIES.grey]);
    const layers: Layer[] = [
      { kind: 'mesa', color: '#c89a8a', base: 0.5, amp: 0.16, seed: seed(r) },
      { kind: 'mesa', color: '#b8604a', base: 0.58, amp: 0.2, seed: seed(r) },
      { kind: 'cliffs', color: '#8a3a2a', base: 0.68, amp: 0.12, seed: seed(r) },
    ];
    if (grand && i % 4 === 1) layers.splice(2, 0, { kind: 'water', color: '#3a7aa8', base: 0.66, reflect: true, seed: seed(r) });
    if (!grand) layers.push({ kind: 'oddities', what: r.pick(['antenna', 'pylons', 'quarry'] as const), color: '#4a3a30', base: 0.66, seed: seed(r) });
    return {
      name: grand ? r.pick(['Grand canyon', 'Buttes au couchant', 'Lac du canyon', 'Falaises de feu', 'Arches rouges', 'Crépuscule']) : r.pick(['Plateau poussiéreux', 'Mine abandonnée', 'Antenne relais', 'Ciel blanc']),
      grand,
      skyTop: sky[0],
      skyBottom: sky[1],
      sun: grand ? { x: r.range(0.2, 0.8), y: r.range(0.3, 0.5), r: 0.05, color: '#fff0c0', glow: 'rgba(255,150,80,0.5)' } : undefined,
      clouds: grand ? r.int(0, 3) : r.int(3, 8),
      cloudColor: '#fff2e0',
      layers,
      ground: '#a8552f',
    };
  });
}

function desert(i: number): PanoSpec {
  return mk('desert', i, (r) => {
    const grand = [0, 2, 4, 7, 9, 11].includes(i);
    const sky = grand ? r.pick([SKIES.sunset, SKIES.golden, SKIES.dusk, SKIES.dawn]) : r.pick([SKIES.hot, SKIES.haze]);
    const layers: Layer[] = [
      { kind: 'mesa', color: '#d8b8a0', base: 0.52, amp: 0.08, seed: seed(r) },
      { kind: 'dunes', color: '#e8c08a', base: 0.6, amp: 0.1, seed: seed(r) },
      { kind: 'dunes', color: '#d8a060', base: 0.68, amp: 0.08, seed: seed(r) },
    ];
    if (grand && i % 3 === 1) layers.splice(1, 0, { kind: 'water', color: '#4aa8c8', base: 0.62, reflect: true, seed: seed(r) });
    if (!grand) layers.push({ kind: 'oddities', what: r.pick(['pylons', 'antenna', 'tower'] as const), color: '#6a5a4a', base: 0.64, seed: seed(r) });
    return {
      name: grand ? r.pick(['Mer de dunes', 'Oasis au loin', 'Coucher saharien', 'Crêtes dorées', 'Désert rose', 'Nuit qui tombe']) : r.pick(['Reg plat', 'Ligne haute tension', 'Château d’eau', 'Brume de chaleur']),
      grand,
      skyTop: sky[0],
      skyBottom: sky[1],
      sun: { x: r.range(0.2, 0.8), y: r.range(0.25, 0.48), r: grand ? 0.06 : 0.04, color: '#fffbe0', glow: grand ? 'rgba(255,170,90,0.55)' : 'rgba(255,240,200,0.4)' },
      clouds: grand ? r.int(0, 2) : r.int(0, 3),
      cloudColor: '#fff6ea',
      layers,
      ground: '#d8a060',
    };
  });
}

function sf(i: number): PanoSpec {
  return mk('sf', i, (r) => {
    const grand = [0, 1, 3, 6, 8, 10].includes(i);
    const sky = grand ? r.pick([SKIES.sunset, SKIES.golden, SKIES.deep, SKIES.dusk]) : r.pick([SKIES.grey, SKIES.haze, SKIES.storm]);
    const layers: Layer[] = [
      { kind: 'hills', color: '#8a9ab0', base: 0.52, amp: 0.1, seed: seed(r) },
      { kind: 'water', color: '#3a6a9a', base: 0.6, reflect: grand, seed: seed(r) },
    ];
    if (i % 2 === 0) layers.push({ kind: 'oddities', what: 'bridge', color: '#c8402a', base: 0.6, seed: seed(r) });
    layers.push({ kind: 'city', color: '#6a7488', base: 0.62, amp: 0.2, seed: seed(r) });
    layers.push({ kind: 'city', color: '#4a5266', base: 0.7, amp: 0.12, seed: seed(r) });
    if (!grand) layers.push({ kind: 'oddities', what: r.pick(['antenna', 'pylons', 'tower'] as const), color: '#3a3f4a', base: 0.7, seed: seed(r) });
    return {
      name: grand ? r.pick(['Baie au couchant', 'Pont rouge', 'Collines et gratte-ciel', 'Ville dorée', 'Lumières du soir', 'Grand port']) : r.pick(['Brouillard du matin', 'Docks', 'Antennes', 'Ciel bas']),
      grand,
      skyTop: sky[0],
      skyBottom: sky[1],
      sun: grand ? { x: r.range(0.2, 0.8), y: r.range(0.3, 0.5), r: 0.045, color: '#fff0d0', glow: 'rgba(255,160,100,0.5)' } : undefined,
      clouds: grand ? r.int(1, 4) : r.int(8, 14),
      cloudColor: grand ? '#ffe8d8' : '#c8ccd2',
      layers,
      ground: '#6a7a5a',
    };
  });
}

export const PANORAMAS: Record<string, PanoSpec[]> = {
  alpes: Array.from({ length: 12 }, (_, i) => alpes(i)),
  foret: Array.from({ length: 12 }, (_, i) => foret(i)),
  canyon: Array.from({ length: 12 }, (_, i) => canyon(i)),
  desert: Array.from({ length: 12 }, (_, i) => desert(i)),
  sf: Array.from({ length: 12 }, (_, i) => sf(i)),
};

// ------------------------------------------------------------------ painter

const W = 2048;
const H = 560;
const HORIZON = 0.62;

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Tileable 1-D noise (period = 1 in x). */
function tnoise(x: number, s: number, oct = 4): number {
  let v = 0;
  let a = 1;
  let f = 4;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    const p = f;
    const xi = Math.floor(x * p);
    const t = x * p - xi;
    const h = (n: number) => {
      const k = (((n % p) + p) % p) + s * 131 + o * 977;
      const z = Math.sin(k * 12.9898) * 43758.5453;
      return z - Math.floor(z);
    };
    const sm = t * t * (3 - 2 * t);
    v += (h(xi) * (1 - sm) + h(xi + 1) * sm) * a;
    norm += a;
    a *= 0.5;
    f *= 2;
  }
  return v / norm;
}

function ridge(c: CanvasRenderingContext2D, L: Extract<Layer, { amp: number }>, haze: number, sky: string): void {
  const top = (x: number): number => {
    const u = x / W;
    const n = tnoise(u, L.seed, 5);
    switch (L.kind) {
      case 'peaks':
        return L.base - L.amp * Math.pow(Math.abs(n * 2 - 1) * 0.3 + n, L.rough ?? 1.2) * 0.9;
      case 'mesa': {
        const m = tnoise(u, L.seed + 7, 2);
        return L.base - L.amp * (m > 0.5 ? 1 : m > 0.42 ? (m - 0.42) / 0.08 : 0.15 + n * 0.1);
      }
      case 'dunes':
        return L.base - L.amp * Math.pow(Math.abs(Math.sin(u * Math.PI * 7 + n * 3)), 0.6) * (0.6 + n * 0.4);
      case 'forest':
        return L.base - L.amp * (0.6 + n * 0.4) - Math.abs(Math.sin(x * 0.35)) * 0.012;
      case 'pines':
        return L.base - L.amp * (0.3 + n * 0.5) - (Math.abs(((x * 0.09) % 2) - 1) < 0.5 ? 0.02 : 0) * (0.5 + n);
      case 'cliffs':
        return L.base - L.amp * (n > 0.55 ? 1 : 0.4 + n * 0.3);
      case 'city': {
        const b = Math.floor(x / 34);
        const hh = tnoise(b / (W / 34), L.seed, 2);
        const tall = ((b * 7919) % 13) / 13;
        return L.base - L.amp * (0.25 + hh * 0.5 + (tall > 0.85 ? 0.5 : 0));
      }
      default:
        return L.base - L.amp * n;
    }
  };
  const col = mix(L.color, sky, haze);
  c.beginPath();
  c.moveTo(0, H);
  for (let x = 0; x <= W; x += 4) c.lineTo(x, top(x) * H);
  c.lineTo(W, H);
  c.closePath();
  const g = c.createLinearGradient(0, (L.base - L.amp) * H, 0, H);
  g.addColorStop(0, col);
  g.addColorStop(1, mix(L.color, '#000000', 0.25));
  c.fillStyle = g;
  c.fill();
  if (L.kind === 'peaks' && L.snow) {
    // snow caps above a line
    c.save();
    c.clip();
    c.beginPath();
    c.moveTo(0, 0);
    for (let x = 0; x <= W; x += 4) c.lineTo(x, (L.base - L.amp * 0.55 + tnoise(x / W, L.seed + 3, 3) * 0.04) * H);
    c.lineTo(W, 0);
    c.closePath();
    c.fillStyle = mix('#f4f8ff', sky, haze * 0.6);
    c.fill();
    c.restore();
  }
  if (L.kind === 'city') {
    // lit windows
    c.fillStyle = 'rgba(255,230,160,0.55)';
    for (let x = 4; x < W; x += 9) {
      const t = top(x);
      for (let y = t * H + 6; y < L.base * H; y += 10) if (tnoise(x / W + y / 5000, L.seed + 9, 1) > 0.62) c.fillRect(x, y, 3, 4);
    }
  }
  if (L.kind === 'pines' || L.kind === 'forest') {
    c.fillStyle = mix(L.color, '#000000', 0.2);
    for (let x = 0; x < W; x += L.kind === 'pines' ? 9 : 14) {
      const y = top(x) * H;
      c.beginPath();
      c.moveTo(x - 6, y + 8);
      c.lineTo(x, y - (L.kind === 'pines' ? 16 : 8));
      c.lineTo(x + 6, y + 8);
      c.fill();
    }
  }
}

function oddity(c: CanvasRenderingContext2D, L: Extract<Layer, { kind: 'oddities' }>, r: Rng): void {
  c.strokeStyle = L.color;
  c.fillStyle = L.color;
  const y0 = L.base * H;
  switch (L.what) {
    case 'pylons':
      for (let x = r.range(40, 200); x < W; x += r.range(260, 380)) {
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x - 10, y0);
        c.lineTo(x, y0 - 60);
        c.lineTo(x + 10, y0);
        c.moveTo(x - 14, y0 - 48);
        c.lineTo(x + 14, y0 - 48);
        c.stroke();
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x - 14, y0 - 48);
        c.quadraticCurveTo(x + 150, y0 - 30, x + 300, y0 - 48);
        c.stroke();
      }
      break;
    case 'wind':
      for (let x = r.range(60, 300); x < W; x += r.range(220, 420)) {
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x, y0);
        c.lineTo(x, y0 - 70);
        c.stroke();
        for (let k = 0; k < 3; k++) {
          const a = k * 2.094 + x;
          c.beginPath();
          c.moveTo(x, y0 - 70);
          c.lineTo(x + Math.cos(a) * 30, y0 - 70 + Math.sin(a) * 30);
          c.stroke();
        }
      }
      break;
    case 'antenna':
      for (let x = r.range(200, 700); x < W; x += r.range(700, 1100)) {
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x, y0 - 4);
        c.lineTo(x, y0 - 90);
        c.stroke();
        c.fillStyle = '#ff3a2a';
        c.fillRect(x - 2, y0 - 92, 4, 4);
        c.fillStyle = L.color;
      }
      break;
    case 'tower':
      for (let x = r.range(300, 800); x < W; x += r.range(800, 1200)) {
        c.fillRect(x - 3, y0 - 50, 6, 50);
        c.beginPath();
        c.ellipse(x, y0 - 56, 16, 12, 0, 0, Math.PI * 2);
        c.fill();
      }
      break;
    case 'quarry':
      for (let x = r.range(100, 600); x < W; x += r.range(900, 1300)) {
        c.fillStyle = '#b8b0a4';
        c.beginPath();
        c.moveTo(x, y0);
        c.lineTo(x + 30, y0 - 40);
        c.lineTo(x + 150, y0 - 44);
        c.lineTo(x + 190, y0);
        c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.25)';
        for (let k = 1; k < 4; k++) {
          c.beginPath();
          c.moveTo(x + 10 + k * 7, y0 - k * 10);
          c.lineTo(x + 180 - k * 7, y0 - k * 10);
          c.stroke();
        }
      }
      break;
    case 'bridge': {
      // a red suspension bridge across the bay
      const x0 = r.range(200, 700);
      const L2 = 700;
      c.lineWidth = 6;
      for (const tx of [x0 + 140, x0 + L2 - 140]) {
        c.beginPath();
        c.moveTo(tx, y0 + 4);
        c.lineTo(tx, y0 - 130);
        c.stroke();
      }
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(x0, y0 - 20);
      c.lineTo(x0 + L2, y0 - 20);
      c.stroke();
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x0, y0 - 24);
      c.quadraticCurveTo(x0 + 140, y0 - 140, x0 + 140, y0 - 128);
      c.quadraticCurveTo(x0 + L2 / 2, y0 - 10, x0 + L2 - 140, y0 - 128);
      c.quadraticCurveTo(x0 + L2 - 140, y0 - 140, x0 + L2, y0 - 24);
      c.stroke();
      c.lineWidth = 1;
      for (let x = x0 + 150; x < x0 + L2 - 150; x += 14) {
        const t = (x - x0 - 140) / (L2 - 280);
        const y = y0 - 128 + (1 - (2 * t - 1) ** 2) * 105;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y0 - 20);
        c.stroke();
      }
      break;
    }
  }
}

const cache = new Map<string, Backdrop>();

export function paintPanorama(spec: PanoSpec): Backdrop {
  const hit = cache.get(spec.id);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d')!;
  const r = new Rng(spec.id.length * 7 + spec.layers.length * 31 + spec.name.length);
  // sky
  const g = c.createLinearGradient(0, 0, 0, H * HORIZON);
  g.addColorStop(0, spec.skyTop);
  g.addColorStop(1, spec.skyBottom);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  if (spec.sun) {
    const sx = spec.sun.x * W;
    const sy = spec.sun.y * H;
    const glow = c.createRadialGradient(sx, sy, 0, sx, sy, H * 0.6);
    glow.addColorStop(0, spec.sun.glow);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, W, H);
    c.fillStyle = spec.sun.color;
    c.beginPath();
    c.arc(sx, sy, spec.sun.r * H, 0, Math.PI * 2);
    c.fill();
  }
  // clouds
  for (let k = 0; k < spec.clouds; k++) {
    const cx = r.range(0, W);
    const cy = r.range(0.06, 0.4) * H;
    const sc = r.range(0.6, 1.4) * (spec.grand ? 1 : 1.3);
    c.fillStyle = spec.cloudColor;
    c.globalAlpha = spec.grand ? 0.85 : 0.75;
    for (let b = 0; b < 6; b++) {
      for (const dx of [-W, 0, W]) {
        c.beginPath();
        c.ellipse(cx + dx + (b - 2.5) * 22 * sc, cy - Math.sin((b / 5) * Math.PI) * 14 * sc, 28 * sc, 16 * sc, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.globalAlpha = 1;
  }
  // relief layers, far to near (atmospheric perspective)
  const n = spec.layers.length;
  spec.layers.forEach((L, i) => {
    const haze = Math.max(0, 0.55 - (i / Math.max(1, n - 1)) * 0.55);
    if (L.kind === 'water') {
      const y = L.base * H;
      const wg = c.createLinearGradient(0, y, 0, H);
      wg.addColorStop(0, mix(L.color, spec.skyBottom, 0.35));
      wg.addColorStop(1, L.color);
      c.fillStyle = wg;
      c.fillRect(0, y, W, H - y);
      if (L.reflect) {
        // mirror what is painted just above the water line
        c.save();
        c.globalAlpha = 0.35;
        c.translate(0, y * 2);
        c.scale(1, -1);
        c.drawImage(cv, 0, y - H * 0.25, W, H * 0.25, 0, y - H * 0.25, W, H * 0.25);
        c.restore();
      }
      c.strokeStyle = 'rgba(255,255,255,0.25)';
      for (let k = 0; k < 60; k++) {
        const x = r.range(0, W);
        const yy = r.range(y + 4, H * 0.95);
        c.beginPath();
        c.moveTo(x, yy);
        c.lineTo(x + r.range(10, 40), yy);
        c.stroke();
      }
    } else if (L.kind === 'oddities') oddity(c, L, r);
    else ridge(c, L, haze, spec.skyBottom);
  });
  // make it tile: blend the last 160 px into the first ones
  const blend = 160;
  const strip = c.getImageData(0, 0, blend, H);
  const end = c.getImageData(W - blend, 0, blend, H);
  for (let x = 0; x < blend; x++) {
    const t = x / blend;
    for (let y = 0; y < H; y++) {
      const i = (y * blend + x) * 4;
      for (let k = 0; k < 3; k++) end.data[i + k] = end.data[i + k] * (1 - t) + strip.data[i + k] * t;
    }
  }
  c.putImageData(end, W - blend, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const b: Backdrop = { tex, aspect: W / H, horizon: HORIZON, sky: spec.skyTop, ground: spec.ground };
  cache.set(spec.id, b);
  // keep GPU memory bounded: only a handful painted at once
  if (cache.size > 6) {
    const first = cache.keys().next().value as string;
    cache.get(first)!.tex.dispose();
    cache.delete(first);
  }
  return b;
}

/** Which panorama shows at a given distance (changes every ~650 m, varies with the seed). */
export function panoramaAt(world: string, seed: number, x: number): PanoSpec | null {
  const list = PANORAMAS[world];
  if (!list) return null;
  const k = Math.floor(Math.max(0, x - 200) / 650);
  if (x < 200) return null; // the start keeps the world's main painting
  return list[(((seed >>> 3) + k * 5) % list.length + list.length) % list.length];
}
