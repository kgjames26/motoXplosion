import { clamp, GRAVITY_SCALE } from '../core/math';

/**
 * Circuit 3D — « Nouvelle glisse ».
 *
 * The previous attempt asked the stick for a path curvature, then bolted a tyre model on top
 * and yanked the chassis back onto that path with a yaw damper and hard slip clamps. On loose
 * dirt the rear was already traction-limited, so the friction circle deleted its side grip and
 * the bike either snapped into a spin or fought the rider. This model does not do that.
 *
 * What is integrated, for the player bike only:
 *  - roll, with the real moment (weight wants to fall into the lean, lateral acceleration
 *    stands the bike up). Steady state is the motorcycle one: a_y = g·tan(lean).
 *  - a short rider who can lay the bike over and pick it up, but not hold a lean the tyres
 *    have given up on.
 *  - two tyres. Side force comes from the slip angle (a soft peak, then a dirt plateau — not
 *    a cliff). Drive and brake eat part of that grip and leave a reserve, so opening the
 *    throttle mid-corner moves the rear out instead of deleting it. A spinning rear loses more.
 *  - bars that steer into the turn to hold the lean, and into a slide to catch it. Below
 *    walking pace the stick simply turns the bars.
 *
 * Ancienne glisse does not use this file.
 */

const G = 9.81 * GRAVITY_SCALE;

export const GLISSE = {
  mass: 180,
  /** Yaw inertia (kg·m²). An MX bike is short; too low and a slide becomes a spin. */
  yawInertia: 52,
  cgFront: 0.76,
  cgRear: 0.72,
  /** Roll arm (m). A touch higher than the real CG so a lowside is a mistake, not a frame. */
  cgHeight: 1.05,
  peakSlip: 0.17,
  /** How hard the rider may roll the bike (rad/s²). Physics still wins past this. */
  rollAuthority: 9.5,
  /** Extra drag (m/s²) when the rear is fully spinning. */
  spinDrag: 1.15,
};

export interface GlisseState {
  lean: number;
  leanRate: number;
  body: number;
  yawRate: number;
  lat: number;
  bar: number;
  spin: number;
  slideF: number;
  slideR: number;
  nf: number;
  nr: number;
  mu: number;
}

export interface GlisseCmd {
  /** +1 = rider's right. */
  stick: number;
  throttle: number;
  brake: number;
  /** Forward speed (m/s). */
  v: number;
  grounded: boolean;
  /** Loose-dirt friction, berm not included. */
  mu0: number;
  frontN: number;
  rearN: number;
  frontFx: number;
  rearFx: number;
  /** Ground speed minus wheel speed (m/s). Negative while the rear spins up. */
  rearSlip: number;
  /** Track curvature (1/m), + = bends to the rider's right. */
  trackK: number;
  /** Lateral offset from the centre line (m). */
  n: number;
  dt: number;
  lock: number;
}

export interface GlisseResult {
  /** Direction of travel relative to the track (rad, + = right). */
  psi: number;
  /** Body heading minus travel direction: the rear hanging out. */
  drift: number;
  slide: number;
  /** Forward speed to bleed this frame (m/s, ≥ 0). */
  scrub: number;
}

/** Odd tyre curve: peaks near |x| = 1, then keeps a dirt plateau instead of falling off a cliff. */
function shape(x: number): number {
  const sat = Math.tanh(1.45 * x);
  const mag = Math.abs(x);
  const fall = mag <= 1 ? 1 : 1 - 0.22 * clamp((mag - 1) / 2, 0, 1);
  return sat * fall;
}

function budget(muN: number, Fx: number, spinLoss: number): number {
  if (muN < 1) return 0;
  const u = clamp(Math.abs(Fx) / muN, 0, 1);
  // A full drive still leaves side bite. Zeroing it is what spun the old model out.
  const ell = Math.sqrt(1 - 0.42 * u * u);
  const deep = u > 0.92 ? (u - 0.92) / 0.08 : 0;
  return muN * ell * (1 - 0.18 * deep) * (1 - clamp(spinLoss, 0, 0.55));
}

