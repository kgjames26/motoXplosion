import { Rng } from '../core/math';
import { Biome, PropKind } from '../world/types';
import { INK, PALETTES } from './palette';

/**
 * Pre-rendered cel-shaded sprites (trees, rocks, grass, pickups, clouds). Each sprite is drawn
 * once into an offscreen canvas in metre units, anchored at its bottom centre.
 */
export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Size in metres. */
  w: number;
  h: number;
  /** Anchor offset from the canvas top-left, in metres. */
  ax: number;
  ay: number;
}

const PPM = 72; // sprite resolution, pixels per metre

function make(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, ppm = PPM): Sprite {
  const pad = 0.15;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((w + pad * 2) * ppm);
  canvas.height = Math.ceil((h + pad * 2) * ppm);
  const c = canvas.getContext('2d')!;
  c.scale(ppm, ppm);
  c.translate(pad + w / 2, pad + h);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  draw(c);
  return { canvas, w: w + pad * 2, h: h + pad * 2, ax: pad + w / 2, ay: pad + h };
}

function outline(c: CanvasRenderingContext2D, width = 0.05): void {
  c.strokeStyle = INK;
  c.lineWidth = width;
  c.stroke();
}

// ------------------------------------------------------------------ trees

function pine(variant: number, dead = false): Sprite {
  const r = new Rng(100 + variant * 17 + (dead ? 999 : 0));
  const H = 7 + variant * 1.5;
  const W = 3.4 + variant * 0.45;
  return make(W, H, (c) => {
    // trunk
    const tg = c.createLinearGradient(-0.2, 0, 0.2, 0);
    tg.addColorStop(0, '#8a5a36');
    tg.addColorStop(1, '#4a2e1c');
    c.beginPath();
    c.moveTo(-0.2, 0);
    c.lineTo(-0.08, -H * 0.94);
    c.lineTo(0.08, -H * 0.94);
    c.lineTo(0.2, 0);
    c.closePath();
    c.fillStyle = tg;
    c.fill();
    c.strokeStyle = 'rgba(30,18,12,0.8)';
    c.lineWidth = 0.04;
    c.stroke();
    if (dead) {
      c.strokeStyle = '#5a3a24';
      c.lineWidth = 0.08;
      for (let i = 0; i < 9; i++) {
        const y = -H * (0.25 + i * 0.075);
        const len = (1 - i / 10) * W * 0.42;
        const sgn = i % 2 ? 1 : -1;
        c.beginPath();
        c.moveTo(0, y);
        c.quadraticCurveTo(sgn * len * 0.6, y - len * 0.1, sgn * len, y + len * 0.25);
        c.stroke();
      }
      return;
    }
    const greens = [
      ['#163d2c', '#21573a', '#3d8247', '#7db554'],
      ['#183f2a', '#255e37', '#46904b', '#8cc25a'],
      ['#143a2e', '#1e523d', '#357a4c', '#6fae5c'],
    ][variant % 3];
    const tiers = 13 + variant * 2;
    // painted drooping branch tiers, from the bottom up
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const y0 = -H * (0.14 + t * 0.82);
      const w = W * 0.5 * Math.pow(1 - t, 0.9) * r.range(0.85, 1.1) + 0.12;
      const droop = 0.35 + w * 0.25;
      const thick = H * 0.075 * (1 - t * 0.4);
      for (const side of [-1, 1]) {
        // branch silhouette
        c.beginPath();
        c.moveTo(0, y0 - thick);
        c.quadraticCurveTo(side * w * 0.6, y0 - thick * 0.6, side * w, y0 + droop);
        const teeth = 4;
        for (let k = teeth; k >= 0; k--) {
          const u = k / teeth;
          c.lineTo(side * w * u, y0 + droop * u + (k % 2 ? 0.16 : 0.02));
        }
        c.closePath();
        c.fillStyle = greens[0];
        c.fill();
        c.strokeStyle = 'rgba(10,28,20,0.55)';
        c.lineWidth = 0.035;
        c.stroke();
        // mid tone on the upper half of the branch
        c.beginPath();
        c.moveTo(0, y0 - thick * 0.9);
        c.quadraticCurveTo(side * w * 0.55, y0 - thick * 0.5, side * w * 0.92, y0 + droop * 0.8);
        c.quadraticCurveTo(side * w * 0.5, y0 + droop * 0.1, 0, y0 - thick * 0.2);
        c.closePath();
        c.fillStyle = greens[1];
        c.fill();
        // sunlit needle dabs (light from the upper left)
        const lit = side < 0 ? 1 : 0.45;
        const dabs = Math.round(3 + w * 3);
        for (let k = 0; k < dabs; k++) {
          const u = r.range(0.1, 0.9);
          const dx = side * w * u;
          const dy = y0 - thick * 0.6 + droop * u * 0.8 + r.range(-0.05, 0.08);
          c.fillStyle = r.next() < lit ? greens[2] : greens[1];
          c.beginPath();
          c.ellipse(dx, dy, 0.16 + r.next() * 0.12, 0.06, side * 0.35, 0, Math.PI * 2);
          c.fill();
          if (side < 0 && r.next() < 0.5) {
            c.fillStyle = greens[3];
            c.beginPath();
            c.ellipse(dx - 0.04, dy - 0.03, 0.08, 0.03, -0.35, 0, Math.PI * 2);
            c.fill();
          }
        }
      }
    }
    // tip
    c.beginPath();
    c.moveTo(0, -H);
    c.lineTo(-0.18, -H * 0.9);
    c.lineTo(0.18, -H * 0.9);
    c.closePath();
    c.fillStyle = greens[1];
    c.fill();
  });
}

