import { clamp, wrapAngle } from '../core/math';
import { Surface, SURFACES } from '../world/types';
import type { World } from '../world/world';
import type { BikeSpec } from '../bikes';

/**
 * Motocross physics, side view (x forward, y up, angles counter-clockwise).
 *
 * Model:
 *  - A rigid chassis (bike frame + rider) with mass, pitch inertia and a centre of gravity that
 *    shifts with the rider's balance input.
 *  - Two wheels, each a point mass sliding on its own suspension axis (fork rake in front,
 *    swing-arm approximated as a linear axis at the rear) with a spring + damper, preload,
 *    top-out and progressive bump-stop.
 *  - Tyres: stiff penalty contact against the terrain polyline (with damping depending on the
 *    surface) and a slip-based traction model. Each wheel has a spin state, so wheelspin,
 *    locked brakes, engine torque reaction (wheelies) and stoppies emerge naturally.
 */

export interface BikeInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  balance: number; // -1 (rear) .. 1 (front)
}

export interface Wheel {
  // configuration
  mountX: number; // mount point in chassis frame (relative to chassis origin)
  mountY: number;
  axisX: number; // suspension axis (unit, chassis frame, pointing down/out)
  axisY: number;
  travel: number; // max compression (m)
  k: number; // spring rate N/m
  preload: number; // N
  cComp: number; // damping in compression N·s/m
  cReb: number; // damping in rebound N·s/m
  radius: number;
  mass: number;
  inertia: number;
  // state
  s: number; // extension along axis from the mount (travel = fully extended)
  sv: number;
  spin: number; // rolling rate (rad/s, positive = rolling forward)
  angle: number; // visual rotation
  // outputs
  x: number;
  y: number;
  contact: boolean;
  normalForce: number;
  slip: number;
  surface: Surface;
  compression: number; // 0..1 for rendering
  bottomed: number; // impact speed when hitting the bump stop this step
}

export interface BikeEvents {
  /** Speed into the ground at the last touchdown (m/s, 0 if none this frame). */
  landing: number;
  /** Bike angle relative to the slope at that touchdown (rad). */
  landingAngle: number;
  crashed: boolean;
}

const G = 9.81;

/**
 * Geometry is expressed relative to the chassis centre of mass, which sits ~0.9 m above the
 * ground at static sag. Wheelbase ~1.48 m, 46 % of the weight on the front.
 */
function makeWheel(front: boolean, spec?: BikeSpec): Wheel {
  // Fork rake ~27°, rear axis slightly inclined like a swing arm under load.
  const rake = front ? (27 * Math.PI) / 180 : (-8 * Math.PI) / 180;
  const tr = spec ? spec.travel : 1;
  const ks = spec ? spec.suspK * (spec.mass / 178) : 1; // keep the sag right for the bike's weight
  const travel = (front ? 0.3 : 0.32) * tr;
  return {
    mountX: front ? 0.7 : -0.646,
    mountY: front ? -0.235 : -0.217,
    axisX: Math.sin(rake),
    axisY: -Math.cos(rake),
    travel,
    k: (front ? 6900 : 7600) * ks / tr,
    preload: (front ? 140 : 150) * ks,
    cComp: (front ? 700 : 800) * Math.sqrt(ks),
    cReb: (front ? 1500 : 1700) * Math.sqrt(ks),
    radius: 0.43, // matches the (slightly cartoon) proportions of the rider sprites
    mass: 11,
    inertia: 1.0,
    s: travel,
    sv: 0,
    spin: 0,
    angle: 0,
    x: 0,
    y: 0,
    contact: false,
    normalForce: 0,
    slip: 0,
    surface: Surface.Dirt,
    compression: 0,
    bottomed: 0,
  };
}

