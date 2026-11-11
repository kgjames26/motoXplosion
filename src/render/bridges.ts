import { hash1 } from '../core/math';
import type { Bridge } from '../world/types';
import type { World } from '../world/world';
import { INK } from './palette';
import type { Textures, View } from './view';

/**
 * Bridges: rope & plank bridge, stone humpback arch bridge, riveted iron truss bridge and
 * tall stone viaducts. Physics only knows the deck (heightfield); everything here is visual.
 * `back` draws the parts behind the rider (railings, trusses), `!back` the deck and structure.
 */

const BAND = 0.8;

export function drawBridges(c: CanvasRenderingContext2D, v: View, w: World, x0: number, x1: number, tex: Textures | null, back: boolean): void {
  for (const br of w.bridges) {
    if (br.x1 < x0 - 12 || br.x0 > x1 + 12) continue;
    switch (br.kind) {
      case 'wood':
        if (back) woodBack(c, v, w, br);
        else wood(c, v, w, br);
        break;
      case 'stone':
        if (back) parapet(c, v, w, br, tex, 0.5);
        else stone(c, v, w, br, tex);
        break;
      case 'iron':
        if (back) truss(c, v, w, br);
        else iron(c, v, w, br, tex);
        break;
      case 'viaduct':
        if (back) parapet(c, v, w, br, tex, 0.6);
        else viaduct(c, v, w, br, tex);
        break;
    }
  }
}

const lw = (v: View, k = 1) => Math.max(1.2, v.scale * 0.04 * k);

function deckBand(c: CanvasRenderingContext2D, v: View, w: World, br: Bridge, fill: string | CanvasPattern, lip: string): void {
  const bandPx = BAND * v.scale;
  const pts: [number, number][] = [];
  for (let x = br.x0 - 0.3; x <= br.x1 + 0.3; x += 0.25) pts.push([v.sx(x), v.sy(w.heightAt(x))]);
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1] - bandPx);
  for (const [x, y] of pts) c.lineTo(x, y - bandPx);
  for (let k = pts.length - 1; k >= 0; k--) c.lineTo(pts[k][0], pts[k][1] + bandPx * 0.2);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = lw(v, 0.6);
  c.stroke();
  // lip
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1] + bandPx * 0.2);
  for (const [x, y] of pts) c.lineTo(x, y + bandPx * 0.2);
  for (let k = pts.length - 1; k >= 0; k--) c.lineTo(pts[k][0], pts[k][1] + bandPx * 0.55);
  c.closePath();
  c.fillStyle = lip;
  c.fill();
  c.stroke();
}

// ---------------------------------------------------------------- wood (rope bridge)

function woodBack(c: CanvasRenderingContext2D, v: View, w: World, br: Bridge): void {
  // back rope rail, a little higher and darker (far side of the deck)
  rope(c, v, w, br, 1.5 + BAND * 0.9, 'rgba(150,110,70,1)');
}

function rope(c: CanvasRenderingContext2D, v: View, w: World, br: Bridge, h: number, color: string): void {
  c.beginPath();
  for (let x = br.x0; x <= br.x1; x += 0.4) {
    const u = (x - br.x0) / (br.x1 - br.x0);
    const sag = Math.sin(Math.PI * u) * 0.35;
    const X = v.sx(x);
    const Y = v.sy(w.heightAt(x) + h - sag);
    if (x === br.x0) c.moveTo(X, Y);
    else c.lineTo(X, Y);
  }
  c.strokeStyle = INK;
  c.lineWidth = v.scale * 0.07 + lw(v);
  c.stroke();
  c.strokeStyle = color;
  c.lineWidth = v.scale * 0.07;
  c.stroke();
}