function bush(variant: number, biome: Biome): Sprite {
  const p = PALETTES[biome];
  const r = new Rng(300 + variant);
  const W = 1.6 + variant * 0.3;
  const H = 1.0 + variant * 0.2;
  return make(W, H, (c) => {
    const blobs: [number, number, number][] = [];
    for (let i = 0; i < 5; i++) blobs.push([r.range(-W * 0.32, W * 0.32), -r.range(H * 0.3, H * 0.6), r.range(H * 0.3, H * 0.45)]);
    c.beginPath();
    for (const [x, y, rad] of blobs) {
      c.moveTo(x + rad, y);
      c.arc(x, y, rad, 0, Math.PI * 2);
    }
    c.fillStyle = p.grassDark;
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 0.1;
    c.stroke();
    c.fill();
    for (const [x, y, rad] of blobs) {
      c.beginPath();
      c.arc(x - rad * 0.25, y - rad * 0.25, rad * 0.6, 0, Math.PI * 2);
      c.fillStyle = p.grass;
      c.fill();
    }
    for (const [x, y, rad] of blobs) {
      c.beginPath();
      c.arc(x - rad * 0.4, y - rad * 0.45, rad * 0.22, 0, Math.PI * 2);
      c.fillStyle = p.grassLight;
      c.fill();
    }
  });
}

