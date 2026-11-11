import { clamp } from '../core/math';
import type { AtlasFrame, Assets } from '../assets';
import type { Bike, Wheel } from '../physics/bike';

/**
 * Bike + rider drawn from the hand-made pose atlas.
 *
 * - The pose (rider position) is picked among ~90 frames from the balance input, the
 *   suspension compression and the flight state, with hysteresis and a short cross-fade so
 *   transitions stay fluid.
 * - Wheels, swing arm and the lower fork legs are NOT taken from the sprites: they are drawn
 *   at the physics positions, so every bit of suspension travel is visible.
 */

type V = [number, number];

/** Physics rest positions of the axles in the chassis frame (static sag, lean 0). */
const R0: V = [-0.684, -0.484];
const F0: V = [0.818, -0.468];
const WHEELBASE = F0[0] - R0[0];
/** Half of the painted perspective tilt is removed so wheels touch the ground. */
const TILT_FIX = 0.5;

interface FrameXf {
  f: AtlasFrame;
  k: number; // metres per atlas pixel
  mx: number; // axle midpoint (atlas px)
  my: number;
  rot: number;
  rear: V; // painted axle positions in chassis metres
  front: V;
  pivot: V;
  forkTop: V;
  hx: number;
  hy: number;
}

export class BikeSprite {
  private frames: FrameXf[] = [];
  private atlas: HTMLImageElement;
  private wheelImg: HTMLCanvasElement;
  private current = 0;
  private previous = 0;
  private fade = 1; // 0..1 cross-fade progress towards `current`
  private hold = 0; // minimum time before another switch
  private hxRange: [number, number] = [0, 1];
  private hyRange: [number, number] = [0, 1];
  private crouch = 0;

  constructor(assets: Assets) {
    this.atlas = assets.atlas;
    for (const f of assets.frames) this.frames.push(this.prepare(f));
    const hx = this.frames.map((f) => f.hx).sort((a, b) => a - b);
    const hy = this.frames.map((f) => f.hy).sort((a, b) => a - b);
    const q = (a: number[], t: number) => a[Math.floor(t * (a.length - 1))];
    this.hxRange = [q(hx, 0.04), q(hx, 0.96)];
    this.hyRange = [q(hy, 0.06), q(hy, 0.94)];
    this.current = this.previous = this.pick(0, 0.5, 0);
    this.wheelImg = makeWheel(256);
  }

  private prepare(f: AtlasFrame): FrameXf {
    const L = f.front[0] - f.rear[0];
    const k = WHEELBASE / L;
    const mx = (f.rear[0] + f.front[0]) / 2;
    const my = (f.rear[1] + f.front[1]) / 2;
    const tilt = Math.atan2(f.front[1] - f.rear[1], L);
    const rot = tilt * TILT_FIX; // counter-clockwise in the y-up chassis frame
    const mid0: V = [(R0[0] + F0[0]) / 2, (R0[1] + F0[1]) / 2];
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const map = (p: [number, number]): V => {
      const x = (p[0] - mx) * k;
      const y = -(p[1] - my) * k;
      return [mid0[0] + x * cs - y * sn, mid0[1] + x * sn + y * cs];
    };
    return {
      f,
      k,
      mx,
      my,
      rot,
      rear: map(f.rear),
      front: map(f.front),
      pivot: map(f.pivot),
      forkTop: map(f.forkTop),
      hx: f.helmet[0],
      hy: f.helmet[1],
    };
  }

