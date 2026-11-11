import { clamp, wrapAngle } from './core/math';
import { Bike, BikeInput } from './physics/bike';
import { Particles } from './render/particles';
import { Biome, Surface, SURFACES } from './world/types';
import { World } from './world/world';
import type { RegionId } from './world/regions';

export type GameState = 'title' | 'playing' | 'paused' | 'over';
export type OverReason = 'fuel' | 'stamina';

/** Rider thrown off during a crash (simple ballistic ragdoll for the visuals). */
export interface Ragdoll {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  omega: number;
}

export interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

export interface GameEvents {
  pickup?: 'fuel' | 'water';
  landing?: number;
  crash?: boolean;
  over?: boolean;
  checkpoint?: boolean;
}

const PHYSICS_DT = 1 / 300;
export const CHECKPOINT_EVERY = 1000;

/**
 * Game rules: energies, pickups, crashes, respawns and particles. Rendering and UI read this
 * state; nothing here touches the DOM.
 */
export class Game {
  state: GameState = 'title';
  region: RegionId = 'alpes';
  world!: World;
  bike = new Bike();
  particles = new Particles();
  input: BikeInput = { throttle: 0, brake: 0, balance: 0 };
  fuel = 100;
  stamina = 100;
  time = 0;
  startX = 5;
  best = 0;
  overReason: OverReason = 'fuel';
  ragdoll: Ragdoll | null = null;
  crashTimer = 0;
  popups: Popup[] = [];
  /** Camera shake intensity, decays over time. */
  shake = 0;
  lastCheckpoint = 0;
  private acc = 0;
  private stuckTimer = 0;
  private progressX = 0;
  private progressTimer = 0;
  private outTimer = 0;
  private dustAcc = 0;
  private events: GameEvents = {};

  /** Set when the last run beat the region record. */
  newRecord = false;

  constructor(region: RegionId = 'alpes') {
    this.region = region;
    this.newRun(region);
    this.state = 'title';
  }

  /** Records are kept per region (each region is a level). */
  private loadBest(): void {
    try {
      this.best = Number(localStorage.getItem('mx.best.' + this.region) ?? 0) || 0;
    } catch {
      this.best = 0;
    }
  }

  get distance(): number {
    return Math.max(0, this.bike.x - this.startX);
  }

  newRun(region: RegionId = this.region): void {
    this.region = region;
    this.loadBest();
    this.newRecord = false;
    const seed = (Math.random() * 2 ** 31) | 0;
    this.world = new World(seed, region);
    this.world.ensure(200);
    this.bike = new Bike();
    this.bike.reset(this.world, this.startX);
    this.particles.clear();
    this.fuel = 100;
    this.stamina = 100;
    this.time = 0;
    this.ragdoll = null;
    this.crashTimer = 0;
    this.popups = [];
    this.stuckTimer = 0;
    this.progressX = 0;
    this.progressTimer = 0;
    this.outTimer = 0;
    this.lastCheckpoint = 0;
    this.acc = 0;
    this.state = 'playing';
  }

  consumeEvents(): GameEvents {
    const e = this.events;
    this.events = {};
    return e;
  }

  update(dt: number): void {
    dt = Math.min(dt, 1 / 20);
    if (this.state === 'title') {
      // Attract mode behind the home screen: the rider cruises and jumps on his own.
      const b = this.bike;
      const w = this.world;
      const err = wrapAngle(b.angle - (b.grounded ? w.slopeAt(b.x) : w.slopeAt(b.x + Math.max(1, b.vx * 0.4))));
      this.input.throttle = b.grounded ? (b.speed < 17 ? 0.8 : 0.35) : 0.1;
      this.input.balance = clamp(err * 2.5 + b.omega * 0.35, -1, 1);
      this.input.brake = 0;
      this.stepPhysics(dt, this.input);
      w.ensure(b.x + 140);
      w.trim(b.x - 120);
      const ev = b.consumeEvents();
      if (ev.crashed || (b.speed < 0.5 && this.time > 3)) this.respawn(b.x + 8);
      this.time += dt;
      if (ev.landing) this.landingDust(Math.min(1, ev.landing / 7));
      this.updateFx(dt);
      return;
    }
    if (this.state !== 'playing') return;
    this.time += dt;
    const bike = this.bike;
    const d = clamp(this.distance / 6000, 0, 1);

    // ---- input after energy constraints
    const inp: BikeInput = { ...this.input };
    if (this.fuel <= 0) inp.throttle = 0;
    if (this.crashTimer > 0) {
      inp.throttle = 0;
      inp.balance = 0;
    }
    this.stepPhysics(dt, inp);
    this.world.ensure(bike.x + 140);
    this.world.trim(bike.x - 120);

    // ---- energies
    this.fuel -= (0.4 + inp.throttle * 1.25) * (1 + d * 0.5) * dt;
    const roughness = Math.abs(bike.rear.sv) + Math.abs(bike.front.sv);
    // desert heat: the rider gets thirsty faster on the sand
    const heat = this.world.biomeAt(bike.x) === Biome.Desert ? 1.45 : 1;
    this.stamina -= heat * (0.4 + Math.abs(inp.balance) * 0.2 + Math.min(roughness, 3) * 0.1) * (1 + d * 0.6) * dt;

    // ---- pickups
    for (const p of this.world.pickups) {
      if (p.taken || Math.abs(p.x - bike.x) > 3) continue;
      // Generous "magnet" zone: a tall box around the rider so jumps over a pickup still grab it.
      const dy = bike.y - p.y;
      if (Math.abs(p.x - bike.x) < 1.3 && dy > -1.6 && dy < 3.2) {
        p.taken = true;
        p.takenAt = this.time;
        if (p.kind === 'fuel') {
          this.fuel = Math.min(100, this.fuel + 28);
          this.popup(p.x, p.y + 0.6, '+ ESSENCE', '#ffcf3a');
        } else {
          this.stamina = Math.min(100, this.stamina + 30);
          this.popup(p.x, p.y + 0.6, '+ EAU', '#7fd4ff');
        }
        for (let i = 0; i < 14; i++)
          this.particles.spawn({
            kind: 'spark',
            x: p.x,
            y: p.y + 0.4,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.3) * 6,
            life: 0.5,
            size: 0.12,
            grow: 0,
            r: p.kind === 'fuel' ? 255 : 120,
            g: p.kind === 'fuel' ? 210 : 210,
            b: p.kind === 'fuel' ? 60 : 255,
          });
        this.events.pickup = p.kind;
      }
    }