function wood(c: CanvasRenderingContext2D, v: View, w: World, br: Bridge): void {
  const deck = (x: number) => w.heightAt(x);
  const bandPx = BAND * v.scale;
  // struts into the cliffs
  for (const [bx, dir] of [
    [br.x0, 1],
    [br.x1, -1],
  ] as [number, number][]) {
    c.beginPath();
    c.moveTo(v.sx(bx - dir * 1.5), v.sy(deck(bx) - 3.5));
    c.lineTo(v.sx(bx + dir * 3), v.sy(deck(bx + dir * 3) - 0.3));
    c.strokeStyle = INK;
    c.lineWidth = v.scale * 0.28 + lw(v) * 2;
    c.stroke();
    c.strokeStyle = '#8a5a33';
    c.lineWidth = v.scale * 0.28;
    c.stroke();
  }
  // planks
  const plank = 0.5;
  for (let x = br.x0; x < br.x1; x += plank) {
    const xa = v.sx(x);
    const xb = v.sx(x + plank * 0.9);
    const ya = v.sy(deck(x));
    const yb = v.sy(deck(x + plank));
    const shade = hash1(Math.round(x * 10), 3);
    c.beginPath();
    c.moveTo(xa, ya - bandPx);
    c.lineTo(xb, yb - bandPx);
    c.lineTo(xb, yb + bandPx * 0.45);
    c.lineTo(xa, ya + bandPx * 0.45);
    c.closePath();
    c.fillStyle = shade > 0.66 ? '#a8713f' : shade > 0.33 ? '#bb8450' : '#c99560';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = lw(v, 0.6);
    c.stroke();
    // wood grain + light edge
    c.fillStyle = 'rgba(255,232,190,0.35)';
    c.fillRect(xa + 1, ya - bandPx + 1, (xb - xa) * 0.25, bandPx * 1.3);
    c.strokeStyle = 'rgba(90,50,25,0.45)';
    c.lineWidth = Math.max(1, v.scale * 0.015);
    c.beginPath();
    c.moveTo(xa + (xb - xa) * 0.6, ya - bandPx * 0.8);
    c.lineTo(xa + (xb - xa) * 0.55, ya + bandPx * 0.3);
    c.stroke();
  }
  // stringer
  c.beginPath();
  for (let x = br.x0; x <= br.x1; x += 0.5) {
    const X = v.sx(x);
    const Y = v.sy(deck(x)) + bandPx * 0.45;
    if (x === br.x0) c.moveTo(X, Y);
    else c.lineTo(X, Y);
  }
  c.strokeStyle = INK;
  c.lineWidth = v.scale * 0.16 + lw(v) * 2;
  c.stroke();
  c.strokeStyle = '#7a4c2a';
  c.lineWidth = v.scale * 0.16;
  c.stroke();
  // posts + front ropes
  const n = Math.max(2, Math.round((br.x1 - br.x0) / 3));
  for (let i = 0; i <= n; i++) {
    const px = br.x0 + ((br.x1 - br.x0) * i) / n;
    const big = i === 0 || i === n;
    const ph = big ? 1.9 : 1.3;
    const X = v.sx(px);
    const Y = v.sy(deck(px));
    const pw = v.scale * (big ? 0.24 : 0.09);
    c.fillStyle = big ? '#8a5a33' : '#c8a070';
    c.fillRect(X - pw / 2, Y - ph * v.scale, pw, ph * v.scale + bandPx * 0.45);
    c.strokeStyle = INK;
    c.lineWidth = lw(v, 0.6);
    c.strokeRect(X - pw / 2, Y - ph * v.scale, pw, ph * v.scale + bandPx * 0.45);
    // vertical hanger rope
    c.beginPath();
    c.moveTo(X, Y - 0.2 * v.scale);
    c.lineTo(X, Y - 1.3 * v.scale);
    c.strokeStyle = '#d9b27a';
    c.lineWidth = Math.max(1, v.scale * 0.03);
    c.stroke();
  }
  rope(c, v, w, br, 1.3, '#d9b27a');
  rope(c, v, w, br, 0.72, '#d9b27a');
}

// ---------------------------------------------------------------- stone

function parapet(c: CanvasRenderingContext2D, v: View, w: World, br: Bridge, tex: Textures | null, h: number): void {
  const bandPx = BAND * v.scale;
  const top: [number, number][] = [];
  for (let x = br.x0 - 0.5; x <= br.x1 + 0.5; x += 0.25) top.push([v.sx(x), v.sy(w.heightAt(x) + h) - bandPx * 0.95]);
  c.beginPath();
  c.moveTo(top[0][0], top[0][1]);
  for (const p of top) c.lineTo(p[0], p[1]);
  for (let k = top.length - 1; k >= 0; k--) c.lineTo(top[k][0], top[k][1] + h * v.scale);
  c.closePath();
  c.fillStyle = tex?.get('stone', v, 0.5) ?? '#a59c8e';
  c.fill();
  c.fillStyle = 'rgba(30,30,50,0.25)';
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = lw(v, 0.7);
  c.stroke();
  // coping stones
  c.beginPath();
  c.moveTo(top[0][0], top[0][1]);
  for (const p of top) c.lineTo(p[0], p[1]);
  c.strokeStyle = '#d9d2c4';
  c.lineWidth = v.scale * 0.12;
  c.stroke();
}

