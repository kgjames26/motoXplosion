import { clamp } from '../core/math';
import type { Bike, Wheel } from '../physics/bike';
import { INK } from './palette';

/**
 * Procedural cel-shaded motocross bike and rider, drawn in the chassis frame (metres, y up).
 * Suspension parts are positioned from the physics state so compression is visible:
 * upside-down fork with sliding chrome tubes, swing arm and coil-over rear shock.
 */

const ORANGE = '#ff7a1a';
const ORANGE_D = '#d4540a';
const ORANGE_L = '#ffa552';
const WHITE = '#f6f6f2';
const BLACK = '#2a2833';
const CHROME = '#dfe4ee';
const ALU = '#b9bfcc';
const GOLD = '#f0a92e';

type V = [number, number];

const FORK_AXIS: V = [Math.sin((27 * Math.PI) / 180), -Math.cos((27 * Math.PI) / 180)];
const UPPER_CLAMP: V = [0.496, 0.166];
const PIVOT: V = [-0.1, -0.3];
const SHOCK_TOP: V = [-0.2, 0.06];
const PEG: V = [-0.08, -0.36];
const GRIP: V = [0.4, 0.36];

export interface RiderPose {
  hip: V;
  knee: V;
  foot: V;
  shoulder: V;
  elbow: V;
  hand: V;
  head: V;
  headAngle: number;
}