function rock(variant: number, biome: Biome, big: boolean): Sprite {
  const p = PALETTES[biome];
  const r = new Rng(500 + variant + (big ? 50 : 0));
  const W = big ? 2.6 + variant * 0.5 : 0.9 + variant * 0.25;
  const H = W * r.range(0.5, 0.7);
  return make(W, H, (c) => {
    const n = 8;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const a = Math.PI + (Math.PI * i) / n;
      const rr = r.range(0.85, 1.1);
      pts.push([Math.cos(a) * (W / 2) * rr, Math.sin(a) * H * rr]);
    }
    c.beginPath();
    c.moveTo(-W / 2, 0);
    for (const [x, y] of pts) c.lineTo(x, Math.min(0, y));
    c.lineTo(W / 2, 0);
    c.closePath();
    c.fillStyle = p.rockShade;
    c.fill();
    c.save();
    c.clip();
    // lit facet
    c.beginPath();
    c.moveTo(-W / 2, 0);
    for (let i = 0; i < pts.length * 0.6; i++) c.lineTo(pts[i][0] * 0.92 - 0.05, Math.min(0, pts[i][1]) * 0.92);
    c.lineTo(W * 0.05, -H * 0.2);
    c.lineTo(-W * 0.1, 0);
    c.closePath();
    c.fillStyle = p.rock;
    c.fill();
    // highlight
    c.beginPath();
    c.ellipse(-W * 0.18, -H * 0.7, W * 0.12, H * 0.08, -0.4, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fill();
    // moss on top
    if (biome !== Biome.Canyon) {
      c.beginPath();
      c.ellipse(-W * 0.05, -H * 0.98, W * 0.28, H * 0.12, 0, 0, Math.PI * 2);
      c.fillStyle = p.grass;
      c.fill();
    }
    c.restore();
    c.beginPath();
    c.moveTo(-W / 2, 0);
    for (const [x, y] of pts) c.lineTo(x, Math.min(0, y));
    c.lineTo(W / 2, 0);
    outline(c, big ? 0.08 : 0.05);
    // crack
    c.beginPath();
    c.moveTo(W * 0.1, -H * 0.85);
    c.lineTo(W * 0.18, -H * 0.5);
    c.lineTo(W * 0.1, -H * 0.3);
    c.strokeStyle = INK;
    c.lineWidth = 0.035;
    c.stroke();
  });
}

function grass(variant: number, biome: Biome): Sprite {
  const p = PALETTES[biome];
  const r = new Rng(700 + variant);
  const W = 1.1 + variant * 0.2;
  const H = 0.7 + variant * 0.12;
  return make(W, H, (c) => {
    const blades = 11;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < blades; i++) {
        const x = -W / 2 + (W * i) / (blades - 1) + r.range(-0.05, 0.05);
        const h = H * r.range(0.5, 1);
        const bend = r.range(-0.25, 0.25);
        c.beginPath();
        c.moveTo(x - 0.06, 0);
        c.quadraticCurveTo(x + bend * 0.5, -h * 0.6, x + bend, -h);
        c.quadraticCurveTo(x + bend * 0.4 + 0.02, -h * 0.5, x + 0.06, 0);
        c.closePath();
        if (pass === 0) {
          c.strokeStyle = 'rgba(20,50,20,0.8)';
          c.lineWidth = 0.035;
          c.stroke();
        } else {
          c.fillStyle = i % 3 === 0 ? p.grassLight : i % 3 === 1 ? p.grass : p.grassDark;
          c.fill();
        }
      }
    }
  });
}

