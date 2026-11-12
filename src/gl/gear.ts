import * as THREE from 'three';
import type { Outfit } from '../outfits';
import type { BikeModel } from '../bikes';
import type { RiderLook } from '../ai';

/**
 * v2.23 rider gear: colours, cut (pattern) and the painted textures of the jersey, sleeves,
 * pants and helmet (twice the resolution of the first version, with panels, piping, mesh
 * vents, logos, shaded numbers and stitching), plus a woven fabric bump map.
 */
export interface GearLook {
  jersey: string;
  accent: string;
  trim: string;
  pants: string;
  helmet: string;
  text: string;
  number: string;
  name: string;
  /** Cut of the graphics: 0 slashes, 1 chevrons, 2 split, 3 speed bars, 4 blocks. */
  pattern: number;
}

const hexs = (n: number) => '#' + n.toString(16).padStart(6, '0');
export const darker = (c: string, k: number) => {
  const v = parseInt(c.slice(1), 16);
  const f = (x: number) => Math.round(x * (1 - k));
  return '#' + ((1 << 24) | (f((v >> 16) & 255) << 16) | (f((v >> 8) & 255) << 8) | f(v & 255)).toString(16).slice(1);
};
export const lighter = (c: string, k: number) => {
  const v = parseInt(c.slice(1), 16);
  const f = (x: number) => Math.round(x + (255 - x) * k);
  return '#' + ((1 << 24) | (f((v >> 16) & 255) << 16) | (f((v >> 8) & 255) << 8) | f(v & 255)).toString(16).slice(1);
};
const hash = (s: string) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

/** Gear matching a bike (the player), an outfit of the garage or an opponent's team colours. */
export function gearFor(model: BikeModel, rival?: RiderLook, outfit?: Outfit): GearLook {
  if (outfit?.colors) {
    const c = outfit.colors;
    return { ...c, number: model.number, name: model.name.split(' ')[0].toUpperCase(), pattern: hash(outfit.id) % 5 };
  }
  if (rival) return { jersey: rival.jersey, accent: rival.accent, trim: '#ffffff', pants: darker(rival.jersey, 0.45), helmet: rival.helmet, text: '#ffffff', number: rival.number, name: 'RACING', pattern: hash(rival.number + rival.jersey) % 5 };
  if (model.id === 'explorer') return { jersey: '#6a4127', accent: '#35553a', trim: '#d99a3a', pants: '#4d3322', helmet: '#3d5d3f', text: '#e6d8b0', number: '98', name: 'EXPLORER', pattern: 2 };
  const p = hexs(model.colors.primary);
  const sec = hexs(model.colors.secondary);
  return { jersey: p, accent: sec, trim: model.colors.plateText, pants: darker(sec === '#ffffff' || sec === '#f2f4f8' ? p : sec, 0.25), helmet: p, text: model.colors.plate, number: model.number, name: model.name.split(' ')[0].toUpperCase(), pattern: hash(model.id) % 5 };
}

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, aniso = 8): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

let weave: THREE.Texture | null = null;
/** Woven fabric bump (tiles): fine crossed threads. */
export function fabricBump(): THREE.Texture {
  if (weave) return weave;
  const t = canvasTex(64, 64, (c) => {
    c.fillStyle = '#808080';
    c.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 4)
      for (let x = 0; x < 64; x += 4) {
        const up = ((x + y) / 4) % 2 === 0;
        c.fillStyle = up ? '#b0b0b0' : '#585858';
        c.fillRect(x, y, 3, 3);
      }
  });
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(14, 7);
  weave = t;
  return t;
}

/** Shaded text with a dark outline (numbers, names, logos). */
function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, fill: string, outline = '#14161c', lw = 6): void {
  c.font = font;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillText(text, x + lw * 0.5, y + lw * 0.7);
  c.lineWidth = lw;
  c.strokeStyle = outline;
  c.strokeText(text, x, y);
  c.fillStyle = fill;
  c.fillText(text, x, y);
}