export class Bike {
  // chassis state (origin = nominal centre of mass with neutral balance)
  x = 0;
  y = 0;
  angle = 0;
  vx = 0;
  vy = 0;
  omega = 0;
  readonly mass: number; // frame + engine + rider (wheels separate)
  readonly inertia: number;
  rear: Wheel;
  front: Wheel;
  readonly spec: BikeSpec;
  /** Smoothed rider balance actually applied (-1..1). */
  lean = 0;
  airTime = 0;
  grounded = false;
  crashed = false;
  rpm = 1200;
  private prevVx = 0;
  private prevVy = 0;
  private prevOmega = 0;
  private wasAirborne = 0;
  /** Peak vertical-ish impact recorded during the current landing window. */
  private landingPeak = 0;
  private landingTimer = 0;
  events: BikeEvents = { landing: 0, landingAngle: 0, crashed: false };
  private landingAngle = 0;
  private landingBase = 0;

  // tuning
  readonly maxWheelTorque: number; // N·m at the rear wheel
  readonly power: number; // W at the wheel
  readonly maxSpeed: number; // m/s rev limiter
  readonly brakeTorque: number;
  readonly grip: number;
  readonly airControl: number;

  /** Default values are the Explorer 98 (heavy scrambler, ~97 km/h). */
  constructor(spec: BikeSpec = { power: 30000, torque: 540, maxSpeed: 27, mass: 178, suspK: 1, travel: 1, grip: 1, air: 1, consumption: 1, brakes: 1 }) {
    this.spec = spec;
    this.mass = spec.mass;
    this.inertia = 64 * (spec.mass / 178);
    this.rear = makeWheel(false, spec);
    this.front = makeWheel(true, spec);
    this.maxWheelTorque = spec.torque;
    this.power = spec.power;
    this.maxSpeed = spec.maxSpeed;
    this.brakeTorque = 1100 * spec.brakes;
    this.grip = spec.grip;
    this.airControl = spec.air;
  }

  reset(world: World, x: number): void {
    const slope = world.slopeAt(x);
    this.angle = slope;
    this.x = x;
    this.y = world.heightAt(x) + 1.1;
    this.vx = this.vy = this.omega = 0;
    this.prevVx = this.prevVy = this.prevOmega = 0;
    this.lean = 0;
    this.crashed = false;
    this.airTime = 0;
    for (const w of [this.rear, this.front]) {
      w.s = w.travel * 0.75;
      w.sv = 0;
      w.spin = 0;
    }
    this.updateWheelPositions();
    // Lift until no wheel penetrates.
    for (let i = 0; i < 40; i++) {
      const hr = world.circleContact(this.rear.x, this.rear.y, this.rear.radius);
      const hf = world.circleContact(this.front.x, this.front.y, this.front.radius);
      if (!hr && !hf) break;
      this.y += 0.03;
      this.updateWheelPositions();
    }
  }

  /** Centre-of-mass shift (chassis frame) produced by the rider's weight. */
  private comShift(): [number, number] {
    // Leaning forward moves the mass forward and down, leaning back moves it back and down.
    return [this.lean * 0.2, -Math.abs(this.lean) * 0.05];
  }

  private toWorld(lx: number, ly: number): [number, number] {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    return [this.x + lx * c - ly * s, this.y + lx * s + ly * c];
  }
  private rot(lx: number, ly: number): [number, number] {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    return [lx * c - ly * s, lx * s + ly * c];
  }

  updateWheelPositions(): void {
    const [cx, cy] = this.comShift();
    for (const w of [this.rear, this.front]) {
      const [x, y] = this.toWorld(w.mountX - cx + w.axisX * w.s, w.mountY - cy + w.axisY * w.s);
      w.x = x;
      w.y = y;
    }
  }

  /** Chassis point in world space, relative to the dynamic centre of mass. */
  pointWorld(lx: number, ly: number): [number, number] {
    const [cx, cy] = this.comShift();
    return this.toWorld(lx - cx, ly - cy);
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }
  /** Forward speed along the bike axis (m/s). */
  get forwardSpeed(): number {
    return this.vx * Math.cos(this.angle) + this.vy * Math.sin(this.angle);
  }