function flower(variant: number, biome: Biome): Sprite {
  const g = grass(variant, biome);
  const r = new Rng(900 + variant);
  return make(1.2, 0.8, (c) => {
    c.drawImage(g.canvas, -g.ax, -g.ay, g.w, g.h);
    const colors = ['#ffffff', '#ffd94a', '#ff8fb8', '#b9a4ff'];
    for (let i = 0; i < 5; i++) {
      const x = r.range(-0.45, 0.45);
      const y = -r.range(0.35, 0.7);
      c.fillStyle = colors[(variant + i) % colors.length];
      c.strokeStyle = INK;
      c.lineWidth = 0.025;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        c.beginPath();
        c.arc(x + Math.cos(a) * 0.05, y + Math.sin(a) * 0.05, 0.04, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
      c.beginPath();
      c.arc(x, y, 0.03, 0, Math.PI * 2);
      c.fillStyle = '#ffb000';
      c.fill();
    }
  });
}

function cactus(variant: number): Sprite {
  const H = 2.2 + variant * 0.5;
  return make(1.6, H, (c) => {
    const limb = (x: number, y0: number, y1: number, w: number) => {
      c.beginPath();
      c.moveTo(x - w, y0);
      c.lineTo(x - w, y1 + w);
      c.arc(x, y1 + w, w, Math.PI, 0);
      c.lineTo(x + w, y0);
      c.closePath();
      c.fillStyle = '#4f9a48';
      c.fill();
      outline(c, 0.05);
      c.fillStyle = '#7cc565';
      c.fillRect(x - w * 0.6, y1 + w, w * 0.4, y0 - y1 - w);
    };
    limb(0, 0, -H, 0.2);
    limb(-0.5, -H * 0.35, -H * 0.7, 0.13);
    c.fillStyle = '#4f9a48';
    c.fillRect(-0.5, -H * 0.42, 0.4, 0.2);
    limb(0.45, -H * 0.5, -H * 0.85, 0.12);
    c.fillStyle = '#4f9a48';
    c.fillRect(0.1, -H * 0.56, 0.35, 0.18);
  });
}

function stump(): Sprite {
  return make(0.9, 0.6, (c) => {
    c.beginPath();
    c.moveTo(-0.4, 0);
    c.lineTo(-0.3, -0.5);
    c.lineTo(0.3, -0.5);
    c.lineTo(0.4, 0);
    c.closePath();
    c.fillStyle = '#7a4a2a';
    c.fill();
    outline(c);
    c.beginPath();
    c.ellipse(0, -0.5, 0.3, 0.1, 0, 0, Math.PI * 2);
    c.fillStyle = '#d6a670';
    c.fill();
    outline(c, 0.04);
  });
}

function log(): Sprite {
  return make(2.8, 0.9, (c) => {
    c.beginPath();
    c.roundRect(-1.4, -0.82, 2.6, 0.8, 0.4);
    c.fillStyle = '#7a4a2a';
    c.fill();
    outline(c, 0.06);
    c.fillStyle = '#9a643a';
    c.fillRect(-1.1, -0.72, 2.0, 0.18);
    c.beginPath();
    c.ellipse(1.2, -0.42, 0.22, 0.4, 0, 0, Math.PI * 2);
    c.fillStyle = '#d6a670';
    c.fill();
    outline(c, 0.05);
    c.beginPath();
    c.ellipse(1.2, -0.42, 0.1, 0.2, 0, 0, Math.PI * 2);
    c.strokeStyle = '#9a643a';
    c.lineWidth = 0.03;
    c.stroke();
  });
}

function flag(): Sprite {
  return make(1.4, 3, (c) => {
    c.fillStyle = '#f2f2f2';
    c.fillRect(-0.05, -3, 0.1, 3);
    c.strokeStyle = INK;
    c.lineWidth = 0.04;
    c.strokeRect(-0.05, -3, 0.1, 3);
    const s = 0.22;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 3; j++) {
        c.fillStyle = (i + j) % 2 ? '#1c1a2b' : '#e8392f';
        c.fillRect(0.05 + i * s, -3 + j * s, s, s);
      }
    c.strokeRect(0.05, -3, s * 4, s * 3);
  });
}

// ------------------------------------------------------------------ pickups

export function fuelCan(): Sprite {
  return make(0.9, 1.0, (c) => {
    c.beginPath();
    c.roundRect(-0.38, -0.85, 0.76, 0.85, 0.08);
    c.fillStyle = '#e8392f';
    c.fill();
    outline(c, 0.06);
    c.fillStyle = '#ff7a5c';
    c.fillRect(-0.3, -0.78, 0.14, 0.7);
    // embossed X
    c.strokeStyle = '#b3241d';
    c.lineWidth = 0.06;
    c.beginPath();
    c.moveTo(-0.2, -0.65);
    c.lineTo(0.22, -0.2);
    c.moveTo(0.22, -0.65);
    c.lineTo(-0.2, -0.2);
    c.stroke();
    // handle & spout
    c.beginPath();
    c.roundRect(-0.3, -1.0, 0.36, 0.16, 0.06);
    c.fillStyle = '#c92a22';
    c.fill();
    outline(c, 0.05);
    c.beginPath();
    c.roundRect(0.14, -1.02, 0.16, 0.2, 0.04);
    c.fillStyle = '#ffd23f';
    c.fill();
    outline(c, 0.05);
  });
}

