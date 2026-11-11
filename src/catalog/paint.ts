import { Rng } from '../core/math';
import { INK } from '../render/palette';
import { make, Sprite } from '../render/sprites';

/**
 * Small painting toolkit used by the asset families: everything is drawn in metres, origin at
 * the bottom centre of the sprite, y up is negative (canvas convention), cel-shaded with a dark
 * ink outline and light coming from the upper left.
 */

export type Ctx = CanvasRenderingContext2D;
export type Pt = [number, number];

/** Sprite with an adaptive resolution (big objects get fewer pixels per metre). */
export function sprite(w: number, h: number, draw: (c: Ctx) => void): Sprite {
  const ppm = Math.max(36, Math.min(72, 420 / Math.max(w, h)));
  return make(w, h, draw, ppm);
}

export function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

/** Lighten (k > 0) or darken (k < 0) a colour. */
export function shade(color: string, k: number): string {
  const v = parseInt(color.slice(1), 16);
  let r = (v >> 16) & 255;
  let g = (v >> 8) & 255;
  let b = v & 255;
  if (k >= 0) {
    r += (255 - r) * k;
    g += (255 - g) * k;
    b += (255 - b) * k;
  } else {
    r *= 1 + k;
    g *= 1 + k;
    b *= 1 + k;
  }
  return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
}

export function poly(c: Ctx, pts: Pt[], fill: string | CanvasGradient, lw = 0.04, stroke: string | null = INK): void {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke && lw > 0) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}

export function ell(c: Ctx, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, lw = 0.035, stroke: string | null = INK): void {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.001, rx), Math.max(0.001, ry), 0, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (stroke && lw > 0) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}

export function rect(c: Ctx, x: number, y: number, w: number, h: number, fill: string | CanvasGradient, lw = 0.035, r = 0, stroke: string | null = INK): void {
  c.beginPath();
  if (r > 0) c.roundRect(x, y, w, h, r);
  else c.rect(x, y, w, h);
  c.fillStyle = fill;
  c.fill();
  if (stroke && lw > 0) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}

export function line(c: Ctx, pts: Pt[], color: string, width: number, ink = true): void {
  const path = () => {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  };
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (ink) {
    path();
    c.strokeStyle = INK;
    c.lineWidth = width + 0.05;
    c.stroke();
  }
  path();
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
}

/** Vertical lit gradient (left lit, right shaded) for boxes and trunks. */
export function sideGrad(c: Ctx, x0: number, x1: number, color: string): CanvasGradient {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, shade(color, 0.22));
  g.addColorStop(0.45, color);
  g.addColorStop(1, shade(color, -0.28));
  return g;
}

export function vGrad(c: Ctx, y0: number, y1: number, top: string, bottom: string): CanvasGradient {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}

/** Leafy crown made of overlapping blobs, three tones (shadow, base, light). */
export function crown(c: Ctx, r: Rng, cx: number, cy: number, rx: number, ry: number, color: string, blobs = 9): void {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < blobs; i++) {
    const a = r.range(0, Math.PI * 2);
    const d = Math.sqrt(r.next());
    pts.push([cx + Math.cos(a) * rx * 0.62 * d, cy + Math.sin(a) * ry * 0.6 * d, Math.min(rx, ry) * r.range(0.42, 0.6)]);
  }
  c.beginPath();
  for (const [x, y, rr] of pts) {
    c.moveTo(x + rr, y);
    c.arc(x, y, rr, 0, Math.PI * 2);
  }
  c.fillStyle = shade(color, -0.3);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 0.06;
  c.stroke();
  c.fill();
  for (const [x, y, rr] of pts) ell(c, x - rr * 0.18, y - rr * 0.2, rr * 0.78, rr * 0.74, color, 0);
  for (const [x, y, rr] of pts) ell(c, x - rr * 0.38, y - rr * 0.42, rr * 0.34, rr * 0.3, shade(color, 0.3), 0);
}

