import { aiInput, createOpponents, Opponent } from './ai';
import { BikeModel, BIKES } from './bikes';
import { clamp, wrapAngle } from './core/math';
import { CircuitMode, circuitGrade, circuitLength, circuitRaceLevel, circuitSeed, isCircuitMode, Medal, medalForPlace, medalForTime, trialZones } from './circuits';
import { Difficulty, ModeId, raceLength } from './modes';
import { rockClimb } from './bikes';
import { diffIndex, Weather, weatherFor } from './weather';
import { Bike, BikeInput } from './physics/bike';
import { Particles } from './render/particles';
import type { RegionId } from './world/regions';
import { Biome, Surface, SURFACES } from './world/types';
import { World } from './world/world';

export type GameState = 'title' | 'playing' | 'paused' | 'over';
export type OverReason = 'fuel' | 'stamina' | 'time' | 'lives' | 'finish' | 'quit';

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
  coin?: number;
  landing?: number;
  bottom?: boolean;
  crash?: boolean;
  over?: boolean;
  checkpoint?: boolean;
  fault?: number;
  section?: 'start' | 'clean' | 'faults';
  countdown?: number;
  finish?: number;
  stunt?: boolean;
  weak?: boolean;
}

/** End-of-run summary (coins earned and why). */
export interface RunResult {
  reason: OverReason;
  lines: { label: string; coins: number }[];
  total: number;
  /** Mode score (distance, sections, place...). */
  score: number;
  scoreLabel: string;
  newRecord: boolean;
  /** Course: final standings. */
  standings?: { name: string; level: number; you: boolean }[];
  place?: number;
  /** Circuits: chrono (penalties included) and medal. */
  time?: number;
  medal?: Medal;
  circuit?: number;
}

export interface RunOptions {
  region: RegionId;
  mode: ModeId;
  model: BikeModel;
  difficulty: Difficulty;
  /** Circuit number (1..25) for trial / enduro / course. */
  circuit: number;
}

const PHYSICS_DT = 1 / 300;
export const CHECKPOINT_EVERY = 1000;
const PRIZES = [80, 55, 40, 30, 22, 16, 12, 8];
/** Trial: seconds added for each fall. */
export const TRIAL_PENALTY = 15;
/** Cruising: the distance bonus multiplier grows by this much each km (a fall costs one step). */
export const CRUISE_STEP = 0.25;
export const CRUISE_MAX = 4;

/**
 * Game rules for every mode: energies, pickups and coins, crashes and respawns, trial sections,
 * enduro clock, race opponents and standings, payout. Rendering and UI read this state;
 * nothing here touches the DOM.
 */
export class Game {
  state: GameState = 'title';
  region: RegionId = 'alpes';
  mode: ModeId = 'cruising';
  model: BikeModel = BIKES[0];
  difficulty: Difficulty = 'normal';
  raceLevel = 1;
  circuit = 0;
  weather: Weather = 0;
  /** Circuit chrono (s), started at GO, stopped at the finish. */
  clock = 0;
  /** Trial: seconds of fall penalties. */
  penalty = 0;
  falls = 0;
  // cruising "long ride" bonus
  cruiseLevel = 0;
  cruiseCoins = 0;
  private cruiseLastDist = 0;
  world!: World;
  bike = new Bike();
  particles = new Particles();
  input: BikeInput = { throttle: 0, brake: 0, balance: 0 };
  fuel = 100;
  stamina = 100;
  time = 0;
  startX = 5;
  overReason: OverReason = 'fuel';
  ragdoll: Ragdoll | null = null;
  crashTimer = 0;
  popups: Popup[] = [];
  /** Camera shake intensity, decays over time. */
  shake = 0;
  lastCheckpoint = 0;
  // economy
  coinsRun = 0;
  stuntCoins = 0;
  // trial
  section = 0;
  zones = 0;
  inSection = false;
  sectionsCleared = 0;
  private sectionStartX = 0;
  private zoneRetries = 0;
  private weakWarned = false;
  // enduro
  checkpoints = 0;
  // course
  opponents: Opponent[] = [];
  raceLen = 0;
  finishX = 0;
  countdown = 0;
  finished = false;
  place = 0;
  private finishOrder: string[] = [];
  private finishDelay = 0;

  result: RunResult | null = null;
  private acc = 0;
  private stuckTimer = 0;
  private progressX = 0;
  private progressTimer = 0;
  private outTimer = 0;
  private dustAcc = 0;
  private lastAir = 0;
  private events: GameEvents = {};