export function glisseStep(s: GlisseState, c: GlisseCmd): GlisseResult {
  if (!(c.dt > 0) || !Number.isFinite(c.v)) return { psi: s.body, drift: 0, slide: 0, scrub: 0 };

  const m = GLISSE.mass;
  const a = GLISSE.cgFront;
  const b = GLISSE.cgRear;
  const L = a + b;
  const hcg = GLISSE.cgHeight;
  const Iz = GLISSE.yawInertia;
  const v = Math.max(0, c.v);

  if (!c.grounded) {
    s.spin = 0;
    s.slideF *= Math.exp(-c.dt * 6);
    s.slideR *= Math.exp(-c.dt * 6);
    s.nf *= Math.exp(-c.dt * 8);
    s.nr *= Math.exp(-c.dt * 8);
    s.yawRate *= Math.exp(-c.dt * 1.3);
    s.lat *= Math.exp(-c.dt * 1.1);
    s.lean += (c.stick * 0.32 - s.lean) * (1 - Math.exp(-c.dt * 1.5));
    s.leanRate = 0;
    s.bar += (0 - s.bar) * (1 - Math.exp(-c.dt * 3));
    integrateHeading(s, c, v, c.dt);
    return finish(s, v, 0);
  }

  const raw = clamp(c.stick, -1, 1);
  const stick = Math.abs(raw) < 0.045 ? 0 : Math.sign(raw) * ((Math.abs(raw) - 0.045) / 0.955) ** 0.9;
  const leaned = Math.abs(s.lean) > 0.05 ? s.lean : stick;
  const same = c.trackK !== 0 && Math.sign(c.trackK) === Math.sign(leaned);
  const tb = same ? 0.3 * clamp((Math.abs(c.trackK) - 0.012) * 45, 0, 1) : 0;
  const mu0 = clamp(c.mu0, 0.15, 1.6);
  const muB = (mu0 + tb) / Math.max(0.25, 1 - mu0 * tb);
  const muF = muB * 1.06;
  const muR = muB * 0.96;

  const NstatF = m * G * (b / L);
  const NstatR = m * G * (a / L);

  const filt = (cur: number, rawN: number, stat: number): number => {
    const meas = clamp(rawN, 0, 2.4 * stat);
    const rate = meas + 60 < cur ? 14 : 6;
    return cur + (meas - cur) * (1 - Math.exp(-c.dt * rate));
  };
  s.nf = filt(s.nf, c.frontN, NstatF);
  s.nr = filt(s.nr, c.rearN, NstatR);
  if (s.nf + s.nr < 40) {
    s.nf = NstatF;
    s.nr = NstatR;
  }

  const uDrive = clamp(Math.max(0, c.rearFx) / Math.max(50, muR * s.nr), 0, 1.25);
  const leanedIn = clamp(Math.abs(s.lean) / 0.4, 0, 1);
  // A spinning rear on a straight still drives. It gives the tail away once the bike is lent over.
  const slipSpin = c.throttle > 0.22 ? clamp((-c.rearSlip - 0.8) / 5, 0, 1) * (0.35 + 0.65 * leanedIn) : 0;
  const forceSpin =
    c.throttle > 0.7 && uDrive > 0.85 && leanedIn > 0.25
      ? clamp((uDrive - 0.85) / 0.3, 0, 1) * c.throttle * leanedIn
      : 0;
  const spinWant = clamp(Math.max(slipSpin, forceSpin), 0, 1);
  s.spin += (spinWant - s.spin) * (1 - Math.exp(-c.dt * (spinWant > s.spin ? 6 : 5)));
  s.mu += (muB - s.mu) * (1 - Math.exp(-c.dt * 4));

  const dyn = clamp((v - 2) / 4, 0, 1);
  const phiMax = Math.atan(clamp(muB * 0.98, 0.32, 1.15));
  const u = Math.max(v, 1.4);
  // What the tyres can hold right now. The stick may ask for more; a rider on a phone
  // does not, or the lean falls in and the tail comes round.
  const spinLossNow = s.spin * (0.1 + 0.34 * clamp(Math.abs(s.lean) / 0.5, 0, 1));
  const ayMax = (budget(muF * s.nf, c.frontFx, 0) + budget(muR * s.nr, c.rearFx, spinLossNow)) / m;
  const phiHold = Math.atan(clamp((0.92 * ayMax) / G, 0.05, 1.2));
  const asked = Math.abs(stick) * phiMax * (0.18 + 0.82 * dyn);
  const phiDes = Math.sign(stick) * Math.min(asked, Math.max(phiHold, 0.05));

  const steps = Math.min(8, Math.max(1, Math.ceil(c.dt / 0.0045)));
  const h = c.dt / steps;
  // Assume the bike was balanced last frame, so the first substep does not fall over.
  let ay = G * Math.tan(clamp(s.lean, -1, 1));
  let ayRoll = ay;
  let af = 0;
  let ar = 0;
  let Fyf = 0;
  let Fyr = 0;

  for (let i = 0; i < steps; i++) {
    const phiDotCmd = clamp((phiDes - s.lean) * 3.1, -1.7, 1.7);
    const rider = clamp((phiDotCmd - s.leanRate) * 6.5, -GLISSE.rollAuthority, GLISSE.rollAuthority);
    const grav = (G / hcg) * Math.sin(s.lean) - (ayRoll / hcg) * Math.cos(s.lean);
    const phidd = dyn * grav + rider - s.leanRate * (2.4 + 2.2 * (1 - dyn));
    s.leanRate = clamp(s.leanRate + phidd * h, -2.4, 2.4);
    s.lean += s.leanRate * h;
    if (s.lean > 1.02) {
      s.lean = 1.02;
      s.leanRate = Math.min(0, s.leanRate);
    } else if (s.lean < -1.02) {
      s.lean = -1.02;
      s.leanRate = Math.max(0, s.leanRate);
    }

    const rFromLean = (G * Math.tan(clamp(s.lean, -1.02, 1.02))) / u;
    const direct = stick * c.lock;
    const rDes = dyn * rFromLean + (1 - dyn) * ((v * Math.tan(direct)) / L);
    const beta = Math.atan2(s.lat, u);
    let delta =
      Math.atan((L * rDes) / u) +
      clamp((rDes - s.yawRate) * 0.28, -0.2, 0.2) +
      clamp(beta * 0.8, -0.34, 0.34) * dyn;
    delta = dyn * delta + (1 - dyn) * direct;
    delta = clamp(delta, -c.lock, c.lock);
    s.bar += (delta - s.bar) * Math.min(1, h * (10 + 8 * (1 - dyn)));

    const vf = Math.max(u, 1);
    af = Math.atan2(s.lat + a * s.yawRate, vf) - s.bar;
    ar = Math.atan2(s.lat - b * s.yawRate, vf);
    Fyf = -budget(muF * s.nf, c.frontFx, 0) * shape(af / GLISSE.peakSlip);
    const spinLoss = s.spin * (0.1 + 0.34 * clamp(Math.abs(s.lean) / 0.5, 0, 1));
    Fyr = -budget(muR * s.nr, c.rearFx, spinLoss) * shape(ar / GLISSE.peakSlip);
    ay = (Fyf * Math.cos(s.bar) + Fyr) / m;
    ayRoll += (ay - ayRoll) * Math.min(1, h * 16);
    const yawAcc = (a * Fyf * Math.cos(s.bar) - b * Fyr) / Iz - s.yawRate * 0.35;
    const rPath = ay / u;
    let ya = yawAcc;
    const excess = s.yawRate - rPath;
    // Tyre moment that is already opening the slide is shed. The nose stays stepped out; it
    // does not wind up.
    if (ya * excess > 0) ya *= 1 - clamp(Math.abs(excess) / 0.18, 0, 0.9);
    s.lat += (ay - u * s.yawRate) * h;
    s.yawRate += ya * h;
    s.yawRate += (rPath - s.yawRate) * Math.min(1, h * (3.2 + 4 * s.spin));
    // A deep slide scrubs sideways speed and yaws the bike back. Past this the old model
    // pirouetted.
    const maxLat = u * Math.tan(0.5);
    if (Math.abs(s.lat) > maxLat) {
      const over = s.lat - Math.sign(s.lat) * maxLat;
      s.lat -= over * Math.min(1, h * 10);
      s.yawRate += -Math.sign(s.lat) * Math.min(1.2, Math.abs(over)) * 3.5 * h;
    }
    if (Math.abs(stick) < 0.06 && Math.abs(s.lean) < 0.1) s.yawRate *= Math.exp(-h * 2.2);
    integrateHeading(s, c, v, h);
  }

  const kin = (v * Math.tan(clamp(s.bar, -1.2, 1.2))) / L;
  s.yawRate = dyn * s.yawRate + (1 - dyn) * kin;
  s.lat *= dyn;
  if (dyn < 1) s.lean = dyn * s.lean + (1 - dyn) * Math.atan2(ay, G);

  const sF = clamp((Math.abs(af) / GLISSE.peakSlip - 0.82) / 0.75, 0, 1);
  const sR = Math.max(clamp((Math.abs(ar) / GLISSE.peakSlip - 0.72) / 0.7, 0, 1), s.spin * 0.85);
  s.slideF += (sF - s.slideF) * (1 - Math.exp(-c.dt * 8));
  s.slideR += (sR - s.slideR) * (1 - Math.exp(-c.dt * 8));

  const scrubAcc =
    Math.min(6, (Math.abs(Fyf * Math.sin(af)) + Math.abs(Fyr * Math.sin(ar))) / Math.max(1, m)) +
    GLISSE.spinDrag * s.spin +
    0.85 * Math.abs(Math.sin(s.lean));
  return finish(s, v, scrubAcc * c.dt);
}

function integrateHeading(s: GlisseState, c: GlisseCmd, v: number, h: number): void {
  const beta = Math.atan2(s.lat, Math.max(v, 0.6));
  const course = s.body + beta;
  const ds = (v * Math.cos(course)) / Math.max(0.4, 1 - c.n * c.trackK);
  s.body += (s.yawRate - c.trackK * ds) * h;
  if (s.body > 1.5) {
    s.body = Math.min(s.body, 1.6);
    if (s.yawRate > 0.4) s.yawRate += (0.4 - s.yawRate) * Math.min(1, h * 8);
  } else if (s.body < -1.5) {
    s.body = Math.max(s.body, -1.6);
    if (s.yawRate < -0.4) s.yawRate += (-0.4 - s.yawRate) * Math.min(1, h * 8);
  }
}

function finish(s: GlisseState, v: number, scrub: number): GlisseResult {
  const beta = Math.atan2(s.lat, Math.max(v, 0.6));
  const psi = clamp(s.body + beta, -1.1, 1.1);
  return { psi, drift: s.body - psi, slide: Math.max(s.slideF, s.slideR), scrub: Math.max(0, scrub) };
}