export function waterBottle(): Sprite {
  return make(0.6, 1.1, (c) => {
    c.beginPath();
    c.moveTo(-0.22, 0);
    c.lineTo(-0.24, -0.7);
    c.quadraticCurveTo(-0.24, -0.86, -0.1, -0.9);
    c.lineTo(-0.1, -0.98);
    c.lineTo(0.1, -0.98);
    c.lineTo(0.1, -0.9);
    c.quadraticCurveTo(0.24, -0.86, 0.24, -0.7);
    c.lineTo(0.22, 0);
    c.closePath();
    c.fillStyle = 'rgba(120,200,255,0.95)';
    c.fill();
    outline(c, 0.05);
    c.fillStyle = '#2f8fe0';
    c.fillRect(-0.23, -0.55, 0.46, 0.28);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(-0.08, -0.48);
    c.quadraticCurveTo(0, -0.36, 0.08, -0.48);
    c.quadraticCurveTo(0, -0.62, -0.08, -0.48);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillRect(-0.17, -0.82, 0.07, 0.75);
    c.beginPath();
    c.roundRect(-0.12, -1.1, 0.24, 0.14, 0.03);
    c.fillStyle = '#1d6fd1';
    c.fill();
    outline(c, 0.04);
  });
}

// ------------------------------------------------------------------ clouds

export function cloud(variant: number): Sprite {
  const r = new Rng(1200 + variant);
  const W = 9 + variant * 2.5;
  const H = 3.2 + variant * 0.4;
  return make(
    W,
    H,
    (c) => {
      const puffs: [number, number, number][] = [];
      const n = 7 + variant;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const x = -W / 2 + W * 0.12 + t * W * 0.76;
        const rad = H * (0.28 + Math.sin(t * Math.PI) * 0.32) * r.range(0.85, 1.15);
        puffs.push([x, -rad * 0.9 - H * 0.08, rad]);
      }
      const path = () => {
        c.beginPath();
        for (const [x, y, rad] of puffs) {
          c.moveTo(x + rad, y);
          c.arc(x, y, rad, 0, Math.PI * 2);
        }
        c.rect(-W * 0.4, -H * 0.3, W * 0.8, H * 0.3);
      };
      path();
      c.strokeStyle = 'rgba(60,110,190,0.55)';
      c.lineWidth = 0.16;
      c.stroke();
      c.fillStyle = '#cfe2fb';
      c.fill();
      // lit upper puffs
      for (const [x, y, rad] of puffs) {
        c.beginPath();
        c.arc(x - rad * 0.1, y - rad * 0.12, rad * 0.86, 0, Math.PI * 2);
        c.fillStyle = '#ffffff';
        c.fill();
      }
    },
    20,
  );
}

// ------------------------------------------------------------------ cache

const cache = new Map<string, Sprite>();

/** Biome-independent kinds share one sprite set. */
export function propSprite(kind: PropKind, variant: number, biome: Biome): Sprite {
  const v = variant % 3;
  const tinted = kind === 'bush' || kind === 'rock' || kind === 'boulder' || kind === 'grass' || kind === 'flower';
  const key = `${kind}:${v}:${tinted ? biome : ''}`;
  let s = cache.get(key);
  if (!s) {
    switch (kind) {
      case 'pine':
        s = pine(v);
        break;
      case 'pineDead':
        s = pine(v, true);
        break;
      case 'bush':
        s = bush(v, biome);
        break;
      case 'rock':
        s = rock(v, biome, false);
        break;
      case 'boulder':
        s = rock(v, biome, true);
        break;
      case 'grass':
        s = grass(v, biome);
        break;
      case 'flower':
        s = flower(v, biome);
        break;
      case 'cactus':
        s = cactus(v);
        break;
      case 'stump':
        s = stump();
        break;
      case 'log':
        s = log();
        break;
      case 'flag':
        s = flag();
        break;
    }
    cache.set(key, s);
  }
  return s;
}

let fuelSprite: Sprite | null = null;
let waterSprite: Sprite | null = null;
export function pickupSprite(kind: 'fuel' | 'water'): Sprite {
  if (kind === 'fuel') return (fuelSprite ??= fuelCan());
  return (waterSprite ??= waterBottle());
}

const clouds: Sprite[] = [];
export function cloudSprite(v: number): Sprite {
  const i = v % 4;
  return (clouds[i] ??= cloud(i));
}