/** Two-bone IK: joint between a and b with segment lengths l1, l2. side picks the bend. */
function ik(a: V, b: V, l1: number, l2: number, side: number): V {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let d = Math.hypot(dx, dy);
  d = clamp(d, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const ang = Math.atan2(dy, dx) + side * Math.acos(clamp(cosA, -1, 1));
  return [a[0] + Math.cos(ang) * l1, a[1] + Math.sin(ang) * l1];
}

export function riderPose(lean: number, airborne: boolean, compression: number): RiderPose {
  const crouch = compression * 0.08 + (airborne ? -0.03 : 0);
  const hip: V = [-0.3 + lean * 0.2, 0.22 - Math.abs(lean) * 0.04 - crouch];
  const shoulder: V = [hip[0] + 0.2 + lean * 0.17, hip[1] + 0.42 - Math.max(0, lean) * 0.08];
  const head: V = [shoulder[0] + 0.1 + lean * 0.04, shoulder[1] + 0.17];
  const foot = PEG;
  const knee = ik(hip, foot, 0.44, 0.45, -1);
  const hand = GRIP;
  const elbow = ik(shoulder, hand, 0.29, 0.29, 1);
  return { hip, knee, foot, shoulder, elbow, hand, head, headAngle: lean * 0.15 };
}

/** Curled-up pose of the rider tumbling after a crash (centred on the hip). */
export function tumblePose(): RiderPose {
  return {
    hip: [0, 0],
    knee: [0.3, 0.2],
    foot: [0.1, -0.2],
    shoulder: [0.05, 0.42],
    elbow: [0.32, 0.38],
    hand: [0.42, 0.18],
    head: [0.14, 0.6],
    headAngle: 0.3,
  };
}

export class BikeRenderer {
  private lw = 0.03; // outline width in metres (set per frame)

  /**
   * Draw bike and rider. `scale` = pixels per metre; ctx must be at the chassis origin (screen),
   * not rotated. Wheels are passed in chassis-local coordinates.
   */
  draw(ctx: CanvasRenderingContext2D, bike: Bike, scale: number, riderOn: boolean): void {
    this.lw = 2.2 / scale;
    const c = ctx;
    c.save();
    c.rotate(-bike.angle);
    c.scale(scale, -scale);
    c.lineJoin = 'round';
    c.lineCap = 'round';

    const [ox, oy] = bike.pointWorld(0, 0);
    const toLocal = (w: Wheel): V => {
      const dx = w.x - ox;
      const dy = w.y - oy;
      const cs = Math.cos(-bike.angle);
      const sn = Math.sin(-bike.angle);
      return [dx * cs - dy * sn, dx * sn + dy * cs];
    };
    const R = toLocal(bike.rear);
    const F = toLocal(bike.front);
    const pose = riderPose(bike.lean, !bike.grounded, (bike.rear.compression + bike.front.compression) / 2);

    // far-side details (darker)
    if (riderOn) this.limb(c, pose.shoulder, ik(pose.shoulder, GRIP, 0.29, 0.29, 1), GRIP, ORANGE_D, 0.11);
    this.wheel(c, R, bike.rear);
    this.wheel(c, F, bike.front);
    this.swingArm(c, R);
    this.rearShock(c, R);
    this.chassis(c);
    this.fork(c, F);
    this.frontEnd(c);
    if (riderOn) this.rider(c, pose);
    c.restore();
  }

  // ---------------------------------------------------------------- parts

  private poly(c: CanvasRenderingContext2D, pts: V[], fill: string, stroke = true): void {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = INK;
      c.lineWidth = this.lw;
      c.stroke();
    }
  }

  /** Thick tube with outline. */
  private tube(c: CanvasRenderingContext2D, a: V, b: V, w: number, color: string): void {
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
    c.strokeStyle = INK;
    c.lineWidth = w + this.lw * 2;
    c.stroke();
    c.strokeStyle = color;
    c.lineWidth = w;
    c.stroke();
  }

  private limb(c: CanvasRenderingContext2D, a: V, j: V, b: V, color: string, w: number): void {
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.lineTo(j[0], j[1]);
    c.lineTo(b[0], b[1]);
    c.strokeStyle = INK;
    c.lineWidth = w + this.lw * 2;
    c.stroke();
    c.strokeStyle = color;
    c.lineWidth = w;
    c.stroke();
  }

  private wheel(c: CanvasRenderingContext2D, p: V, w: Wheel): void {
    const r = w.radius;
    c.save();
    c.translate(p[0], p[1]);
    // tyre
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fillStyle = '#2b2930';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = this.lw;
    c.stroke();
    // knobs (rotate with the wheel)
    c.rotate(w.angle);
    c.fillStyle = '#3a3742';
    const knobs = 20;
    for (let i = 0; i < knobs; i++) {
      c.save();
      c.rotate((i / knobs) * Math.PI * 2);
      c.fillRect(-0.025, r - 0.01, 0.05, 0.035);
      c.strokeStyle = INK;
      c.lineWidth = this.lw * 0.6;
      c.strokeRect(-0.025, r - 0.01, 0.05, 0.035);
      c.restore();
    }
    // tyre sidewall highlight
    c.beginPath();
    c.arc(0, 0, r * 0.86, Math.PI * 0.6, Math.PI * 1.1);
    c.strokeStyle = 'rgba(255,255,255,0.15)';
    c.lineWidth = 0.025;
    c.stroke();
    // rim
    c.beginPath();
    c.arc(0, 0, r * 0.74, 0, Math.PI * 2);
    c.strokeStyle = BLACK;
    c.lineWidth = 0.045;
    c.stroke();
    c.beginPath();
    c.arc(0, 0, r * 0.74, 0, Math.PI * 2);
    c.strokeStyle = ALU;
    c.lineWidth = 0.022;
    c.stroke();
    // spokes
    c.strokeStyle = '#d7dbe4';
    c.lineWidth = 0.008;
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const a2 = a + (i % 2 ? 0.35 : -0.35);
      c.moveTo(Math.cos(a) * 0.05, Math.sin(a) * 0.05);
      c.lineTo(Math.cos(a2) * r * 0.72, Math.sin(a2) * r * 0.72);
    }
    c.stroke();
    // brake disc
    c.beginPath();
    c.arc(0, 0, r * 0.38, 0, Math.PI * 2);
    c.fillStyle = 'rgba(190,195,205,0.9)';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = this.lw * 0.7;
    c.stroke();
    c.fillStyle = '#7d828f';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      c.beginPath();
      c.arc(Math.cos(a) * r * 0.27, Math.sin(a) * r * 0.27, 0.014, 0, Math.PI * 2);
      c.fill();
    }
    // hub
    c.beginPath();
    c.arc(0, 0, 0.055, 0, Math.PI * 2);
    c.fillStyle = ORANGE;
    c.fill();
    c.strokeStyle = INK;
    c.stroke();
    c.restore();
  }

  private swingArm(c: CanvasRenderingContext2D, R: V): void {
    const dx = R[0] - PIVOT[0];
    const dy = R[1] - PIVOT[1];
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    const w0 = 0.055;
    const w1 = 0.035;
    this.poly(
      c,
      [
        [PIVOT[0] + nx * w0, PIVOT[1] + ny * w0],
        [R[0] + nx * w1, R[1] + ny * w1],
        [R[0] - nx * w1, R[1] - ny * w1],
        [PIVOT[0] - nx * w0, PIVOT[1] - ny * w0],
      ],
      ALU,
    );
    // chain
    c.beginPath();
    c.moveTo(-0.02, -0.27);
    c.lineTo(R[0], R[1] + 0.07);
    c.moveTo(-0.02, -0.35);
    c.lineTo(R[0], R[1] - 0.06);
    c.strokeStyle = '#4b4752';
    c.lineWidth = 0.014;
    c.stroke();
    // sprocket
    c.beginPath();
    c.arc(R[0], R[1], 0.09, 0, Math.PI * 2);
    c.fillStyle = '#5a5662';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = this.lw * 0.7;
    c.stroke();
    // pivot bolt
    c.beginPath();
    c.arc(PIVOT[0], PIVOT[1], 0.03, 0, Math.PI * 2);
    c.fillStyle = CHROME;
    c.fill();
    c.stroke();
  }

  private rearShock(c: CanvasRenderingContext2D, R: V): void {
    const bottom: V = [PIVOT[0] + (R[0] - PIVOT[0]) * 0.32, PIVOT[1] + (R[1] - PIVOT[1]) * 0.32 + 0.03];
    const dx = bottom[0] - SHOCK_TOP[0];
    const dy = bottom[1] - SHOCK_TOP[1];
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    // damper body
    this.tube(c, SHOCK_TOP, [SHOCK_TOP[0] + ux * len * 0.55, SHOCK_TOP[1] + uy * len * 0.55], 0.05, '#3d3a45');
    this.tube(c, [SHOCK_TOP[0] + ux * len * 0.5, SHOCK_TOP[1] + uy * len * 0.5], bottom, 0.025, CHROME);
    // coil spring (compresses with the swing arm)
    const coils = 7;
    c.beginPath();
    for (let i = 0; i <= coils * 2; i++) {
      const t = 0.12 + (i / (coils * 2)) * 0.8;
      const s = i % 2 ? 1 : -1;
      const px = SHOCK_TOP[0] + ux * len * t + nx * s * 0.045;
      const py = SHOCK_TOP[1] + uy * len * t + ny * s * 0.045;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.strokeStyle = INK;
    c.lineWidth = 0.03;
    c.stroke();
    c.strokeStyle = GOLD;
    c.lineWidth = 0.018;
    c.stroke();
  }

  private chassis(c: CanvasRenderingContext2D): void {
    // frame rails
    this.tube(c, [0.46, 0.1], [0.24, -0.42], 0.05, '#5b5866');
    this.tube(c, [0.46, 0.12], [-0.22, 0.04], 0.045, '#5b5866');
    this.tube(c, [-0.22, 0.04], PIVOT, 0.05, '#5b5866');
    this.tube(c, [0.24, -0.42], [-0.06, -0.44], 0.045, '#5b5866');
    // engine
    this.poly(c, [[-0.14, -0.12], [0.26, -0.06], [0.3, -0.3], [0.2, -0.46], [-0.08, -0.46], [-0.18, -0.3]], '#4a4753');
    this.poly(c, [[-0.1, -0.2], [0.16, -0.16], [0.18, -0.3], [-0.08, -0.34]], '#6b6876');
    c.beginPath();
    c.arc(-0.02, -0.33, 0.07, 0, Math.PI * 2);
    c.fillStyle = '#8a8794';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = this.lw;
    c.stroke();
    // cylinder fins
    c.strokeStyle = '#2f2d36';
    c.lineWidth = 0.012;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(0.04 + i * 0.045, -0.08);
      c.lineTo(0.06 + i * 0.045, -0.2);
      c.stroke();
    }
    // exhaust header + silencer
    c.beginPath();
    c.moveTo(0.26, -0.12);
    c.quadraticCurveTo(0.36, -0.3, 0.12, -0.3);
    c.quadraticCurveTo(-0.2, -0.28, -0.34, -0.06);
    c.strokeStyle = INK;
    c.lineWidth = 0.06;
    c.stroke();
    c.strokeStyle = '#c9a77a';
    c.lineWidth = 0.04;
    c.stroke();
    this.poly(c, [[-0.3, -0.02], [-0.86, 0.13], [-0.9, 0.05], [-0.36, -0.12]], ALU);
    this.poly(c, [[-0.86, 0.13], [-0.94, 0.15], [-0.97, 0.06], [-0.9, 0.05]], BLACK);
    // rear fender + side panel
    this.poly(c, [[-0.18, 0.08], [-0.7, 0.14], [-1.06, 0.2], [-1.02, 0.12], [-0.62, 0.0], [-0.24, -0.08]], ORANGE);
    this.poly(c, [[-0.5, 0.11], [-1.0, 0.18], [-0.98, 0.14], [-0.6, 0.06]], ORANGE_L, false);
    // side number plate
    c.save();
    c.beginPath();
    c.ellipse(-0.42, 0.02, 0.15, 0.08, -0.1, 0, Math.PI * 2);
    c.fillStyle = WHITE;
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = this.lw;
    c.stroke();
    this.number(c, -0.42, 0.02, 0.1);
    c.restore();
    // seat
    this.poly(c, [[-0.78, 0.14], [-0.2, 0.17], [0.14, 0.2], [0.16, 0.13], [-0.2, 0.1], [-0.78, 0.08]], BLACK);
    c.beginPath();
    c.moveTo(-0.7, 0.15);
    c.lineTo(0.05, 0.18);
    c.strokeStyle = '#4a4655';
    c.lineWidth = 0.015;
    c.stroke();
    // tank / radiator shroud
    this.poly(c, [[0.08, 0.15], [0.44, 0.2], [0.55, 0.04], [0.36, -0.16], [0.1, -0.06]], ORANGE);
    this.poly(c, [[0.36, -0.16], [0.55, 0.04], [0.5, 0.06], [0.32, -0.08]], ORANGE_D, false);
    this.poly(c, [[0.14, 0.1], [0.42, 0.14], [0.36, 0.06], [0.16, 0.03]], WHITE, false);
    // radiator grill
    c.strokeStyle = '#3a3742';
    c.lineWidth = 0.01;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(0.18 + i * 0.05, -0.02);
      c.lineTo(0.24 + i * 0.05, -0.1);
      c.stroke();
    }
  }

  private fork(c: CanvasRenderingContext2D, F: V): void {
    const [ax, ay] = FORK_AXIS;
    // inner chrome tube slides with compression: from the axle upwards
    const innerTop: V = [F[0] - ax * 0.52, F[1] - ay * 0.52];
    this.tube(c, F, innerTop, 0.04, CHROME);
    // axle lug
    this.tube(c, F, [F[0] - ax * 0.08, F[1] - ay * 0.08], 0.06, BLACK);
    // outer (gold anodised) tube fixed to the triple clamps
    const outerBottom: V = [UPPER_CLAMP[0] + ax * 0.42, UPPER_CLAMP[1] + ay * 0.42];
    this.tube(c, UPPER_CLAMP, outerBottom, 0.062, GOLD);
    c.beginPath();
    c.moveTo(UPPER_CLAMP[0] - 0.012, UPPER_CLAMP[1]);
    c.lineTo(outerBottom[0] - 0.012, outerBottom[1]);
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth = 0.012;
    c.stroke();
    // triple clamps
    this.tube(c, [UPPER_CLAMP[0] - 0.08, UPPER_CLAMP[1] - 0.02], [UPPER_CLAMP[0] + 0.03, UPPER_CLAMP[1]], 0.04, ORANGE_D);
    const lower: V = [UPPER_CLAMP[0] + ax * 0.2, UPPER_CLAMP[1] + ay * 0.2];
    this.tube(c, [lower[0] - 0.08, lower[1]], [lower[0] + 0.03, lower[1]], 0.04, ORANGE_D);
  }

  private frontEnd(c: CanvasRenderingContext2D): void {
    // bars
    this.tube(c, [UPPER_CLAMP[0] - 0.02, UPPER_CLAMP[1]], [GRIP[0] + 0.02, GRIP[1] - 0.04], 0.03, '#3d3a45');
    this.tube(c, [GRIP[0] - 0.06, GRIP[1]], [GRIP[0] + 0.05, GRIP[1] - 0.01], 0.035, ALU);
    this.tube(c, [GRIP[0] - 0.02, GRIP[1]], [GRIP[0] + 0.03, GRIP[1] - 0.005], 0.045, BLACK);
    // front fender (on the lower clamp, does not follow the wheel)
    this.poly(c, [[0.5, -0.02], [0.72, 0.04], [1.02, 0.0], [1.08, -0.06], [0.74, -0.04], [0.54, -0.09]], ORANGE);
    this.poly(c, [[0.74, -0.04], [1.08, -0.06], [1.04, -0.02], [0.74, 0.0]], WHITE, false);
    // front number plate
    this.poly(c, [[0.48, 0.3], [0.64, 0.18], [0.62, 0.0], [0.5, 0.05], [0.44, 0.18]], WHITE);
    this.number(c, 0.54, 0.15, 0.09);
  }

  private number(c: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    c.save();
    c.translate(x, y);
    // Draw at 20px and scale down: tiny font sizes are unreliable in canvas.
    c.scale(size / 20, -size / 20);
    c.font = '900 20px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = INK;
    c.fillText('27', 0, 0);
    c.restore();
  }

  // ---------------------------------------------------------------- rider

  rider(c: CanvasRenderingContext2D, p: RiderPose): void {
    // leg (pants + boot)
    this.limb(c, p.hip, p.knee, [p.foot[0] + 0.02, p.foot[1] + 0.1], ORANGE, 0.17);
    // pants shading
    this.tube(c, [p.hip[0] - 0.02, p.hip[1] - 0.05], [p.knee[0] - 0.03, p.knee[1] - 0.05], 0.05, ORANGE_D);
    // knee pad highlight
    c.beginPath();
    c.arc(p.knee[0] + 0.02, p.knee[1], 0.065, 0, Math.PI * 2);
    c.fillStyle = WHITE;
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = this.lw;
    c.stroke();
    // boot
    const fx = p.foot[0];
    const fy = p.foot[1];
    this.poly(c, [[fx - 0.09, fy + 0.2], [fx + 0.04, fy + 0.22], [fx + 0.06, fy + 0.04], [fx + 0.15, fy - 0.0], [fx + 0.14, fy - 0.05], [fx - 0.1, fy - 0.05]], WHITE);
    this.poly(c, [[fx - 0.1, fy - 0.01], [fx + 0.14, fy - 0.01], [fx + 0.14, fy - 0.05], [fx - 0.1, fy - 0.05]], BLACK, false);
    c.strokeStyle = '#8d8a96';
    c.lineWidth = 0.015;
    c.beginPath();
    c.moveTo(fx - 0.08, fy + 0.13);
    c.lineTo(fx + 0.03, fy + 0.14);
    c.moveTo(fx - 0.08, fy + 0.07);
    c.lineTo(fx + 0.04, fy + 0.08);
    c.stroke();

    // torso (jersey) as a thick tapered shape
    const hx = p.hip[0];
    const hy = p.hip[1];
    const sx = p.shoulder[0];
    const sy = p.shoulder[1];
    const dx = sx - hx;
    const dy = sy - hy;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    const torso: V[] = [
      [hx + nx * 0.13, hy + ny * 0.13],
      [sx + nx * 0.15, sy + ny * 0.15],
      [sx - nx * 0.1 + dx * 0.1, sy - ny * 0.1 + dy * 0.1],
      [hx - nx * 0.14, hy - ny * 0.14],
    ];
    this.poly(c, torso, ORANGE);
    // back stripe + number
    this.poly(
      c,
      [
        [hx + nx * 0.1 + dx * 0.35, hy + ny * 0.1 + dy * 0.35],
        [hx + nx * 0.11 + dx * 0.6, hy + ny * 0.11 + dy * 0.6],
        [hx - nx * 0.02 + dx * 0.6, hy - ny * 0.02 + dy * 0.6],
        [hx - nx * 0.02 + dx * 0.35, hy - ny * 0.02 + dy * 0.35],
      ],
      BLACK,
      false,
    );
    this.poly(
      c,
      [
        [hx + nx * 0.1 + dx * 0.62, hy + ny * 0.1 + dy * 0.62],
        [hx + nx * 0.11 + dx * 0.72, hy + ny * 0.11 + dy * 0.72],
        [hx - nx * 0.0 + dx * 0.72, hy - ny * 0.0 + dy * 0.72],
        [hx - nx * 0.0 + dx * 0.62, hy - ny * 0.0 + dy * 0.62],
      ],
      WHITE,
      false,
    );
    // belt
    this.tube(c, [hx + nx * 0.1, hy + ny * 0.1], [hx - nx * 0.12, hy - ny * 0.12], 0.03, BLACK);

    // near arm
    this.limb(c, [sx + nx * 0.02, sy + ny * 0.02], p.elbow, p.hand, ORANGE, 0.115);
    // elbow pad
    c.beginPath();
    c.arc(p.elbow[0], p.elbow[1], 0.035, 0, Math.PI * 2);
    c.fillStyle = BLACK;
    c.fill();
    // glove
    c.beginPath();
    c.arc(p.hand[0], p.hand[1], 0.055, 0, Math.PI * 2);
    c.fillStyle = BLACK;
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = this.lw;
    c.stroke();

    // helmet
    c.save();
    c.translate(p.head[0], p.head[1]);
    c.rotate(-p.headAngle);
    c.beginPath();
    c.scale(1.18, 1.18);
    c.ellipse(0, 0, 0.15, 0.135, 0, 0, Math.PI * 2);
    c.fillStyle = ORANGE;
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = this.lw;
    c.stroke();
    // shading on the lower back
    c.beginPath();
    c.ellipse(-0.03, -0.04, 0.11, 0.08, 0, 0, Math.PI * 2);
    c.fillStyle = ORANGE_D;
    c.globalAlpha = 0.55;
    c.fill();
    c.globalAlpha = 1;
    // chin guard
    this.poly(c, [[0.06, -0.04], [0.2, -0.06], [0.18, -0.14], [0.02, -0.13]], ORANGE);
    // goggles
    this.poly(c, [[0.04, 0.03], [0.17, 0.02], [0.17, -0.04], [0.05, -0.04]], '#20222e');
    c.fillStyle = '#5fc3ff';
    c.fillRect(0.08, -0.025, 0.07, 0.035);
    // peak
    this.poly(c, [[-0.02, 0.12], [0.24, 0.08], [0.22, 0.04], [0.02, 0.07]], ORANGE);
    // stripe
    c.beginPath();
    c.ellipse(-0.02, 0.02, 0.13, 0.1, 0, Math.PI * 0.55, Math.PI * 1.1);
    c.strokeStyle = WHITE;
    c.lineWidth = 0.02;
    c.stroke();
    c.restore();
  }
}