  constructor(opts: RunOptions) {
    this.newRun(opts);
    this.state = 'title';
  }

  get distance(): number {
    return Math.max(0, this.bike.x - this.startX);
  }

  newRun(opts: Partial<RunOptions> = {}): void {
    this.region = opts.region ?? this.region;
    this.mode = opts.mode ?? this.mode;
    this.model = opts.model ?? this.model;
    this.difficulty = opts.difficulty ?? this.difficulty;
    this.circuit = isCircuitMode(this.mode) ? Math.max(1, opts.circuit ?? this.circuit) : 0;
    const cm = this.mode as CircuitMode;
    this.raceLevel = this.circuit ? circuitRaceLevel(this.circuit) : 1;
    const seed = this.circuit ? circuitSeed(cm, this.region, this.circuit) : (Math.random() * 2 ** 31) | 0;
    this.weather = weatherFor(this.difficulty);
    this.world = new World(seed, this.region, this.mode, this.raceLevel, this.circuit, this.weather);
    this.zoneRetries = 0;
    this.weakWarned = false;
    this.world.ensure(220);
    this.bike = new Bike(this.model.spec);
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
    this.coinsRun = 0;
    this.stuntCoins = 0;
    this.section = 0;
    this.zones = this.mode === 'trial' ? trialZones(this.circuit) : 0;
    this.inSection = false;
    this.sectionsCleared = 0;
    this.sectionStartX = this.startX;
    this.checkpoints = 0;
    this.clock = 0;
    this.penalty = 0;
    this.falls = 0;
    this.cruiseLevel = 0;
    this.cruiseCoins = 0;
    this.cruiseLastDist = 0;
    this.finished = false;
    this.finishOrder = [];
    this.finishDelay = 0;
    this.place = 0;
    this.result = null;
    this.raceLen = this.circuit && this.mode !== 'trial' ? circuitLength(cm, this.circuit) : raceLength(this.raceLevel);
    this.finishX = this.startX + this.raceLen;
    this.opponents = this.mode === 'course' ? createOpponents(this.world, this.startX, this.difficulty, this.raceLevel, seed ^ 0x5bd1e995) : [];
    this.countdown = this.mode === 'course' ? 3.2 : 0;
    this.state = 'playing';
  }

  consumeEvents(): GameEvents {
    const e = this.events;
    this.events = {};
    return e;
  }

  /** Ends the run now (player quits from the pause menu): records and coins are kept. */
  quit(): void {
    if (this.state === 'playing' || this.state === 'paused') this.endRun('quit');
  }

  update(dt: number): void {
    dt = Math.min(dt, 1 / 20);
    if (this.state === 'title') {
      this.attract(dt);
      return;
    }
    if (this.state !== 'playing') return;
    this.time += dt;
    const bike = this.bike;
    const d = clamp(this.distance / 6000, 0, 1);

    // ---- race start countdown: everybody waits on the line
    if (this.countdown > 0) {
      const before = Math.ceil(this.countdown - 0.2);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown - 0.2);
      if (after !== before) {
        this.events.countdown = Math.max(0, after);
        this.popup(bike.x + 3, bike.y + 2.5, after > 0 ? String(after) : 'GO !', after > 0 ? '#ffffff' : '#7dff7a');
      }
      this.stepPhysics(dt, { throttle: 0, brake: 1, balance: 0 }, false);
      this.updateFx(dt);
      return;
    }

    // ---- input after constraints
    const inp: BikeInput = { ...this.input };
    if (this.usesEnergy && this.fuel <= 0) inp.throttle = 0;
    if (this.crashTimer > 0 || this.finished) {
      inp.throttle = this.finished ? 0.15 : 0;
      inp.balance = 0;
      inp.brake = this.finished ? 0.3 : inp.brake;
    }
    this.stepPhysics(dt, inp, true);
    this.world.ensure(bike.x + 140);
    this.world.trim(Math.min(bike.x, this.trailingX()) - 120);