  step(world: World, input: BikeInput, dt: number): void {
    // Rider weight transfer is not instantaneous.
    const leanRate = 7;
    this.lean += (input.balance - this.lean) * (1 - Math.exp(-leanRate * dt));

    // Chassis acceleration of the previous step, used for the wheel-relative dynamics.
    // (clamped: a hard impact or a teleport must not kick the wheels through the frame)
    const ax = clamp((this.vx - this.prevVx) / dt, -80, 80);
    const ay = clamp((this.vy - this.prevVy) / dt, -80, 80);
    const alpha = clamp((this.omega - this.prevOmega) / dt, -60, 60);
    this.prevVx = this.vx;
    this.prevVy = this.vy;
    this.prevOmega = this.omega;

    let fx = 0;
    let fy = -this.mass * G;
    let torque = 0;
    const [cx, cy] = this.comShift();

    let anyContact = false;

    // ---- engine
    const rear = this.rear;
    const wheelSpeed = rear.spin * rear.radius;
    let drive = 0;
    if (!this.crashed && input.throttle > 0.01) {
      const powerLimited = (this.power * rear.radius) / Math.max(Math.abs(wheelSpeed), 4);
      const limiter = clamp((this.maxSpeed - wheelSpeed) / 3, 0, 1);
      drive = input.throttle * Math.min(this.maxWheelTorque, powerLimited) * limiter;
    } else {
      // engine braking
      drive = -clamp(rear.spin * 1.6, -40, 40);
    }
    // rpm for audio (shift through virtual gears)
    {
      const v = Math.abs(wheelSpeed);
      const gearTop = [0, 7, 13, 19, 25, 40];
      let g = 1;
      while (g < gearTop.length - 1 && v > gearTop[g]) g++;
      const lo = gearTop[g - 1];
      const hi = gearTop[g];
      const target = 1500 + ((v - lo) / (hi - lo)) * 8000 * (0.6 + 0.4 * input.throttle) + input.throttle * 1500;
      this.rpm += (clamp(target, 1200, 11500) - this.rpm) * (1 - Math.exp(-8 * dt));
    }

    for (const w of [this.rear, this.front]) {
      const isRear = w === this.rear;
      // Suspension geometry in world frame.
      const mlx = w.mountX - cx;
      const mly = w.mountY - cy;
      const [axw, ayw] = this.rot(w.axisX, w.axisY);
      const [rx, ry] = this.rot(mlx + w.axisX * w.s, mly + w.axisY * w.s); // COM → wheel centre
      const wx = this.x + rx;
      const wy = this.y + ry;
      // Wheel centre velocity: chassis point velocity + slide along axis.
      const pvx = this.vx - this.omega * ry;
      const pvy = this.vy + this.omega * rx;
      const wvx = pvx + axw * w.sv;
      const wvy = pvy + ayw * w.sv;

      // ---- suspension force (positive pushes wheel out along the axis)
      const comp = w.travel - w.s; // compression (m)
      // progressive (rising-rate) spring
      let fs = w.preload + w.k * comp * (1 + (1.6 * comp) / w.travel);
      fs -= w.sv < 0 ? w.cComp * w.sv : w.cReb * w.sv;
      // progressive bump stop in the last 15% of travel
      const stopZone = w.travel * 0.15;
      if (w.s < stopZone) fs += ((stopZone - w.s) / stopZone) ** 2 * 9000;
      if (fs < 0 && w.s >= w.travel) fs = 0;

      // ---- tyre contact
      let gx = 0;
      let gy = 0;
      w.contact = false;
      w.normalForce = 0;
      w.slip = 0;
      const hit = world.circleContact(wx, wy, w.radius);
      let wheelTorque = isRear ? drive : 0;
      // brakes: front gets 65 %, rear 35 %
      const brakeT = input.brake * this.brakeTorque * (isRear ? 0.35 : 0.65);
      if (hit) {
        anyContact = true;
        w.contact = true;
        w.surface = hit.surface;
        const surf = SURFACES[hit.surface];
        const nx = hit.nx;
        const ny = hit.ny;
        const vn = wvx * nx + wvy * ny;
        const kT = 70000;
        const cT = 1400 * surf.tireDamp;
        let N = kT * hit.depth - cT * vn;
        if (N < 0) N = 0;
        N = Math.min(N, 60000);
        w.normalForce = N;
        // tangent pointing "forward" along the ground
        const tx = ny;
        const ty = -nx;
        const vt = wvx * tx + wvy * ty;
        const slipV = vt - w.spin * w.radius;
        w.slip = slipV;
        const mu = surf.grip * this.grip;
        let Ft = -mu * N * Math.tanh(slipV / 1.2);
        // rolling resistance
        Ft -= surf.rolling * N * Math.tanh(vt * 2);
        gx = nx * N + tx * Ft;
        gy = ny * N + ty * Ft;
        // traction torque back on the wheel
        wheelTorque -= (Ft + surf.rolling * N * Math.tanh(vt * 2)) * w.radius;
      }

      // ---- wheel spin integration (implicit-ish clamp for brakes)
      let newSpin = w.spin + (wheelTorque / w.inertia) * dt;
      if (brakeT > 0) {
        const dv = (brakeT / w.inertia) * dt;
        if (Math.abs(newSpin) <= dv) newSpin = 0;
        else newSpin -= Math.sign(newSpin) * dv;
      }
      w.spin = clamp(newSpin, -40, 140);
      w.angle -= w.spin * dt;

      // ---- reactions on the chassis
      // engine & brake reaction torque (drive lifts the front)
      const brakeReaction = brakeT > 0 && Math.abs(w.spin) > 0.01 ? -Math.sign(w.spin) * brakeT : 0;
      torque += (isRear ? Math.max(drive, -40) : 0) + brakeReaction * (w.contact ? 1 : 0.2);

      // Ground force: the part along the axis goes through the spring (wheel DOF); the
      // perpendicular part is transmitted rigidly to the chassis at the wheel centre.
      const gAlong = gx * axw + gy * ayw;
      const gpx = gx - axw * gAlong;
      const gpy = gy - ayw * gAlong;
      const gravAlong = w.mass * -G * ayw;

      // ---- wheel DOF along the axis (relative to the chassis)
      const aMx = ax - alpha * ry - this.omega * this.omega * rx;
      const aMy = ay + alpha * rx - this.omega * this.omega * ry;
      const aMAlong = aMx * axw + aMy * ayw;
      const external = gAlong + gravAlong - w.mass * aMAlong; // axial load on the wheel excluding the spring
      let axial = fs; // force the suspension transmits to the chassis
      w.bottomed = 0;
      if (w.s >= w.travel && fs + external >= 0) {
        // Topped out: the wheel hangs on the fork stop and moves with the chassis.
        w.s = w.travel;
        w.sv = Math.min(0, w.sv);
        axial = -external;
      } else {
        w.sv += ((fs + external) / w.mass) * dt;
        w.s += w.sv * dt;
        if (w.s > w.travel) {
          w.s = w.travel;
          if (w.sv > 0) w.sv = 0;
        }
        if (w.s < 0) {
          w.s = 0;
          if (w.sv < 0) {
            // Hard bottom-out: the remaining momentum hits the chassis.
            w.bottomed = -w.sv;
            axial += (-w.sv * w.mass) / dt;
            w.sv = 0;
          }
        }
      }
      // suspension reaction on the chassis acts along -axis
      const sfx = -axw * axial;
      const sfy = -ayw * axial;
      fx += gpx + sfx;
      fy += gpy + sfy;
      torque += rx * (gpy + sfy) - ry * (gpx + sfx);
      w.compression = 1 - w.s / w.travel;
      w.x = wx;
      w.y = wy;
    }

    // ---- rider: weight shift torque (on ground) and body english (in the air)
    if (!this.crashed) {
      if (anyContact) {
        torque += -this.lean * 330;
        // Rider instinct: on the ground a real rider stops a wheelie (or a stoppie) from
        // looping by moving his body and feathering the controls. Pulling hard on the balance
        // (ARRIÈRE / AVANT) overrides it, so wheelies and stoppies stay possible on purpose.
        const rel = wrapAngle(this.angle - world.slopeAt(this.x));
        const wantWheelie = clamp(-this.lean, 0, 1);
        const wantStoppie = clamp(this.lean, 0, 1);
        if (rel > 0.12) {
          const k = 1 - wantWheelie * 0.7;
          torque -= (rel - 0.12) * 3400 * k + Math.max(0, this.omega) * 80 * k;
        } else if (rel < -0.1) {
          const k = 1 - wantStoppie * 0.7;
          torque += (-0.1 - rel) * 3400 * k - Math.min(0, this.omega) * 80 * k;
        }
      } else {
        torque += -this.lean * 300 * this.airControl;
        // pitch damping in the air keeps control precise
        torque -= this.omega * 150;
      }
    }

    // ---- aerodynamic drag
    const sp = this.speed;
    fx -= 0.32 * this.vx * sp;
    fy -= 0.32 * this.vy * sp;

    // ---- chassis body contacts (skid plate, seat, rider head)
    this.bodyContacts(world, (px, py, Fx, Fy) => {
      fx += Fx;
      fy += Fy;
      torque += (px - this.x) * Fy - (py - this.y) * Fx;
    });

    // ---- integrate chassis (semi-implicit Euler)
    const totalMass = this.mass;
    this.vx += (fx / totalMass) * dt;
    this.vy += (fy / totalMass) * dt;
    this.omega += (torque / this.inertia) * dt;
    this.omega = clamp(this.omega, -14, 14);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle = wrapAngle(this.angle + this.omega * dt);

    // ---- air time & landing detection
    // Landing strength = speed into the ground (along the slope normal) at touchdown, plus the
    // extra hit of a suspension bottoming out. Landing on a down-slope is soft; flat is hard.
    this.grounded = this.rear.contact || this.front.contact;
    if (!this.grounded) {
      this.airTime += dt;
      this.wasAirborne = this.airTime;
    } else {
      if (this.wasAirborne > 0.25) {
        const slope = world.slopeAt(this.x);
        const nx = -Math.sin(slope);
        const ny = Math.cos(slope);
        this.landingBase = Math.max(0, -(this.vx * nx + this.vy * ny));
        this.landingPeak = this.landingBase;
        this.landingAngle = Math.abs(wrapAngle(this.angle - slope));
        this.landingTimer = 0.12;
      }
      this.airTime = 0;
      this.wasAirborne = 0;
    }
    if (this.landingTimer > 0) {
      this.landingTimer -= dt;
      this.landingPeak = Math.max(this.landingPeak, this.landingBase + Math.min(4, Math.max(this.rear.bottomed, this.front.bottomed)) * 0.4);
      if (this.landingTimer <= 0) {
        this.events.landing = Math.max(this.events.landing, this.landingPeak);
        this.events.landingAngle = this.landingAngle;
      }
    }
  }