    // ---- checkpoints
    const cp = Math.floor(this.distance / CHECKPOINT_EVERY);
    if (cp > this.lastCheckpoint) {
      this.lastCheckpoint = cp;
      this.popup(bike.x + 2, bike.y + 2.5, `${cp * CHECKPOINT_EVERY} m !`, '#ffffff');
      this.events.checkpoint = true;
    }

    // ---- landings & crashes
    const ev = bike.consumeEvents();
    if (ev.landing > 0 && this.crashTimer <= 0) {
      // ev.landing = speed into the ground (m/s). Up to ~8.5 m/s the suspension absorbs it;
      // beyond, the rider takes the hit. Landing crooked makes it worse.
      const hard = ev.landing;
      const misalign = ev.landingAngle;
      const loss = clamp((hard - 8.5) * 1.5 + Math.max(0, misalign - 0.6) * 8, 0, 14);
      if (loss > 1) {
        this.stamina -= loss;
        this.shake = Math.min(1, this.shake + loss / 15);
        this.popup(bike.x, bike.y + 1.8, loss > 10 ? 'AÏE !' : 'OUF', loss > 10 ? '#ff6b5a' : '#ffd8a0');
      } else if (hard > 3) {
        this.shake = Math.min(1, this.shake + 0.12);
      }
      this.events.landing = hard;
      this.landingDust(Math.min(1, hard / 7));
    }
    if (ev.crashed && this.crashTimer <= 0) this.crash();

    if (this.crashTimer > 0) {
      this.crashTimer -= dt;
      this.updateRagdoll(dt);
      if (this.crashTimer <= 0) this.respawn(bike.x + 1);
    } else {
      // Stuck (pit, wall) or upside down without touching the head: auto-rescue.
      const upsideDown = Math.abs(wrapAngle(bike.angle - this.world.slopeAt(bike.x))) > 1.9 && bike.speed < 3;
      if ((Math.abs(bike.speed) < 0.7 && this.input.throttle > 0.4) || upsideDown) this.stuckTimer += dt;
      else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
      // no real progress for a while (rocking in the bottom of a pit): rescue as well
      if (bike.x > this.progressX + 3) {
        this.progressX = bike.x;
        this.progressTimer = 0;
      } else this.progressTimer += dt;
      if (this.stuckTimer > (upsideDown ? 1.2 : 3) || (this.progressTimer > 6 && this.input.throttle > 0.3)) {
        this.progressTimer = 0;
        this.stuckTimer = 0;
        this.stamina -= 4;
        this.respawn(bike.x + 6);
        this.popup(bike.x, bike.y + 2, 'HOP !', '#ffffff');
      }
    }