/** Masonry body with arch openings (even-odd fill). */
function archedBody(
  c: CanvasRenderingContext2D,
  v: View,
  w: World,
  br: Bridge,
  tex: Textures | null,
  opts: { pier: number; crownDrop: number; bottom: (x: number) => number; ext: number; tiers: number },
): void {
  const L = br.x1 - br.x0;
  const span = L / br.spans;
  const bandPx = BAND * v.scale;
  c.save();
  c.beginPath();
  // outer silhouette: from deck lip down to the ground profile
  const xa = br.x0 - opts.ext;
  const xb = br.x1 + opts.ext;
  c.moveTo(v.sx(xa), v.sy(w.heightAt(xa)) + bandPx * 0.5);
  for (let x = xa; x <= xb; x += 0.5) c.lineTo(v.sx(x), v.sy(w.heightAt(x)) + bandPx * 0.5);
  for (let x = xb; x >= xa; x -= 0.5) c.lineTo(v.sx(x), v.sy(opts.bottom(x)));
  c.closePath();
  // arch openings
  const crown = Math.min(w.heightAt(br.x0), w.heightAt(br.x1)) - opts.crownDrop;
  const arches: { cx: number; r: number; spring: number; low: number }[] = [];
  for (let i = 0; i < br.spans; i++) {
    const cx = br.x0 + span * (i + 0.5);
    const r = (span - opts.pier) / 2;
    const spring = crown - r;
    const low = opts.bottom(cx) - 2;
    arches.push({ cx, r, spring, low });
    const X = v.sx(cx);
    const R = r * v.scale;
    c.moveTo(v.sx(cx - r), v.sy(low));
    c.lineTo(v.sx(cx - r), v.sy(spring));
    c.arc(X, v.sy(spring), R, Math.PI, 0);
    c.lineTo(v.sx(cx + r), v.sy(low));
    c.closePath();
    if (opts.tiers > 1) {
      // lower tier of smaller arches (tall viaducts)
      const r2 = r * 0.8;
      const spring2 = spring - r * 2.6;
      if (spring2 - r2 > opts.bottom(cx) + 1) {
        arches[arches.length - 1].low = spring2 + r2;
      }
    }
  }
  c.fillStyle = tex?.get('stone', v, 0.9) ?? '#a59c8e';
  c.fill('evenodd');
  // shading: lit from the left, darker towards the bottom
  const g = c.createLinearGradient(0, v.sy(crown), 0, v.sy(br.floorY));
  g.addColorStop(0, 'rgba(255,245,225,0.06)');
  g.addColorStop(1, 'rgba(20,20,40,0.45)');
  c.fillStyle = g;
  c.fill('evenodd');
  c.strokeStyle = INK;
  c.lineWidth = lw(v, 0.8);
  c.stroke();
  // voussoirs + keystones
  for (const a of arches) {
    const X = v.sx(a.cx);
    const Y = v.sy(a.spring);
    const R = a.r * v.scale;
    const ring = Math.max(4, v.scale * 0.5);
    c.beginPath();
    c.arc(X, Y, R + ring, Math.PI, 0);
    c.arc(X, Y, R, 0, Math.PI, true);
    c.closePath();
    c.fillStyle = 'rgba(235,225,205,0.35)';
    c.fill();
    c.strokeStyle = 'rgba(28,26,43,0.6)';
    c.lineWidth = Math.max(1, v.scale * 0.025);
    const n = Math.max(7, Math.round(a.r * 2.2));
    c.beginPath();
    for (let k = 1; k < n; k++) {
      const ang = Math.PI + (Math.PI * k) / n;
      c.moveTo(X + Math.cos(ang) * R, Y + Math.sin(ang) * R);
      c.lineTo(X + Math.cos(ang) * (R + ring), Y + Math.sin(ang) * (R + ring));
    }
    c.stroke();
    c.fillStyle = '#e6dccb';
    c.fillRect(X - ring * 0.35, Y - R - ring, ring * 0.7, ring * 1.05);
    c.strokeRect(X - ring * 0.35, Y - R - ring, ring * 0.7, ring * 1.05);
    // inner shadow of the arch (soffit)
    c.beginPath();
    c.arc(X, Y, R, Math.PI, 0);
    c.lineTo(X + R, v.sy(a.low));
    c.lineTo(X + R - v.scale * 0.35, v.sy(a.low));
    c.lineTo(X + R - v.scale * 0.35, Y);
    c.arc(X, Y, R - v.scale * 0.35, 0, Math.PI, true);
    c.closePath();
    c.fillStyle = 'rgba(20,20,40,0.35)';
    c.fill();
  }
  c.restore();
}