    // ---- energies (cruising, enduro); the desert makes the rider thirsty
    if (this.usesEnergy) {
      const cons = this.model.spec.consumption;
      this.fuel -= (0.4 + inp.throttle * 1.25) * (1 + d * 0.5) * cons * dt;
      const roughness = Math.abs(bike.rear.sv) + Math.abs(bike.front.sv);
      const heat = this.world.biomeAt(bike.x) === Biome.Desert ? 1.45 : 1;
      const enduro = this.mode === 'enduro' ? 1.15 : 1;
      this.stamina -= heat * enduro * (0.4 + Math.abs(inp.balance) * 0.2 + Math.min(roughness, 3) * 0.1) * (1 + d * 0.6) * dt;
      this.pickups();
    }
    this.collectCoins();
    if (this.circuit && !this.finished) this.clock += dt;

    // ---- mode rules
    if (this.mode === 'cruising') {
      // the long-ride bonus: distance pays more and more as the kilometres add up
      const dd = this.distance - this.cruiseLastDist;
      if (dd > 0) {
        this.cruiseCoins += (dd / 20) * this.cruiseMult;
        this.cruiseLastDist = this.distance;
      }
      const cp = Math.floor(this.distance / CHECKPOINT_EVERY);
      if (cp > this.lastCheckpoint) {
        this.lastCheckpoint = cp;
        if (this.cruiseMult < CRUISE_MAX) this.cruiseLevel++;
        this.popup(bike.x + 2, bike.y + 2.5, `${cp * CHECKPOINT_EVERY} m !  BONUS ×${fmtMult(this.cruiseMult)}`, '#ffd23f');
        this.events.checkpoint = true;
      }
    } else if (this.mode === 'enduro') this.enduroRules(dt);
    else if (this.mode === 'trial') this.trialRules(dt);
    else if (this.mode === 'course') this.raceRules(dt);

    // ---- landings, stunts & crashes
    const ev = bike.consumeEvents();
    if (ev.landing > 0 && this.crashTimer <= 0) {
      // ev.landing = speed into the ground (m/s). Up to ~8.5 m/s the suspension absorbs it;
      // beyond, the rider takes the hit. Landing crooked makes it worse.
      const hard = ev.landing;
      const misalign = ev.landingAngle;
      const loss = clamp((hard - 8.5) * 1.5 + Math.max(0, misalign - 0.6) * 8, 0, 14);
      if (loss > 1) {
        if (this.usesEnergy) this.stamina -= loss;
        this.shake = Math.min(1, this.shake + loss / 15);
        this.popup(bike.x, bike.y + 1.8, loss > 10 ? 'AÏE !' : 'OUF', loss > 10 ? '#ff6b5a' : '#ffd8a0');
      } else if (hard > 3) {
        this.shake = Math.min(1, this.shake + 0.12);
      }
      // stunt coins: big air and clean landings (not in trial)
      if (this.mode !== 'trial' && loss <= 1) {
        if (this.lastAir > 1.1) this.stunt(3, 'BIG AIR');
        else if (this.lastAir > 0.55 && misalign < 0.12) this.stunt(2, 'PARFAIT');
      }
      this.events.landing = hard;
      this.landingDust(Math.min(1, hard / 7));
    }
    if (bike.rear.bottomed > 1.2 || bike.front.bottomed > 1.2) this.events.bottom = true;
    if (!bike.grounded) this.lastAir = bike.airTime;
    if (ev.crashed && this.crashTimer <= 0) this.crash();

    if (this.crashTimer > 0) {
      this.crashTimer -= dt;
      this.updateRagdoll(dt);
      if (this.crashTimer <= 0) this.respawn(this.mode === 'trial' ? this.sectionStartX : bike.x + 1);
    } else if (!this.finished) this.rescueIfStuck(dt);