    // ---- game over
    this.fuel = Math.max(0, this.fuel);
    this.stamina = Math.max(0, this.stamina);
    if (this.fuel <= 0 || this.stamina <= 0) {
      this.outTimer += dt;
      const limit = this.stamina <= 0 ? 1.2 : 3.5;
      if (this.outTimer > limit || (this.fuel <= 0 && bike.speed < 0.8 && this.outTimer > 0.8)) {
        this.overReason = this.stamina <= 0 ? 'stamina' : 'fuel';
        this.gameOver();
      }
    }
    this.updateFx(dt);
  }

  private stepPhysics(dt: number, inp: BikeInput): void {
    this.acc += dt;
    let n = 0;
    while (this.acc >= PHYSICS_DT && n < 40) {
      this.bike.step(this.world, inp, PHYSICS_DT);
      this.acc -= PHYSICS_DT;
      n++;
    }
    if (n >= 40) this.acc = 0;
  }

  private crash(): void {
    const bike = this.bike;
    this.crashTimer = 2.0;
    this.stamina -= 15;
    this.shake = 1;
    const [hx, hy] = bike.pointWorld(-0.1, 0.5);
    this.ragdoll = { x: hx, y: hy, vx: bike.vx * 0.8, vy: Math.max(2, bike.vy + 3), angle: bike.angle, omega: -4 - bike.speed * 0.3 };
    this.popup(hx, hy + 1.5, 'CHUTE !', '#ff6b5a');
    this.events.crash = true;
    this.landingDust(1);
  }

  private updateRagdoll(dt: number): void {
    const r = this.ragdoll;
    if (!r) return;
    r.vy -= 9.81 * dt;
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.angle += r.omega * dt;
    const g = this.world.heightAt(r.x) + 0.25;
    if (r.y < g) {
      r.y = g;
      if (r.vy < 0) r.vy *= -0.35;
      r.vx *= 0.7;
      r.omega *= 0.6;
    }
  }

  private respawn(x: number): void {
    // find a reasonably flat spot nearby, never inside a pit
    let best = x;
    for (let k = 0; k < 30; k++) {
      const cx = x + k * 0.5;
      if (Math.abs(this.world.slopeAt(cx)) < 0.25) {
        best = cx;
        break;
      }
    }
    this.bike.reset(this.world, best);
    this.ragdoll = null;
    this.crashTimer = 0;
  }

  private gameOver(): void {
    this.state = 'over';
    const d = Math.round(this.distance);
    this.newRecord = d > this.best && d > 0;
    if (d > this.best) {
      this.best = d;
      try {
        localStorage.setItem('mx.best.' + this.region, String(d));
      } catch {
        /* storage unavailable */
      }
    }
    this.events.over = true;
  }

  private popup(x: number, y: number, text: string, color: string): void {
    this.popups.push({ x, y, text, color, life: 1.2 });
  }

  // ---------------------------------------------------------------- effects

  private landingDust(strength: number): void {
    const b = this.bike;
    for (const w of [b.rear, b.front]) {
      const s = SURFACES[w.surface];
      for (let i = 0; i < 6 + strength * 14; i++) {
        this.particles.spawn({
          kind: 'dust',
          x: w.x + (Math.random() - 0.5) * 0.6,
          y: w.y - w.radius + 0.1,
          vx: (Math.random() - 0.5) * 5 + b.vx * 0.2,
          vy: Math.random() * 1.5,
          life: 0.8 + Math.random() * 0.6,
          size: 0.25 + Math.random() * 0.25,
          grow: 1.2,
          r: s.dust[0],
          g: s.dust[1],
          b: s.dust[2],
        });
      }
    }
  }

  private updateFx(dt: number): void {
    const b = this.bike;
    // dust & roost from the rear wheel when it is driving or sliding
    const rw = b.rear;
    if (rw.contact) {
      const s = SURFACES[rw.surface];
      const slip = Math.abs(rw.slip);
      const sp = Math.abs(b.forwardSpeed);
      const rate = (sp * 3 + slip * 25 + this.input.throttle * 10) * s.dustAmount;
      this.dustAcc += rate * dt;
      while (this.dustAcc > 1) {
        this.dustAcc -= 1;
        const water = rw.surface === Surface.Water;
        const back = -1 - Math.random() * 2;
        this.particles.spawn({
          kind: water ? 'splash' : 'dust',
          x: rw.x - rw.radius * 0.6,
          y: rw.y - rw.radius * 0.8,
          vx: back * (1 + slip * 0.8) + b.vx * 0.25,
          vy: water ? 2 + Math.random() * 3 : 0.4 + Math.random() * 1.2,
          life: water ? 0.8 : 0.7 + Math.random() * 0.9,
          size: water ? 0.08 + Math.random() * 0.08 : 0.18 + Math.random() * 0.22,
          grow: 0.9 + sp * 0.04,
          r: s.dust[0] + (Math.random() - 0.5) * 20,
          g: s.dust[1] + (Math.random() - 0.5) * 20,
          b: s.dust[2] + (Math.random() - 0.5) * 20,
        });
        if (!water && (slip > 1.5 || this.input.throttle > 0.7) && Math.random() < 0.35) {
          // roost: dirt clods flicked back
          this.particles.spawn({
            kind: 'clod',
            x: rw.x - rw.radius,
            y: rw.y - rw.radius * 0.5,
            vx: -2 - Math.random() * 4 - slip + b.vx * 0.4,
            vy: 1.5 + Math.random() * 3,
            life: 1.2,
            size: 0.04 + Math.random() * 0.05,
            grow: 0,
            r: s.dust[0] * 0.6,
            g: s.dust[1] * 0.6,
            b: s.dust[2] * 0.6,
          });
        }
      }
    }
    this.particles.update(dt, (x) => this.world.heightAt(x));
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      p.y += dt * 1.2;
      if (p.life <= 0) this.popups.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }
}