function sponsor(c: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, bg: string, fg: string): void {
  c.fillStyle = bg;
  c.beginPath();
  c.roundRect(x - w / 2, y - h / 2, w, h, h * 0.3);
  c.fill();
  c.font = `italic 900 ${Math.round(h * 0.62)}px Arial Black, system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = fg;
  c.fillText(text, x, y + 1);
}

/** The cut of the graphics, drawn over a panel (front or back) centred on cx. */
function cut(c: CanvasRenderingContext2D, L: GearLook, cx: number, w: number, H: number): void {
  c.save();
  c.beginPath();
  c.rect(cx - w / 2, 0, w, H);
  c.clip();
  c.fillStyle = L.accent;
  const t = L.trim;
  switch (L.pattern) {
    case 0: // slashes
      for (let k = -1; k < 4; k++) {
        c.beginPath();
        const x = cx - w / 2 + k * w * 0.34;
        c.moveTo(x, H);
        c.lineTo(x + w * 0.42, H * 0.18);
        c.lineTo(x + w * 0.56, H * 0.18);
        c.lineTo(x + w * 0.14, H);
        c.fill();
      }
      break;
    case 1: // chevrons
      for (let k = 0; k < 3; k++) {
        const y = H * (0.42 + k * 0.2);
        c.beginPath();
        c.moveTo(cx - w / 2, y - H * 0.16);
        c.lineTo(cx, y);
        c.lineTo(cx + w / 2, y - H * 0.16);
        c.lineTo(cx + w / 2, y - H * 0.07);
        c.lineTo(cx, y + H * 0.09);
        c.lineTo(cx - w / 2, y - H * 0.07);
        c.fill();
      }
      break;
    case 2: // split with a jagged edge
      c.beginPath();
      c.moveTo(cx - w / 2, H);
      c.lineTo(cx - w / 2, H * 0.62);
      for (let k = 0; k <= 8; k++) c.lineTo(cx - w / 2 + (k / 8) * w, H * (k % 2 ? 0.5 : 0.62));
      c.lineTo(cx + w / 2, H);
      c.fill();
      break;
    case 3: // speed bars
      for (let k = 0; k < 6; k++) {
        const y = H * (0.3 + k * 0.1);
        c.fillRect(cx - w / 2, y, w * (0.35 + 0.1 * ((k * 7) % 5)), H * 0.045);
      }
      break;
    default: // blocks
      c.fillRect(cx - w / 2, H * 0.55, w, H * 0.16);
      c.fillStyle = t;
      c.fillRect(cx - w / 2, H * 0.52, w, H * 0.02);
      c.fillRect(cx - w / 2, H * 0.72, w, H * 0.02);
  }
  c.restore();
}

/**
 * Jersey wrapped around the torso: u goes around the body starting on the right side
 * (u = 0, facing the camera), front at u = 0.25, left side 0.5, back 0.75. Canvas y = top
 * (collar) → bottom (hem).
 */
export function jerseyTexture(L: GearLook): THREE.Texture {
  const W = 1024;
  const H = 512;
  return canvasTex(W, H, (c) => {
    const g0 = c.createLinearGradient(0, 0, 0, H);
    g0.addColorStop(0, lighter(L.jersey, 0.1));
    g0.addColorStop(1, darker(L.jersey, 0.12));
    c.fillStyle = g0;
    c.fillRect(0, 0, W, H);
    // graphics on the chest and on the back
    cut(c, L, W * 0.25, W * 0.34, H);
    cut(c, L, W * 0.75, W * 0.34, H);
    // side panels: mesh vents
    for (const u of [0, 0.5, 1]) {
      c.fillStyle = darker(L.accent, 0.15);
      c.fillRect(u * W - 84, 0, 168, H);
      c.fillStyle = 'rgba(0,0,0,0.28)';
      for (let y = 70; y < H - 50; y += 9) for (let x = -66; x <= 66; x += 9) c.fillRect(u * W + x + ((y / 9) % 2 ? 4 : 0), y, 3, 3);
      c.fillStyle = L.trim;
      c.fillRect(u * W - 88, 0, 7, H);
      c.fillRect(u * W + 81, 0, 7, H);
    }
    // shoulder yoke and collar
    c.fillStyle = L.accent;
    c.fillRect(0, 0, W, 86);
    c.fillStyle = L.trim;
    c.fillRect(0, 86, W, 8);
    c.fillStyle = darker(L.jersey, 0.55);
    c.fillRect(0, 0, W, 22);
    // hem
    c.fillStyle = '#23201e';
    c.fillRect(0, H - 40, W, 40);
    c.fillStyle = L.trim;
    c.fillRect(0, H - 46, W, 6);
    // back: name and number
    label(c, L.name, W * 0.75, 132, 'italic 800 46px Arial, system-ui, sans-serif', L.text, '#14161c', 5);
    label(c, L.number, W * 0.75, 292, 'italic 900 196px Arial Black, system-ui, sans-serif', L.text, '#14161c', 12);
    sponsor(c, 'XPLO', W * 0.75, 430, 120, 34, L.trim, darker(L.jersey, 0.6));
    // front: logo, small number, sponsors
    label(c, 'MOTO', W * 0.25 - 44, 170, 'italic 900 50px Arial Black, system-ui, sans-serif', L.text, '#14161c', 5);
    label(c, 'X', W * 0.25 + 62, 168, 'italic 900 84px Arial Black, system-ui, sans-serif', L.trim, '#14161c', 6);
    label(c, L.number, W * 0.25, 300, 'italic 900 96px Arial Black, system-ui, sans-serif', L.text, '#14161c', 8);
    sponsor(c, 'RIDGE', W * 0.25 - 70, 404, 104, 30, L.text, darker(L.jersey, 0.6));
    sponsor(c, 'BOLT', W * 0.25 + 66, 404, 88, 30, darker(L.jersey, 0.6), L.text);
    // seams
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.lineWidth = 2;
    c.setLineDash([7, 5]);
    for (const u of [0.125, 0.375, 0.625, 0.875]) {
      c.beginPath();
      c.moveTo(u * W, 94);
      c.lineTo(u * W, H - 46);
      c.stroke();
    }
    c.setLineDash([]);
    // soft fabric shading: lighter on the chest, darker under the arms
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.07)');
    g.addColorStop(0.6, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  });
}

/** Sleeve: u around the arm (0 = outside), v along it (canvas top = shoulder, bottom = wrist). */
export function sleeveTexture(L: GearLook): THREE.Texture {
  return canvasTex(256, 512, (c) => {
    c.fillStyle = L.jersey;
    c.fillRect(0, 0, 256, 512);
    // stripe down the outside of the arm
    for (const x of [0, 256]) {
      c.fillStyle = L.accent;
      c.fillRect(x - 46, 0, 92, 512);
      c.fillStyle = L.trim;
      c.fillRect(x - 52, 0, 7, 512);
      c.fillRect(x + 45, 0, 7, 512);
    }
    // logo along the arm
    c.save();
    c.translate(128, 250);
    c.rotate(-Math.PI / 2);
    label(c, 'MOTOX', 0, 0, 'italic 900 54px Arial Black, system-ui, sans-serif', L.text, '#14161c', 5);
    c.restore();
    // elbow stretch panel and cuff
    c.fillStyle = 'rgba(0,0,0,0.2)';
    for (let y = 200; y < 300; y += 10) c.fillRect(150, y, 90, 4);
    c.fillStyle = darker(L.jersey, 0.55);
    c.fillRect(0, 462, 256, 50);
    c.fillStyle = L.trim;
    c.fillRect(0, 456, 256, 6);
    const g = c.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 512);
  });
}

/** Pants leg: u around the leg (0 = outside, facing the camera), canvas top = hip. */
export function pantsTexture(L: GearLook): THREE.Texture {
  return canvasTex(512, 512, (c) => {
    c.fillStyle = L.pants;
    c.fillRect(0, 0, 512, 512);
    // outside panel with the brand
    for (const x of [0, 512]) {
      c.fillStyle = L.accent;
      c.fillRect(x - 86, 0, 172, 512);
      c.fillStyle = L.trim;
      c.fillRect(x - 94, 0, 9, 512);
      c.fillRect(x + 85, 0, 9, 512);
    }
    c.save();
    c.translate(46, 250);
    c.rotate(-Math.PI / 2);
    label(c, 'MOTOXPLOSION', 0, 0, 'italic 900 50px Arial Black, system-ui, sans-serif', L.text, '#14161c', 5);
    c.restore();
    // front thigh logo
    label(c, 'X', 256, 150, 'italic 900 110px Arial Black, system-ui, sans-serif', L.trim, '#14161c', 7);
    // knee: ribbed stretch panel, leather heat patch inside
    c.fillStyle = darker(L.pants, 0.3);
    c.fillRect(150, 330, 230, 150);
    c.fillStyle = 'rgba(255,255,255,0.12)';
    for (let y = 338; y < 476; y += 12) c.fillRect(156, y, 218, 4);
    c.fillStyle = '#3a2c22';
    c.fillRect(392, 300, 60, 212);
    // stitching
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = 2;
    c.setLineDash([8, 6]);
    for (const x of [140, 392]) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 512);
      c.stroke();
    }
    c.setLineDash([]);
    const g = c.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0.2)');
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 512);
  });
}

/** Helmet shell (sphere UV): bands run front to back over the top, flashes and number on the sides. */
export function helmetTexture(L: GearLook): THREE.Texture {
  const W = 1024;
  const H = 512;
  return canvasTex(W, H, (c) => {
    const g0 = c.createLinearGradient(0, 0, 0, H);
    g0.addColorStop(0, lighter(L.helmet, 0.12));
    g0.addColorStop(1, darker(L.helmet, 0.15));
    c.fillStyle = g0;
    c.fillRect(0, 0, W, H);
    // crown band with piping
    c.fillStyle = L.jersey === L.helmet ? L.accent : L.jersey;
    c.fillRect(0, 150, W, 70);
    c.fillStyle = L.trim;
    c.fillRect(0, 140, W, 10);
    c.fillRect(0, 220, W, 10);
    // side flashes and numbers (the two sides of the shell)
    for (const cx of [256, 768]) {
      c.fillStyle = L.accent;
      c.beginPath();
      c.moveTo(cx - 170, 400);
      c.lineTo(cx + 120, 262);
      c.lineTo(cx + 190, 262);
      c.lineTo(cx - 60, 400);
      c.fill();
      c.fillStyle = L.trim;
      c.beginPath();
      c.moveTo(cx - 30, 400);
      c.lineTo(cx + 215, 262);
      c.lineTo(cx + 235, 262);
      c.lineTo(cx + 10, 400);
      c.fill();
      label(c, L.number, cx - 40, 330, 'italic 900 100px Arial Black, system-ui, sans-serif', L.text, '#14161c', 8);
      label(c, 'MOTOX', cx + 90, 440, 'italic 900 38px Arial Black, system-ui, sans-serif', L.text, '#14161c', 4);
      // vents
      c.fillStyle = '#14161c';
      for (const dx of [-20, 40, 100]) {
        c.beginPath();
        c.ellipse(cx + dx, 112, 22, 7, -0.2, 0, Math.PI * 2);
        c.fill();
      }
    }
    // rim
    c.fillStyle = '#1c1c20';
    c.fillRect(0, H - 34, W, 34);
  });
}