function stone(c: CanvasRenderingContext2D, v: View, w: World, br: Bridge, tex: Textures | null): void {
  archedBody(c, v, w, br, tex, {
    pier: 1.6,
    crownDrop: 1.1,
    bottom: (x) => Math.min(w.visualAt(x), br.floorY + 0.5) - 1,
    ext: 1.2,
    tiers: 1,
  });
  deckBand(c, v, w, br, tex?.get('stone', v, 0.35) ?? '#b8ae9e', '#8f8576');
  // low front curb
  const bandPx = BAND * v.scale;
  c.beginPath();
  for (let x = br.x0 - 0.5; x <= br.x1 + 0.5; x += 0.25) {
    const X = v.sx(x);
    const Y = v.sy(w.heightAt(x)) + bandPx * 0.2;
    if (x === br.x0 - 0.5) c.moveTo(X, Y);
    else c.lineTo(X, Y);
  }
  c.strokeStyle = '#d9d2c4';
  c.lineWidth = v.scale * 0.1;
  c.stroke();
}

function viaduct(c: CanvasRenderingContext2D, v: View, w: World, br: Bridge, tex: Textures | null): void {
  archedBody(c, v, w, br, tex, {
    pier: 2.2,
    crownDrop: 1.3,
    bottom: (x) => w.visualAt(x) - 1.5,
    ext: 3,
    tiers: 1,
  });
  // pier cutwaters / pilasters, lit side
  const L = br.x1 - br.x0;
  const span = L / br.spans;
  for (let i = 1; i < br.spans; i++) {
    const px = br.x0 + span * i;
    const top = w.heightAt(px) - 1.3;
    const bottom = w.visualAt(px) - 1.5;
    const X = v.sx(px);
    c.fillStyle = 'rgba(255,240,215,0.18)';
    c.fillRect(X - v.scale * 1.1, v.sy(top), v.scale * 0.5, v.sy(bottom) - v.sy(top));
    c.fillStyle = 'rgba(20,20,40,0.2)';
    c.fillRect(X + v.scale * 0.6, v.sy(top), v.scale * 0.5, v.sy(bottom) - v.sy(top));
  }
  deckBand(c, v, w, br, tex?.get('stone', v, 0.35) ?? '#b8ae9e', '#8f8576');
  // cornice under the deck
  const bandPx = BAND * v.scale;
  c.beginPath();
  for (let x = br.x0 - 3; x <= br.x1 + 3; x += 0.5) {
    const X = v.sx(x);
    const Y = v.sy(w.heightAt(x)) + bandPx * 0.75;
    if (x === br.x0 - 3) c.moveTo(X, Y);
    else c.lineTo(X, Y);
  }
  c.strokeStyle = INK;
  c.lineWidth = v.scale * 0.22 + lw(v);
  c.stroke();
  c.strokeStyle = '#cfc6b6';
  c.lineWidth = v.scale * 0.22;
  c.stroke();
}

// ---------------------------------------------------------------- iron

const STEEL = '#b4472f';
const STEEL_D = '#7d2f22';

function member(c: CanvasRenderingContext2D, v: View, ax: number, ay: number, bx: number, by: number, width: number, color: string): void {
  c.beginPath();
  c.moveTo(v.sx(ax), v.sy(ay));
  c.lineTo(v.sx(bx), v.sy(by));
  c.strokeStyle = INK;
  c.lineWidth = width * v.scale + lw(v) * 1.6;
  c.stroke();
  c.strokeStyle = color;
  c.lineWidth = width * v.scale;
  c.stroke();
}

function truss(c: CanvasRenderingContext2D, v: View, w: World, br: Bridge): void {
  // far-side truss: behind the rider, drawn darker (in the shade)
  const lift = BAND * 0.9; // far edge of the deck
  const H = 3.4;
  const L = br.x1 - br.x0;
  const spanLen = L / br.spans;
  c.save();
  c.globalAlpha = 0.92;
  for (let s = 0; s < br.spans; s++) {
    const sx0 = br.x0 + s * spanLen;
    const panels = Math.max(4, Math.round(spanLen / 3));
    const pw = spanLen / panels;
    const y = (x: number) => w.heightAt(x) + lift;
    const topY = (x: number) => {
      const u = (x - sx0) / spanLen;
      return y(x) + H * (0.75 + 0.25 * Math.sin(Math.PI * u)); // slightly curved top chord
    };
    for (let p = 0; p < panels; p++) {
      const xa = sx0 + p * pw;
      const xb = xa + pw;
      member(c, v, xa, topY(xa), xb, topY(xb), 0.22, STEEL_D);
      member(c, v, xa, y(xa), xa, topY(xa), 0.14, STEEL_D);
      if (p < panels / 2) member(c, v, xa, topY(xa), xb, y(xb), 0.1, STEEL_D);
      else member(c, v, xa, y(xa), xb, topY(xb), 0.1, STEEL_D);
    }
    member(c, v, sx0 + spanLen, y(sx0 + spanLen), sx0 + spanLen, topY(sx0 + spanLen), 0.14, STEEL_D);
    member(c, v, sx0, y(sx0), sx0 + spanLen, y(sx0 + spanLen), 0.18, STEEL_D);
  }
  c.restore();
}