/** Simple person standing (spectators, marshals, mechanics). Height ~1.75 m. */
export interface PersonLook {
  shirt: string;
  pants: string;
  skin: string;
  hair: string;
  hat?: string;
  pose?: 'stand' | 'cheer' | 'point' | 'flag' | 'camera' | 'sit';
  flag?: string;
  scale?: number;
}
export function person(c: Ctx, x: number, p: PersonLook): void {
  const k = p.scale ?? 1;
  c.save();
  c.translate(x, 0);
  c.scale(k, k);
  const pose = p.pose ?? 'stand';
  const sit = pose === 'sit';
  const legTop = sit ? -0.45 : -0.85;
  // legs
  if (sit) {
    line(c, [[-0.08, legTop], [0.2, legTop], [0.22, 0]], p.pants, 0.12);
    line(c, [[0.06, legTop], [0.32, legTop], [0.34, 0]], p.pants, 0.12);
  } else {
    line(c, [[-0.07, legTop], [-0.09, -0.04]], p.pants, 0.13);
    line(c, [[0.07, legTop], [0.09, -0.04]], p.pants, 0.13);
  }
  ell(c, -0.1, -0.03, 0.09, 0.04, '#2a2420', 0.02);
  ell(c, 0.12, -0.03, 0.09, 0.04, '#2a2420', 0.02);
  // torso
  const tb = legTop;
  poly(c, [[-0.17, tb + 0.02], [-0.19, tb - 0.55], [0.19, tb - 0.55], [0.17, tb + 0.02]], sideGrad(c, -0.2, 0.2, p.shirt), 0.035);
  // arms
  const sh: Pt = [-0.19, tb - 0.5];
  const sh2: Pt = [0.19, tb - 0.5];
  switch (pose) {
    case 'cheer':
      line(c, [sh, [-0.32, tb - 0.75], [-0.3, tb - 1.0]], p.shirt, 0.09);
      line(c, [sh2, [0.32, tb - 0.75], [0.3, tb - 1.0]], p.shirt, 0.09);
      ell(c, -0.3, tb - 1.03, 0.05, 0.05, p.skin, 0.02);
      ell(c, 0.3, tb - 1.03, 0.05, 0.05, p.skin, 0.02);
      break;
    case 'point':
      line(c, [sh, [-0.26, tb - 0.25], [-0.22, tb - 0.05]], p.shirt, 0.09);
      line(c, [sh2, [0.45, tb - 0.55], [0.65, tb - 0.6]], p.shirt, 0.09);
      break;
    case 'flag':
      line(c, [sh, [-0.26, tb - 0.25], [-0.22, tb - 0.05]], p.shirt, 0.09);
      line(c, [sh2, [0.35, tb - 0.75], [0.36, tb - 0.95]], p.shirt, 0.09);
      line(c, [[0.36, tb - 0.6], [0.36, tb - 1.5]], '#d8d8d8', 0.025, false);
      rect(c, 0.36, tb - 1.5, 0.45, 0.32, p.flag ?? '#ffd21f', 0.025);
      break;
    case 'camera':
      line(c, [sh, [-0.05, tb - 0.55], [0.15, tb - 0.68]], p.shirt, 0.09);
      line(c, [sh2, [0.3, tb - 0.6], [0.22, tb - 0.68]], p.shirt, 0.09);
      rect(c, 0.08, tb - 0.8, 0.22, 0.14, '#2a2a2e', 0.02, 0.02);
      ell(c, 0.32, tb - 0.73, 0.06, 0.06, '#4a5060', 0.02);
      break;
    default:
      line(c, [sh, [-0.25, tb - 0.25], [-0.23, tb - 0.02]], p.shirt, 0.09);
      line(c, [sh2, [0.25, tb - 0.25], [0.23, tb - 0.02]], p.shirt, 0.09);
  }
  // head
  ell(c, 0, tb - 0.7, 0.12, 0.13, p.skin, 0.035);
  c.beginPath();
  c.ellipse(0, tb - 0.75, 0.125, 0.09, 0, Math.PI, 0);
  c.fillStyle = p.hair;
  c.fill();
  if (p.hat) {
    rect(c, -0.13, tb - 0.86, 0.26, 0.07, p.hat, 0.025, 0.03);
    rect(c, 0.0, tb - 0.81, 0.2, 0.03, shade(p.hat, -0.2), 0.02);
  }
  c.restore();
}

/** Bold sponsor-like text (invented brands only). */
export function label(c: Ctx, text: string, x: number, y: number, size: number, color: string, outline: string | null = null, italic = true): void {
  c.save();
  c.translate(x, y);
  c.scale(size / 40, size / 40);
  c.font = `${italic ? 'italic ' : ''}900 40px Arial Black, system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if (outline) {
    c.lineWidth = 7;
    c.strokeStyle = outline;
    c.strokeText(text, 0, 0);
  }
  c.fillStyle = color;
  c.fillText(text, 0, 0);
  c.restore();
}

/** Deterministic RNG from an asset id. */
export function rngFor(id: string): Rng {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return new Rng(h >>> 0);
}

export const SKINS = ['#f1c7a5', '#e0ac85', '#c48a62', '#9a6544', '#6e4630', '#f6d6bf'];
export const HAIRS = ['#2a1d14', '#5a3a22', '#a8743a', '#e0c070', '#1a1a1a', '#8a8a8a'];
export const SHIRTS = ['#d8261f', '#1f6fd6', '#ffd21f', '#2fa84f', '#ff7a1a', '#7a3fd1', '#f2f2f2', '#14d1c0', '#e84a8a', '#2a2a2e', '#8a5a33', '#4fb3ff'];
export const PANTS = ['#2a3550', '#3a2a20', '#555b66', '#1e1e22', '#6b5a3a', '#2f4d33'];
/** Invented sponsor names (no real brands). */
export const BRANDS = ['MOTOX', 'DUNEWAY', 'PIKA OIL', 'RIDGE', 'XPLO', 'KIWI BOOST', 'ROCKET TYRES', 'SUNNY', 'NOVA', 'BOLT', 'TORQUE+', 'ALPAKA', 'ZEBRA', 'MAXGRIP', 'OUTBACK', 'TURBO'];