  /** Choose the frame closest to the wanted rider position. */
  private pick(lean: number, height: number, cur: number): number {
    const tx = this.hxRange[0] + (lean * 0.5 + 0.5) * (this.hxRange[1] - this.hxRange[0]);
    const ty = this.hyRange[0] + height * (this.hyRange[1] - this.hyRange[0]);
    const sx = (this.hxRange[1] - this.hxRange[0]) * 0.18;
    const sy = (this.hyRange[1] - this.hyRange[0]) * 0.35;
    let best = cur;
    let bestD = Infinity;
    let curD = Infinity;
    for (let i = 0; i < this.frames.length; i++) {
      const fr = this.frames[i];
      const d = ((fr.hx - tx) / sx) ** 2 + ((fr.hy - ty) / sy) ** 2;
      if (i === cur) curD = d;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    // hysteresis: keep the current pose unless the new one is clearly better
    return curD - bestD < 0.25 ? cur : best;
  }

  update(bike: Bike, dt: number): void {
    // Rider height: tall when extended / in the air, crouched when the suspension loads up.
    const comp = (bike.rear.compression + bike.front.compression) / 2;
    const targetCrouch = clamp((comp - 0.2) * 1.6, 0, 1) * (bike.grounded ? 1 : 0.3);
    this.crouch += (targetCrouch - this.crouch) * (1 - Math.exp(-10 * dt));
    const height = clamp(0.75 - this.crouch * 0.85 + (bike.grounded ? 0 : 0.1), 0, 1);
    this.hold -= dt;
    if (this.hold <= 0) {
      const next = this.pick(bike.lean, height, this.current);
      if (next !== this.current) {
        this.previous = this.current;
        this.current = next;
        this.fade = 0;
        this.hold = 0.06;
      }
    }
    this.fade = Math.min(1, this.fade + dt / 0.09);
  }

  /** ctx must be translated to the chassis origin on screen (not rotated). */
  draw(ctx: CanvasRenderingContext2D, bike: Bike, scale: number): void {
    const c = ctx;
    c.save();
    c.rotate(-bike.angle);
    c.scale(scale, -scale);
    const [ox, oy] = bike.pointWorld(0, 0);
    const cs = Math.cos(-bike.angle);
    const sn = Math.sin(-bike.angle);
    const toLocal = (w: Wheel): V => {
      const dx = w.x - ox;
      const dy = w.y - oy;
      return [dx * cs - dy * sn, dx * sn + dy * cs];
    };
    const rPhys = toLocal(bike.rear);
    const fPhys = toLocal(bike.front);
    const fr = this.frames[this.current];
    // suspension offsets relative to the rest pose, applied to the painted axle positions
    const rear: V = [fr.rear[0] + rPhys[0] - R0[0], fr.rear[1] + rPhys[1] - R0[1]];
    const front: V = [fr.front[0] + fPhys[0] - F0[0], fr.front[1] + fPhys[1] - F0[1]];
    const px = 1 / scale; // one screen pixel in metres

    this.drawWheel(c, rear, bike.rear);
    this.drawSwingArm(c, fr.pivot, rear, px);
    this.drawWheel(c, front, bike.front);
    if (this.fade < 1 && this.previous !== this.current) {
      this.drawFrame(c, this.frames[this.previous], 1);
      this.drawFrame(c, fr, this.fade);
    } else {
      this.drawFrame(c, fr, 1);
    }
    this.drawFork(c, fr.forkTop, front, bike.front, px);
    c.restore();
  }

  private drawFrame(c: CanvasRenderingContext2D, fr: FrameXf, alpha: number): void {
    const f = fr.f;
    const mid0: V = [(R0[0] + F0[0]) / 2, (R0[1] + F0[1]) / 2];
    c.save();
    c.globalAlpha = alpha;
    c.translate(mid0[0], mid0[1]);
    c.rotate(fr.rot);
    c.scale(fr.k, -fr.k);
    c.drawImage(this.atlas, f.x, f.y, f.w, f.h, f.x - fr.mx, f.y - fr.my, f.w, f.h);
    c.restore();
  }

  private drawWheel(c: CanvasRenderingContext2D, p: V, w: Wheel): void {
    const r = w.radius;
    c.save();
    c.translate(p[0], p[1]);
    c.rotate(w.angle);
    c.drawImage(this.wheelImg, -r, -r, r * 2, r * 2);
    c.restore();
  }

  private drawSwingArm(c: CanvasRenderingContext2D, pivot: V, axle: V, px: number): void {
    const dx = axle[0] - pivot[0];
    const dy = axle[1] - pivot[1];
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    const w0 = 0.06;
    const w1 = 0.04;
    const poly = (o: number) => {
      c.beginPath();
      c.moveTo(pivot[0] + nx * (w0 + o), pivot[1] + ny * (w0 + o));
      c.lineTo(axle[0] + nx * (w1 + o), axle[1] + ny * (w1 + o));
      c.lineTo(axle[0] - nx * (w1 + o), axle[1] - ny * (w1 + o));
      c.lineTo(pivot[0] - nx * (w0 + o), pivot[1] - ny * (w0 + o));
      c.closePath();
    };
    // chain (behind)
    c.strokeStyle = '#3b3532';
    c.lineWidth = 0.022;
    c.beginPath();
    c.moveTo(pivot[0] + 0.05, pivot[1] + 0.07);
    c.lineTo(axle[0], axle[1] + 0.09);
    c.moveTo(pivot[0] + 0.05, pivot[1] - 0.06);
    c.lineTo(axle[0], axle[1] - 0.08);
    c.stroke();
    poly(px * 1.5);
    c.fillStyle = '#2a2326';
    c.fill();
    poly(0);
    const g = c.createLinearGradient(pivot[0] + nx * w0, pivot[1] + ny * w0, pivot[0] - nx * w0, pivot[1] - ny * w0);
    g.addColorStop(0, '#e9ecf2');
    g.addColorStop(0.45, '#aeb3bd');
    g.addColorStop(1, '#6d717c');
    c.fillStyle = g;
    c.fill();
    // axle block + pivot bolt
    c.fillStyle = '#c9ccd4';
    c.strokeStyle = '#2a2326';
    c.lineWidth = px * 1.2;
    c.beginPath();
    c.arc(axle[0], axle[1], 0.045, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.arc(pivot[0], pivot[1], 0.035, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }

  /** Lower fork legs: chrome inner tube sliding in the gold outer tube, down to the axle. */
  private drawFork(c: CanvasRenderingContext2D, top: V, axle: V, w: Wheel, px: number): void {
    const dx = axle[0] - top[0];
    const dy = axle[1] - top[1];
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    // exposed chrome = current extension of the fork (s) scaled to look right
    const chrome = clamp(0.08 + w.s * 0.9, 0.08, len * 0.7);
    const split: V = [axle[0] - ux * chrome, axle[1] - uy * chrome];
    const tube = (a: V, b: V, width: number, color: string) => {
      c.beginPath();
      c.moveTo(a[0], a[1]);
      c.lineTo(b[0], b[1]);
      c.strokeStyle = '#2a2326';
      c.lineWidth = width + px * 2.4;
      c.lineCap = 'round';
      c.stroke();
      c.strokeStyle = color;
      c.lineWidth = width;
      c.stroke();
    };
    tube(split, axle, 0.045, '#e8edf4');
    // chrome highlight
    c.beginPath();
    c.moveTo(split[0] - uy * 0.008, split[1] + ux * 0.008);
    c.lineTo(axle[0] - uy * 0.008, axle[1] + ux * 0.008);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 0.01;
    c.stroke();
    tube(top, split, 0.066, '#e5a12a');
    c.beginPath();
    c.moveTo(top[0] - uy * 0.016, top[1] + ux * 0.016);
    c.lineTo(split[0] - uy * 0.016, split[1] + ux * 0.016);
    c.strokeStyle = 'rgba(255,236,170,0.8)';
    c.lineWidth = 0.012;
    c.stroke();
    // fork seal ring and axle lug
    tube([split[0] - ux * 0.02, split[1] - uy * 0.02], [split[0] + ux * 0.012, split[1] + uy * 0.012], 0.075, '#26222a');
    tube([axle[0] - ux * 0.07, axle[1] - uy * 0.07], axle, 0.06, '#3a353d');
    c.beginPath();
    c.arc(axle[0], axle[1], 0.035, 0, Math.PI * 2);
    c.fillStyle = '#c9ccd4';
    c.fill();
  }
}

/** High-resolution knobby wheel in the style of the sprites (brown tyre, silver rim). */
function makeWheel(size: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  const R = size / 2;
  c.translate(R, R);
  const ink = '#221c1c';
  // tyre with knobs
  const knobs = 26;
  c.beginPath();
  for (let i = 0; i < knobs * 2; i++) {
    const a = (i / (knobs * 2)) * Math.PI * 2;
    const r = i % 2 ? R * 0.955 : R * 0.995;
    const a2 = a + Math.PI / (knobs * 2);
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    c.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
  }
  c.closePath();
  const tg = c.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.2, 0, 0, R);
  tg.addColorStop(0, '#5a4c44');
  tg.addColorStop(0.75, '#3c322d');
  tg.addColorStop(1, '#241d1a');
  c.fillStyle = tg;
  c.fill();
  c.lineWidth = size * 0.012;
  c.strokeStyle = ink;
  c.stroke();
  // knob highlights
  c.fillStyle = 'rgba(160,140,125,0.35)';
  for (let i = 0; i < knobs; i++) {
    const a = (i / knobs) * Math.PI * 2;
    c.save();
    c.rotate(a);
    c.fillRect(R * 0.86, -size * 0.012, R * 0.1, size * 0.024);
    c.restore();
  }
  // sidewall
  c.beginPath();
  c.arc(0, 0, R * 0.8, 0, Math.PI * 2);
  c.fillStyle = '#2c2522';
  c.fill();
  c.beginPath();
  c.arc(0, 0, R * 0.79, Math.PI * 0.95, Math.PI * 1.45);
  c.strokeStyle = 'rgba(255,255,255,0.12)';
  c.lineWidth = size * 0.02;
  c.stroke();
  // rim
  c.beginPath();
  c.arc(0, 0, R * 0.7, 0, Math.PI * 2);
  c.lineWidth = size * 0.07;
  const rg = c.createLinearGradient(-R, -R, R, R);
  rg.addColorStop(0, '#f2f4f8');
  rg.addColorStop(0.5, '#a9afba');
  rg.addColorStop(1, '#6e7480');
  c.strokeStyle = rg;
  c.stroke();
  c.beginPath();
  c.arc(0, 0, R * 0.665, 0, Math.PI * 2);
  c.lineWidth = size * 0.008;
  c.strokeStyle = ink;
  c.stroke();
  c.beginPath();
  c.arc(0, 0, R * 0.735, 0, Math.PI * 2);
  c.stroke();
  // spokes (crossed lacing)
  c.strokeStyle = '#cfd4dc';
  c.lineWidth = size * 0.007;
  c.beginPath();
  const n = 32;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const off = i % 2 ? 0.42 : -0.42;
    c.moveTo(Math.cos(a + off) * R * 0.11, Math.sin(a + off) * R * 0.11);
    c.lineTo(Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66);
  }
  c.stroke();
  // brake disc + hub
  c.beginPath();
  c.arc(0, 0, R * 0.3, 0, Math.PI * 2);
  c.fillStyle = 'rgba(175,180,190,0.92)';
  c.fill();
  c.lineWidth = size * 0.008;
  c.strokeStyle = ink;
  c.stroke();
  c.fillStyle = '#6c7280';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.beginPath();
    c.arc(Math.cos(a) * R * 0.22, Math.sin(a) * R * 0.22, size * 0.012, 0, Math.PI * 2);
    c.fill();
  }
  c.beginPath();
  c.arc(0, 0, R * 0.12, 0, Math.PI * 2);
  const hg = c.createRadialGradient(-R * 0.04, -R * 0.04, 0, 0, 0, R * 0.12);
  hg.addColorStop(0, '#ffb067');
  hg.addColorStop(1, '#d4580e');
  c.fillStyle = hg;
  c.fill();
  c.stroke();
  return cv;
}