  /** Extra collision points on the chassis. Head contact means a crash. */
  private bodyContacts(world: World, apply: (px: number, py: number, fx: number, fy: number) => void): void {
    const pts: [number, number, number, boolean][] = [
      [0.05, -0.58, 0.1, false], // skid plate
      [-1.12, 0.12, 0.1, false], // rear fender
      [-0.45, 0.15, 0.15, false], // seat / rider hip
      [1.1, -0.02, 0.1, false], // front fender
      [0.05, 1.05, 0.2, true], // rider helmet
      [-0.25, 0.6, 0.2, true], // rider back
    ];
    for (const [lx, ly, r, fatal] of pts) {
      const [px, py] = this.pointWorld(lx, ly);
      const hit = world.circleContact(px, py, r);
      if (!hit) continue;
      if (fatal && !this.crashed) {
        this.crashed = true;
        this.events.crashed = true;
      }
      const relX = px - this.x;
      const relY = py - this.y;
      const vpx = this.vx - this.omega * relY;
      const vpy = this.vy + this.omega * relX;
      const vn = vpx * hit.nx + vpy * hit.ny;
      const N = Math.max(0, 40000 * hit.depth - 1600 * vn);
      const tx = hit.ny;
      const ty = -hit.nx;
      const vt = vpx * tx + vpy * ty;
      const Ft = -0.6 * N * Math.tanh(vt / 0.8);
      apply(px, py, hit.nx * N + tx * Ft, hit.ny * N + ty * Ft);
    }
  }

  consumeEvents(): BikeEvents {
    const e = this.events;
    this.events = { landing: 0, landingAngle: 0, crashed: false };
    return e;
  }
}