function iron(c: CanvasRenderingContext2D, v: View, w: World, br: Bridge, tex: Textures | null): void {
  const L = br.x1 - br.x0;
  const spanLen = L / br.spans;
  const bandPx = BAND * v.scale;
  // stone piers and abutments down to the ravine floor
  for (let s = 0; s <= br.spans; s++) {
    const px = br.x0 + s * spanLen;
    const edge = s === 0 || s === br.spans;
    const wdt = edge ? 2.4 : 1.8;
    const top = w.heightAt(px) - 0.6;
    const bottom = Math.min(w.visualAt(px), br.floorY + 0.5) - 1.5;
    const X0 = v.sx(px - wdt / 2);
    const X1 = v.sx(px + wdt / 2);
    c.beginPath();
    c.moveTo(X0, v.sy(top));
    c.lineTo(X1, v.sy(top));
    c.lineTo(X1 + v.scale * 0.3, v.sy(bottom));
    c.lineTo(X0 - v.scale * 0.3, v.sy(bottom));
    c.closePath();
    c.fillStyle = tex?.get('stone', v, 0.7) ?? '#a59c8e';
    c.fill();
    c.fillStyle = 'rgba(20,20,40,0.28)';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = lw(v, 0.8);
    c.stroke();
  }
  // deck: steel plates with planks
  deckBand(c, v, w, br, '#8c6b4d', STEEL_D);
  for (let x = br.x0; x < br.x1; x += 0.6) {
    const X = v.sx(x);
    c.strokeStyle = 'rgba(40,25,15,0.45)';
    c.lineWidth = Math.max(1, v.scale * 0.02);
    c.beginPath();
    c.moveTo(X, v.sy(w.heightAt(x)) - bandPx);
    c.lineTo(X, v.sy(w.heightAt(x)) + bandPx * 0.2);
    c.stroke();
  }
  // main girder under the deck (front side), with rivets
  const gTop = (x: number) => v.sy(w.heightAt(x)) + bandPx * 0.2;
  const gH = 0.9 * v.scale;
  c.beginPath();
  c.moveTo(v.sx(br.x0 - 0.4), gTop(br.x0 - 0.4));
  for (let x = br.x0; x <= br.x1 + 0.4; x += 0.5) c.lineTo(v.sx(x), gTop(x));
  for (let x = br.x1 + 0.4; x >= br.x0 - 0.4; x -= 0.5) c.lineTo(v.sx(x), gTop(x) + gH);
  c.closePath();
  const gg = c.createLinearGradient(0, gTop(br.x0), 0, gTop(br.x0) + gH);
  gg.addColorStop(0, '#d0603f');
  gg.addColorStop(1, STEEL_D);
  c.fillStyle = gg;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = lw(v, 0.8);
  c.stroke();
  c.fillStyle = 'rgba(255,220,190,0.75)';
  for (let x = br.x0; x <= br.x1; x += 0.45) {
    const X = v.sx(x);
    const Y = gTop(x);
    const r = Math.max(1, v.scale * 0.035);
    c.beginPath();
    c.arc(X, Y + gH * 0.18, r, 0, Math.PI * 2);
    c.arc(X, Y + gH * 0.82, r, 0, Math.PI * 2);
    c.fill();
  }
  // vertical stiffeners
  for (let x = br.x0; x <= br.x1; x += 2) {
    c.fillStyle = STEEL;
    c.fillRect(v.sx(x) - v.scale * 0.05, gTop(x), v.scale * 0.1, gH);
  }
  // front railing (thin)
  for (let x = br.x0; x <= br.x1; x += 1.5) member(c, v, x, w.heightAt(x) - 0.1, x, w.heightAt(x) + 0.9, 0.05, STEEL);
  c.beginPath();
  for (let x = br.x0; x <= br.x1; x += 0.5) {
    const X = v.sx(x);
    const Y = v.sy(w.heightAt(x) + 0.9);
    if (x === br.x0) c.moveTo(X, Y);
    else c.lineTo(X, Y);
  }
  c.strokeStyle = INK;
  c.lineWidth = v.scale * 0.08 + lw(v);
  c.stroke();
  c.strokeStyle = STEEL;
  c.lineWidth = v.scale * 0.08;
  c.stroke();
}