    // ---- end conditions
    if (this.usesEnergy) {
      this.fuel = Math.max(0, this.fuel);
      this.stamina = Math.max(0, this.stamina);
      if (this.fuel <= 0 || this.stamina <= 0) {
        this.outTimer += dt;
        const limit = this.stamina <= 0 ? 1.2 : 3.5;
        if (this.outTimer > limit || (this.fuel <= 0 && bike.speed < 0.8 && this.outTimer > 0.8)) this.endRun(this.stamina <= 0 ? 'stamina' : 'fuel');
      }
    }
    this.updateFx(dt);
  }

  get usesEnergy(): boolean {
    return this.mode === 'cruising' || this.mode === 'enduro';
  }

  /** Cruising distance multiplier (×1 → ×4). */
  get cruiseMult(): number {
    return Math.min(CRUISE_MAX, 1 + this.cruiseLevel * CRUISE_STEP);
  }

  /** Circuit time shown to the player (trial penalties included). */
  get chrono(): number {
    return this.clock + this.penalty;
  }

  /** Circuits: 0..1 progress to the finish line. */
  get progress(): number {
    if (this.mode === 'trial') {
      const f = this.world.finishX;
      const within = this.inSection ? 0.5 : 0;
      return isFinite(f) ? clamp((this.bike.x - this.startX) / (f - this.startX), 0, 1) : clamp((this.sectionsCleared + within) / this.zones, 0, 0.97);
    }
    return clamp((this.bike.x - this.startX) / this.raceLen, 0, 1);
  }

  /**
   * Trial: after a few failed tries in a zone, tell the player when the rock ahead is higher
   * than what this bike can climb (a better bike from the garage is needed).
   */
  private zoneRetry(): void {
    if (this.mode !== 'trial' || !this.inSection) return;
    this.zoneRetries++;
    if (this.zoneRetries < 3 || this.weakWarned) return;
    const cap = rockClimb(this.model.id, this.weather);
    let tallest = 0;
    for (const p of this.world.props) {
      if (p.depth !== 0 || !p.asset?.startsWith('tr.rock.') || Math.abs(p.x - this.bike.x) > 8) continue;
      tallest = Math.max(tallest, Number(p.asset.split('.')[4]));
    }
    const h = 0.5 + (2 * tallest) / 24;
    if (tallest && h > cap + 0.05) {
      this.weakWarned = true;
      this.popup(this.bike.x + 1, this.bike.y + 3, 'ROCHER TROP HAUT POUR CETTE MOTO !', '#ff9a5a');
      this.popup(this.bike.x + 1, this.bike.y + 2.2, 'IL FAUT UNE MEILLEURE MOTO (GARAGE)', '#ffd23f');
      this.events.weak = true;
    }
  }

  /** Circuits: reached the finish line (player only). */
  private checkFinish(): void {
    if (this.finished || this.bike.x < this.world.finishX) return;
    this.finished = true;
    const t = this.chrono;
    this.popup(this.bike.x + 2, this.bike.y + 3, `ARRIVÉE !  ${fmtClock(t)}`, '#ffd23f');
    this.events.finish = 1;
    setTimeout(() => this.endRun('finish'), 1800);
  }

  // ---------------------------------------------------------------- modes

  private enduroRules(dt: number): void {
    const bike = this.bike;
    void dt;
    for (const m of this.world.marks) {
      if (m.kind !== 'checkpoint' || (m.n ?? 0) <= this.checkpoints) continue;
      if (bike.x >= m.x0) {
        this.checkpoints = m.n ?? this.checkpoints + 1;
        this.popup(bike.x + 2, bike.y + 2.6, `CONTRÔLE ${this.checkpoints}  ${fmtClock(this.chrono)}`, '#7dff7a');
        this.events.checkpoint = true;
      }
    }
    this.checkFinish();
  }

  private trialRules(dt: number): void {
    const bike = this.bike;
    void dt;
    for (const m of this.world.marks) {
      if (m.kind === 'sectionStart' && !this.inSection && (m.n ?? 0) === this.section + 1 && bike.x >= m.x0) {
        this.section = m.n!;
        this.inSection = true;
        this.sectionStartX = m.x0 - 3;
        this.zoneRetries = 0;
        this.weakWarned = false;
        this.popup(bike.x + 3, bike.y + 3.4, `ZONE ${this.section}/${this.zones}`, '#ffffff');
        this.events.section = 'start';
      }
      if (m.kind === 'sectionEnd' && this.inSection && m.n === this.section && bike.x >= m.x0) {
        this.inSection = false;
        this.sectionsCleared++;
        this.sectionStartX = m.x0 + 2;
        this.popup(bike.x + 2, bike.y + 2.4, 'ZONE FRANCHIE !', '#7dff7a');
        this.events.section = 'clean';
      }
    }
    this.checkFinish();
  }

  private raceRules(dt: number): void {
    const bike = this.bike;
    for (const o of this.opponents) {
      if (!o.finished && o.bike.x >= this.finishX) {
        o.finished = true;
        o.finishTime = this.time;
        this.finishOrder.push(o.name);
      }
    }
    if (!this.finished && bike.x >= this.finishX) {
      this.finished = true;
      this.finishOrder.push('__you');
      this.place = this.finishOrder.length;
      this.popup(bike.x + 2, bike.y + 2.8, this.place === 1 ? 'VICTOIRE !' : `${this.place}e`, this.place <= 3 ? '#ffd23f' : '#ffffff');
      this.events.finish = this.place;
    }
    if (this.finished) {
      this.finishDelay += dt;
      if (this.finishDelay > 2.2) this.endRun('finish');
    }
  }

  /** Current race position (1..8) from distance travelled (finished riders first). */
  racePosition(): number {
    if (this.finished) return this.place;
    let ahead = this.finishOrder.length;
    for (const o of this.opponents) if (!o.finished && o.bike.x > this.bike.x) ahead++;
    return ahead + 1;
  }

  private trailingX(): number {
    let m = Infinity;
    for (const o of this.opponents) m = Math.min(m, o.bike.x);
    return m;
  }

  // ---------------------------------------------------------------- economy

  private pickups(): void {
    const bike = this.bike;
    for (const p of this.world.pickups) {
      if (p.taken || Math.abs(p.x - bike.x) > 3) continue;
      // Generous "magnet" zone: a tall box around the rider so jumps over a pickup still grab it.
      const dy = bike.y - p.y;
      if (Math.abs(p.x - bike.x) < 1.3 && dy > -1.6 && dy < 3.2) {
        p.taken = true;
        p.takenAt = this.time;
        if (p.kind === 'fuel') {
          this.fuel = Math.min(100, this.fuel + 28);
          this.popup(p.x, p.y + 0.6, this.model.electric ? '+ BATTERIE' : '+ ESSENCE', '#ffcf3a');
        } else {
          this.stamina = Math.min(100, this.stamina + 30);
          this.popup(p.x, p.y + 0.6, '+ EAU', '#7fd4ff');
        }
        this.sparkle(p.x, p.y + 0.4, p.kind === 'fuel' ? [255, 210, 60] : [120, 210, 255], 14);
        this.events.pickup = p.kind;
      }
    }
  }

  private collectCoins(): void {
    const bike = this.bike;
    for (const c of this.world.coins) {
      if (c.taken || Math.abs(c.x - bike.x) > 1.6) continue;
      const dy = c.y - bike.y;
      if (dy > -1.4 && dy < 2.2) {
        c.taken = true;
        c.takenAt = this.time;
        this.coinsRun += 1;
        this.sparkle(c.x, c.y, [255, 214, 70], 6);
        this.events.coin = (this.events.coin ?? 0) + 1;
      }
    }
  }

  private stunt(coins: number, text: string): void {
    this.stuntCoins += coins;
    this.coinsRun += coins;
    this.popup(this.bike.x, this.bike.y + 2.2, `${text} +${coins}`, '#ffd23f');
    this.events.stunt = true;
  }

  /** Coins earned for the run, by line, and the mode score. */
  private payout(reason: OverReason): RunResult {
    const lines: { label: string; coins: number }[] = [];
    let score = 0;
    let scoreLabel = '';
    const picked = this.coinsRun - this.stuntCoins;
    if (picked > 0) lines.push({ label: 'Pièces ramassées', coins: picked });
    if (this.stuntCoins > 0) lines.push({ label: 'Sauts et réceptions', coins: this.stuntCoins });
    let standings: RunResult['standings'];
    let place: number | undefined;
    let time: number | undefined;
    let medal: Medal | undefined;
    const g = circuitGrade(this.circuit);
    const done = reason === 'finish';
    const dm = [1, 1.25, 1.5][diffIndex(this.difficulty)];
    switch (this.mode) {
      case 'cruising':
        score = Math.round(this.distance);
        scoreLabel = `${score.toLocaleString('fr-FR')} m`;
        lines.push({ label: this.cruiseMult > 1 ? `Distance (bonus jusqu’à ×${fmtMult(this.cruiseMult)})` : 'Distance', coins: Math.floor(this.cruiseCoins * dm) });
        break;
      case 'enduro':
      case 'trial':
        if (done) {
          time = this.chrono;
          medal = medalForTime(this.mode, this.circuit, time, diffIndex(this.difficulty));
          score = Math.round(time * 10);
          scoreLabel = fmtClock(time) + (this.falls ? ` · ${this.falls} chute${this.falls > 1 ? 's' : ''}` : '');
          lines.push({ label: 'Circuit terminé', coins: Math.round(((this.mode === 'trial' ? 25 : 35) + g * 40) * dm) });
        } else {
          scoreLabel = 'Abandon';
          if (this.mode === 'enduro') lines.push({ label: 'Distance', coins: Math.floor(this.distance / 40) });
          else if (this.sectionsCleared) lines.push({ label: 'Zones franchies', coins: this.sectionsCleared * 3 });
        }
        break;
      case 'course': {
        if (done) {
          place = this.place;
          medal = medalForPlace(place);
          score = 9 - place;
          scoreLabel = `${place}e / 8`;
          const mult = (1 + g * 0.6) * dm;
          lines.push({ label: `Prix de la ${place}e place`, coins: Math.round(PRIZES[place - 1] * mult) });
          // final standings: finishers in order, then the others by distance
          const rest = this.opponents.filter((o) => !o.finished).sort((a, b) => b.bike.x - a.bike.x);
          const order = [...this.finishOrder.map((n) => (n === '__you' ? null : this.opponents.find((o) => o.name === n)!)), ...rest];
          standings = order.map((o) => (o ? { name: o.name, level: o.level, you: false } : { name: 'Toi', level: 0, you: true }));
        } else scoreLabel = 'Abandon';
        break;
      }
    }
    const total = lines.reduce((a, l) => a + l.coins, 0);
    return { reason, lines, total, score, scoreLabel, newRecord: false, standings, place, time, medal, circuit: this.circuit || undefined };
  }

  private endRun(reason: OverReason): void {
    if (this.state === 'over') return;
    this.overReason = reason;
    this.state = 'over';
    this.result = this.payout(reason);
    this.events.over = true;
  }

  // ---------------------------------------------------------------- simulation

  private attract(dt: number): void {
    // Attract mode behind the home screen: the rider cruises and jumps on his own.
    const b = this.bike;
    const w = this.world;
    const err = wrapAngle(b.angle - (b.grounded ? w.slopeAt(b.x) : w.slopeAt(b.x + Math.max(1, b.vx * 0.4))));
    this.input.throttle = b.grounded ? (b.speed < 17 ? 0.8 : 0.35) : 0.1;
    this.input.balance = clamp(err * 2.5 + b.omega * 0.35, -1, 1);
    this.input.brake = 0;
    this.stepPhysics(dt, this.input, false);
    w.ensure(b.x + 140);
    w.trim(b.x - 120);
    const ev = b.consumeEvents();
    if (ev.crashed || (b.speed < 0.5 && this.time > 3)) this.respawn(b.x + 8);
    this.time += dt;
    if (ev.landing) {
      this.events.landing = ev.landing;
      this.landingDust(Math.min(1, ev.landing / 7));
    }
    this.updateFx(dt);
  }

  private stepPhysics(dt: number, inp: BikeInput, withAi: boolean): void {
    // AI commands are computed once per frame
    let lead = 0;
    for (const o of this.opponents) lead = Math.max(lead, o.bike.x);
    const aiInputs = this.opponents.map((o) => {
      if (!withAi || o.finished) return { throttle: o.finished ? 0.1 : 0, brake: o.finished ? 0.4 : 1, balance: 0 };
      if (o.crashTimer > 0) return { throttle: 0, brake: 0, balance: 0 };
      return aiInput(o, this.world, dt, o.bike.x - this.bike.x);
    });
    void lead;
    this.acc += dt;
    let n = 0;
    while (this.acc >= PHYSICS_DT && n < 40) {
      this.bike.step(this.world, inp, PHYSICS_DT);
      for (let i = 0; i < this.opponents.length; i++) this.opponents[i].bike.step(this.world, aiInputs[i], PHYSICS_DT);
      this.acc -= PHYSICS_DT;
      n++;
    }
    if (n >= 40) this.acc = 0;
    // AI crashes and rescues
    for (const o of this.opponents) {
      const ev = o.bike.consumeEvents();
      if (o.crashTimer > 0) {
        o.crashTimer -= dt;
        if (o.crashTimer <= 0) this.resetBikeAt(o.bike, o.bike.x + 1);
        continue;
      }
      if (ev.crashed) o.crashTimer = 2.5;
      if (withAi) {
        if (o.bike.x > o.ai.lastX + 2) {
          o.ai.lastX = o.bike.x;
          o.ai.stuck = 0;
        } else o.ai.stuck += dt;
        if (o.ai.stuck > 4 && !o.finished) {
          o.ai.stuck = 0;
          this.resetBikeAt(o.bike, o.bike.x + 4);
        }
      }
    }
  }

  private rescueIfStuck(dt: number): void {
    const bike = this.bike;
    // Stuck (pit, wall) or upside down without touching the head: auto-rescue.
    const upsideDown = Math.abs(wrapAngle(bike.angle - this.world.slopeAt(bike.x))) > 1.9 && bike.speed < 3;
    const trial = this.mode === 'trial';
    if ((Math.abs(bike.speed) < 0.7 && this.input.throttle > 0.4) || upsideDown) this.stuckTimer += dt;
    else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
    // no real progress for a while (rocking in the bottom of a pit): rescue as well
    if (bike.x > this.progressX + 3) {
      this.progressX = bike.x;
      this.progressTimer = 0;
    } else this.progressTimer += dt;
    const limit = trial ? 6 : 3;
    if (this.stuckTimer > (upsideDown ? 1.2 : limit) || (this.progressTimer > (trial ? 12 : 6) && this.input.throttle > 0.3)) {
      this.progressTimer = 0;
      this.stuckTimer = 0;
      if (this.usesEnergy) this.stamina -= 4;
      // in trial you retry the obstacle from a bit further back (no skipping)
      if (trial) {
        this.zoneRetry();
        this.respawn(bike.x - 3);
      }
      else this.respawn(bike.x + 6);
      this.popup(bike.x, bike.y + 2, 'HOP !', '#ffffff');
    }
  }

  private crash(): void {
    const bike = this.bike;
    this.crashTimer = 2.0;
    if (this.usesEnergy) this.stamina -= 15;
    this.shake = 1;
    const [hx, hy] = bike.pointWorld(-0.1, 0.5);
    this.ragdoll = { x: hx, y: hy, vx: bike.vx * 0.8, vy: Math.max(2, bike.vy + 3), angle: bike.angle, omega: -4 - bike.speed * 0.3 };
    this.events.crash = true;
    this.landingDust(1);
    this.falls++;
    if (this.mode === 'trial') {
      this.zoneRetry();
      this.penalty += TRIAL_PENALTY;
      this.popup(hx, hy + 1.5, `CHUTE  +${TRIAL_PENALTY} s`, '#ff6b5a');
    } else this.popup(hx, hy + 1.5, 'CHUTE !', '#ff6b5a');
    if (this.mode === 'cruising' && this.cruiseLevel > 0) {
      this.cruiseLevel--;
      this.popup(hx, hy + 2.3, `BONUS ×${fmtMult(this.cruiseMult)}`, '#ffb070');
    }
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

  private resetBikeAt(b: Bike, x: number): void {
    let best = x;
    for (let k = 0; k < 30; k++) {
      const cx = x + k * 0.5;
      if (Math.abs(this.world.slopeAt(cx)) < 0.25) {
        best = cx;
        break;
      }
    }
    b.reset(this.world, best);
  }

  private respawn(x: number): void {
    this.resetBikeAt(this.bike, x);
    this.ragdoll = null;
    this.crashTimer = 0;
  }

  private popup(x: number, y: number, text: string, color: string): void {
    this.popups.push({ x, y, text, color, life: 1.2 });
  }

  // ---------------------------------------------------------------- effects

  private sparkle(x: number, y: number, [r, g, b]: number[], n: number): void {
    for (let i = 0; i < n; i++)
      this.particles.spawn({ kind: 'spark', x, y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.3) * 6, life: 0.5, size: 0.12, grow: 0, r, g, b });
  }

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

  private roost(b: Bike, throttle: number, dt: number, rate = 1): void {
    const rw = b.rear;
    if (!rw.contact) return;
    const s = SURFACES[rw.surface];
    const slip = Math.abs(rw.slip);
    const sp = Math.abs(b.forwardSpeed);
    // wet weather: little dust, more mud clods
    this.dustAcc += (sp * 3 + slip * 25 + throttle * 10) * s.dustAmount * dt * rate * [1, 0.65, 0.35][this.weather];
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
      if (!water && (slip > 1.5 || throttle > 0.7) && Math.random() < (this.weather === 2 ? 0.8 : 0.35)) {
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

  private updateFx(dt: number): void {
    this.roost(this.bike, this.input.throttle, dt);
    // opponents close to the player throw dust too (cheaper rate)
    for (const o of this.opponents) if (Math.abs(o.bike.x - this.bike.x) < 25) this.roost(o.bike, 0.6, dt, 0.35);
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

export function fmtMult(m: number): string {
  return m.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
}

export function fmtClock(s: number): string {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
}
