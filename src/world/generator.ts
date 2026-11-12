import { clamp, fbm1, GRAVITY_SCALE, noise1, Rng, smoothstep } from '../core/math';
import { Biome, DX, PropKind, Surface } from './types';
import type { World } from './world';
import { BridgeKind, RegionDef } from './regions';
import { AssetDef, AssetGroup, assetsFor, Slot } from '../catalog';
import { ENDURO_CP, ModeId, raceLength } from '../modes';
import { circuitGrade, circuitLength, isCircuitMode, trialRockRange, trialZones } from '../circuits';
import { rockKindFor } from '../catalog/rocks';
import { HILL_SCALE } from '../weather';
import { MX_CRUISE_LOOP, MX_ENTRY, MX_FEATURES, MX_FEATURES_CRUISE, MX_LEN, MX_STRAIGHT, MX_ZONE_LEN, mxPathHeight } from '../mx/track';
import { expectedBike, moduleClimb } from '../bikes';

/**
 * A terrain segment: a height profile relative to the height at its start.
 * Segments are chained so the track is always continuous.
 */
interface Segment {
  len: number;
  /** Height offset at local x (0..len). Must be 0 at x=0. */
  shape: (t: number) => number;
  /** Optional visual ground offset (ravines under bridges). Defaults to shape. */
  visual?: (t: number) => number;
  surface?: (t: number, x: number) => Surface;
  /** Local ranges where no pickup may spawn (pits, bridges...). */
  noPickup?: [number, number][];
  /** Called once when the segment starts, with its world start x and start height. */
  onStart?: (x0: number, h0: number) => void;
  /** Prop density multiplier for the track side. */
  props?: number;
  /** Coins to place: a line along the ground or an arc over the highest point. */
  coins?: 'line' | 'arc';
}

type FeatureName =
  | 'tabletop'
  | 'double'
  | 'gap'
  | 'stepUp'
  | 'drop'
  | 'whoops'
  | 'rollers'
  | 'berm'
  | 'bridge'
  | 'ford'
  | 'climb'
  | 'descent'
  | 'logs'
  | 'rocks'
  | 'enduroObs'
  | 'bigHill'
  | 'cruiseHill'
  | 'speedJump'
  | 'techHill'
  // desert
  | 'dunes'
  | 'wadi'
  | 'oasis'
  | 'ledges';

interface BiomeDef {
  length: [number, number];
  baseAmp: number;
  baseWave: number; // wavelength of base undulation (m)
  trend: number; // max |slope| of base stretches
  surface: Surface;
  features: Partial<Record<FeatureName, number>>;
  props: { kind: PropKind; weight: number }[];
  treeDensity: number;
}

const BIOMES: Record<Biome, BiomeDef> = {
  [Biome.City]: {
    // San Francisco: very steep streets (climbs and descents), kerbs, crossings, overpasses
    length: [400, 700],
    baseAmp: 1.2,
    baseWave: 60,
    trend: 0.12,
    surface: Surface.Rock,
    features: { climb: 4, descent: 4, stepUp: 2, drop: 1.5, tabletop: 2, rollers: 1.5, bridge: 2.5, berm: 1 },
    props: [
      { kind: 'grass', weight: 4 },
      { kind: 'bush', weight: 3 },
      { kind: 'rock', weight: 0.5 },
      { kind: 'flower', weight: 2 },
    ],
    treeDensity: 0.25,
  },
  [Biome.Forest]: {
    length: [450, 750],
    baseAmp: 1.43,
    baseWave: 45,
    trend: 0.06,
    surface: Surface.Dirt,
    features: { tabletop: 3, double: 3, rollers: 3, whoops: 2, logs: 2, berm: 2, descent: 1, climb: 1, stepUp: 1, bridge: 1.5 },
    props: [
      { kind: 'pine', weight: 10 },
      { kind: 'pineDead', weight: 0.6 },
      { kind: 'bush', weight: 3 },
      { kind: 'rock', weight: 2 },
      { kind: 'stump', weight: 1 },
      { kind: 'log', weight: 1 },
      { kind: 'grass', weight: 4 },
      { kind: 'flower', weight: 1.5 },
    ],
    treeDensity: 1.0,
  },
  [Biome.Meadow]: {
    length: [400, 650],
    baseAmp: 1.95,
    baseWave: 70,
    trend: 0.05,
    surface: Surface.Dirt,
    features: { tabletop: 4, double: 3, rollers: 3, whoops: 2, berm: 2, stepUp: 1, drop: 1, bridge: 1 },
    props: [
      { kind: 'pine', weight: 3 },
      { kind: 'bush', weight: 3 },
      { kind: 'rock', weight: 3 },
      { kind: 'grass', weight: 8 },
      { kind: 'flower', weight: 6 },
      { kind: 'flag', weight: 0.3 },
    ],
    treeDensity: 0.4,
  },
  [Biome.Mountain]: {
    length: [450, 700],
    baseAmp: 2.93,
    baseWave: 55,
    trend: 0.16,
    surface: Surface.Dirt,
    features: { climb: 3, descent: 3, rocks: 3, drop: 2, stepUp: 2, bridge: 2, tabletop: 1 },
    props: [
      { kind: 'pine', weight: 6 },
      { kind: 'pineDead', weight: 1 },
      { kind: 'boulder', weight: 3 },
      { kind: 'rock', weight: 5 },
      { kind: 'grass', weight: 3 },
    ],
    treeDensity: 0.7,
  },
  [Biome.Canyon]: {
    length: [400, 650],
    baseAmp: 2.27,
    baseWave: 50,
    trend: 0.08,
    surface: Surface.Sand,
    features: { drop: 2, tabletop: 3, bridge: 2, rocks: 2, double: 2, stepUp: 1, whoops: 1 },
    props: [
      { kind: 'boulder', weight: 4 },
      { kind: 'rock', weight: 5 },
      { kind: 'cactus', weight: 2 },
      { kind: 'bush', weight: 1.5 },
      { kind: 'pineDead', weight: 0.6 },
    ],
    treeDensity: 0.15,
  },
  [Biome.River]: {
    length: [350, 550],
    baseAmp: 1.17,
    baseWave: 60,
    trend: 0.04,
    surface: Surface.Dirt,
    features: { bridge: 3, ford: 3, rollers: 2, whoops: 2, tabletop: 2, berm: 1 },
    props: [
      { kind: 'pine', weight: 6 },
      { kind: 'bush', weight: 4 },
      { kind: 'rock', weight: 3 },
      { kind: 'grass', weight: 6 },
      { kind: 'flower', weight: 3 },
    ],
    treeDensity: 0.8,
  },
  [Biome.Desert]: {
    length: [450, 750],
    baseAmp: 1.4,
    baseWave: 80,
    trend: 0.03,
    surface: Surface.Sand,
    features: { dunes: 5, rollers: 2, whoops: 2, tabletop: 2, wadi: 2, oasis: 1.2, ledges: 1.5, bridge: 1, berm: 1 },
    props: [
      { kind: 'shrub', weight: 6 },
      { kind: 'cactus', weight: 3 },
      { kind: 'deadTree', weight: 1 },
      { kind: 'sandstone', weight: 2.5 },
      { kind: 'rock', weight: 2 },
      { kind: 'tumbleweed', weight: 1 },
      { kind: 'grass', weight: 2 },
    ],
    treeDensity: 0,
  },
};

/** Integral-based ease: smooth ramp from 0 to 1 with zero slope at both ends. */
const ease = (u: number): number => smoothstep(u);
const sin2 = (u: number): number => {
  const s = Math.sin(Math.PI * u);
  return s * s;
};

/**
 * Streams terrain samples into the world. First a landscape (biome + base undulation), then
 * motocross features layered on top: jumps, doubles, gaps, whoops, berms, bridges...
 */
export class Generator {
  private rng: Rng;
  private cursor = 0; // next sample index to write
  private queue: Segment[] = [];
  private seg: Segment | null = null;
  private segX0 = 0;
  private segH0 = 0;
  private biome: Biome = Biome.Meadow;
  private biomeEnd = 0;
  private nextFuel = 180;
  private nextWater = 120;
  private nextCheckpoint = 1000;
  private propsCursor = 0; // x up to which props have been spawned

  private section = 0;
  private raceLen: number;
  private palette: Partial<Record<Slot, AssetDef[]>> = {};
  private paletteEnd = -1;
  /** Circuit grade 0..1 (circuits only). */
  private grade = 0;
  /** Track drawing multiplier: cruising +5 %, race circuits +35 % on top of that. */
  private hard = 1;
  private trialZones = Infinity;
  private trialDone = false;

  constructor(
    private world: World,
    seed: number,
    private region: RegionDef,
    private mode: ModeId = 'cruising',
    level = 1,
    private circuit = 0,
    /** Difficulty index = weather (0 sec, 1 nuageux, 2 pluie). */
    private diff = 0,
  ) {
    this.rng = new Rng(seed);
    if (mode === 'cruising') this.region = region = world.regionAt(0);
    this.biome = region.start;
    this.biomeEnd = mode === 'cruising' ? 1000 : 380;
    const circ = circuit > 0 && isCircuitMode(mode);
    if (!circ) this.circuit = 0;
    this.grade = circ ? circuitGrade(circuit) : 0;
    this.raceLen = circ && mode !== 'trial' ? circuitLength(mode, circuit) : raceLength(level);
    this.hard = (mode === 'cruising' ? 1.05 : mode === 'course' ? 1.05 * 1.5 : mode === 'enduro' ? 1.35 * 1.2 : 1) * [1, 0.97, 0.92][diff];
    if (circ && mode === 'trial') this.trialZones = trialZones(circuit);
    if (mode === 'enduro') this.nextCheckpoint = ENDURO_CP;
    if (region.id === 'cross' && mode !== 'cruising') {
      // v2.26: the motocross circuit itself (the game sets the finish line: laps)
      this.queue.push(this.mxSegment(false, MX_LEN * 6));
      this.world.marks.push({ x0: 6, x1: 10, kind: 'start' });
      return;
    }
    // A calm start straight.
    this.queue.push(this.flat(mode === 'trial' ? 20 : 60, Surface.Dirt));
    this.world.marks.push({ x0: 6, x1: 10, kind: 'start' });
    if (mode === 'course' || (circ && mode === 'enduro')) this.setFinish(5 + this.raceLen);
  }

  private setFinish(x: number): void {
    this.world.finishX = x;
    this.world.marks.push({ x0: x, x1: x + 2, kind: 'finish' });
  }

  /** Difficulty 0..1: grows with distance (endless) or with the circuit number. */
  private difficulty(x: number): number {
    if (this.circuit) return clamp(0.1 + this.grade * 0.75 + x / 20000, 0, 1);
    return clamp(x / 5000, 0, 1);
  }

  generateUntil(sampleIndex: number): void {
    while (this.cursor <= sampleIndex) {
      if (!this.seg || this.cursor * DX - this.segX0 > this.seg.len) this.startNextSegment();
      const seg = this.seg!;
      const x = this.cursor * DX;
      const t = x - this.segX0;
      const off = seg.shape(Math.min(t, seg.len));
      const h = this.segH0 + off;
      const vis = this.segH0 + (seg.visual ? seg.visual(Math.min(t, seg.len)) : off);
      const surf = seg.surface ? seg.surface(t, x) : this.baseSurface(x);
      this.world.writeSample(this.cursor, h, vis, surf, this.biome);
      this.maybePickup(x, h, seg, t);
      this.cursor++;
    }
  }

  private startNextSegment(): void {
    if (this.seg) {
      this.segH0 = this.segH0 + this.seg.shape(this.seg.len);
      this.segX0 += this.seg.len;
    }
    if (this.queue.length === 0) this.plan();
    this.seg = this.queue.shift()!;
    this.seg.onStart?.(this.segX0, this.segH0);
    if (this.seg.coins) this.placeCoins(this.seg, this.segX0, this.segH0);
    this.spawnProps(this.segX0, this.segX0 + this.seg.len, this.seg.props ?? 1);
  }

  /** Decide what comes next: maybe switch biome, then a base stretch and a feature. */
  private plan(): void {
    const x = this.segX0;
    if (x > this.world.finishX - 5 || this.trialDone) {
      // after the finish line: a long calm run-out
      this.queue.push(this.flat(300, Surface.Dirt));
      return;
    }
    if (this.mode === 'cruising') {
      // v2.25: the journey decides the world; a new environment of it every 1000 m
      const reg = this.world.regionAt(x);
      if (reg !== this.region) {
        this.region = reg;
        this.paletteEnd = 0;
        const all = (Object.keys(reg.biomes) as unknown as string[]).map((k) => Number(k) as Biome);
        if (!all.includes(this.biome)) this.biome = this.rng.weighted(all, all.map((b) => reg.biomes[b]!));
      }
      if (reg.id === 'cross' && !this.world.mxAt(x - 1)) {
        // v2.26: the track is ridden in 3D: entry lane, a lap and the main straight, exit lane
        this.queue.push(this.mxSegment(true, MX_ZONE_LEN));
        this.biomeEnd = Math.max(this.biomeEnd, x + MX_ZONE_LEN);
        return;
      }
      if (reg.id === 'cross') {
        // (the visit is over but the journey still says "cross" for a few metres)
        this.queue.push(this.flat(40, Surface.Dirt));
        return;
      }
    }
    if (x >= this.biomeEnd) {
      // stay in the region: pick another of its environments
      const all = (Object.keys(this.region.biomes) as unknown as string[]).map((k) => Number(k) as Biome);
      const options = all.length > 1 ? all.filter((b) => b !== this.biome) : all;
      this.biome = this.rng.weighted(options, options.map((b) => this.region.biomes[b]!));
      const def = BIOMES[this.biome];
      this.biomeEnd = this.mode === 'cruising' ? (Math.floor(x / 1000) + 1) * 1000 : x + this.rng.range(def.length[0], def.length[1]);
      // Smooth transition stretch.
      this.queue.push(this.base(this.rng.range(30, 45), 0.5));
    }
    if (this.mode === 'trial') {
      this.planTrial();
      return;
    }
    const mx = false as boolean; // (v2.25 random motocross stretch, replaced by the real track in v2.26)
    const baseSeg = this.base(mx ? this.rng.range(5, 10) : this.rng.range(this.mode === 'course' ? 10 : 18, this.mode === 'course' ? 28 : 50), mx ? 0.3 : this.mode === 'course' ? 0.6 : 1);
    if (this.mode !== 'course' && this.rng.chance(0.3)) baseSeg.coins = 'line';
    this.queue.push(baseSeg);
    const def = BIOMES[this.biome];
    const d0 = this.difficulty(x);
    let feats: Partial<Record<FeatureName, number>> = def.features;
    if (this.mode === 'course') {
      // race track: jumps, berms and rhythm sections whatever the scenery (dunes in the desert)
      feats = { tabletop: 4, double: 4, berm: 3, whoops: 2, rollers: 2, stepUp: 1, ...(this.biome === Biome.Desert ? { dunes: 2 } : {}) };
    } else if (this.mode === 'cruising') {
      // v2.25: built like the first enduro circuits (hills with a steep pitch, technical
      // sections, big jumps), plus the speed-window jumps of v2.21
      feats = { bigHill: 4, techHill: 2.5, tabletop: 1.5, double: 1.5, gap: 0.6, climb: 1.2, descent: 1.2, ford: 0.6, cruiseHill: 1.5, speedJump: 2.5 + d0 * 2 };
    } else if (this.mode === 'enduro') {
      // v2.18: no small obstacles on the ground — steep, technical hills and big jumps
      feats = { bigHill: 4 + this.grade * 2, techHill: 3 + this.grade * 2, tabletop: 1.5, double: 1.5 + this.grade, gap: 0.6 + this.grade, climb: 1.2, descent: 1.2, ford: 0.6 };
    }
    // the motocross track (its own world, and 1000 m of it now and then in cruising)
    if (mx) feats = { tabletop: 4, double: 4, whoops: 3.5, rollers: 3.5, stepUp: 1.5, berm: 2 };
    const names = Object.keys(feats) as FeatureName[];
    const weights = names.map((n) => feats[n]!);
    const f = this.rng.weighted(names, weights);
    const segs = this.feature(f, this.difficulty(x));
    if (f === 'tabletop' || f === 'double' || f === 'rollers' || f === 'dunes') {
      const main = segs.reduce((a, b) => (b.len > a.len ? b : a));
      // on the motocross track the coins hang in the air, on the ideal line of every jump
      if (mx ? f !== 'rollers' || this.rng.chance(0.5) : this.rng.chance(this.mode === 'course' ? 0.35 : 0.6)) main.coins = 'arc';
    }
    this.queue.push(...segs);
    const every = this.mode === 'enduro' ? ENDURO_CP : 1000;
    if (this.mode !== 'course' && x + 120 > this.nextCheckpoint && this.nextCheckpoint < this.world.finishX - 100) {
      const cx = this.nextCheckpoint;
      this.world.marks.push({ x0: cx, x1: cx + 2, kind: 'checkpoint', n: Math.round(cx / every) });
      this.nextCheckpoint += every;
    }
  }

  /**
   * Trial: a chain of numbered sections. Each one = start gate, 3 to 6 obstacles taken from
   * the trial catalog (harder tiers unlock as sections go by), end gate, then a short
   * liaison. Obstacles keep a flat run-up and landing so they can be taken slowly.
   */
  private planTrial(): void {
    const r = this.rng;
    const n = ++this.section;
    const circ = this.circuit > 0;
    // circuits: big obstacles, harder with the circuit number and along the circuit
    const pos = circ ? (n - 1) / Math.max(1, this.trialZones - 1) : 0;
    const level = this.grade * 0.75 + pos * 0.35;
    const tierMax = circ ? (level < 0.2 ? 1 : level < 0.55 ? 2 : 3) : n <= 2 ? 1 : n <= 4 ? 2 : 3;
    this.queue.push({
      len: circ ? 6 : 10,
      shape: () => 0,
      surface: () => Surface.Dirt,
      onStart: (x0) => {
        this.world.marks.push({ x0: x0 + 3, x1: x0 + 3.5, kind: 'sectionStart', n });
        this.decor(x0 + 3, 'trial', 't.gate.0', 0.08);
      },
      props: 0.5,
    });
    const all = assetsFor(['trial'], 'obstacle');
    const obstacles = all.filter((a) => a.obstacle!.tier <= tierMax && !!a.obstacle!.big === circ && !a.obstacle!.rock && !a.obstacle!.module);
    const count = circ ? 3 + Math.round(this.grade * 2 + pos) : 3 + Math.min(4, Math.floor(n / 2));
    // circuits: mostly rocks of the world's stone, bigger with the circuit number; the last
    // zone always holds the biggest one
    const kind = rockKindFor(this.region.id);
    const rocks = all.filter((a) => a.obstacle!.rock && a.id.startsWith(`tr.rock.${kind}.`));
    const [lo, hi] = circ ? trialRockRange(this.circuit, this.diff) : [0, 0];
    const pickRock = (h: number) => {
      let best = rocks[0];
      for (const a of rocks) if (a.obstacle!.h <= h + 1e-6 && (a.obstacle!.h > best.obstacle!.h || (a.obstacle!.h === best.obstacle!.h && r.chance(0.5)))) best = a;
      return best;
    };
    if (!circ) {
      for (let k = 0; k < count; k++) {
        this.queue.push(this.obstacleSeg(r.weighted(obstacles, obstacles.map((o) => (o.obstacle!.tier === tierMax ? 3 : 1)))));
        this.queue.push(this.flat(r.range(3.5, 6), Surface.Dirt));
      }
    } else this.technicalZone(n, count, pos, rocks, lo, hi, pickRock);
    this.queue.push({
      len: 8,
      shape: () => 0,
      surface: () => Surface.Dirt,
      onStart: (x0) => {
        this.world.marks.push({ x0: x0 + 3, x1: x0 + 3.5, kind: 'sectionEnd', n });
        this.decor(x0 + 3, 'trial', 't.gate.1', 0.08);
        // judges, scoreboard and spectators around the end of the section
        for (const slot of [0.3, 0.55, 0.8]) this.decor(x0 + r.range(-6, 6), 'trial', undefined, slot);
      },
    });
    if (n >= this.trialZones) {
      // last zone: the finish line and the chrono arch
      this.trialDone = true;
      this.queue.push({
        len: 30,
        shape: () => 0,
        surface: () => Surface.Dirt,
        onStart: (x0) => {
          this.setFinish(x0 + 12);
          this.decor(x0 + 13, 'trial', 'tb.arch.' + r.int(0, 1), 0.02);
          for (let k = 0; k < 5; k++) this.decor(x0 + 6 + k * 3, 'trial', undefined, r.range(0.1, 0.4));
        },
      });
      return;
    }
    if (circ) {
      // short liaison to the next zone, with a little module structure on the way
      this.queue.push(this.flat(r.range(3, 4.5), Surface.Dirt), this.moduleStructure(Math.min(1.5, 0.6 + this.grade * 0.9), true), this.flat(r.range(3, 4.5), Surface.Dirt));
    } else this.queue.push(this.base(r.range(14, 22), 0.25));
  }

  /**
   * A technical trial zone: rocks of the world's stone mixed with furniture and nature
   * obstacles, chained in lines that ask for control — tight pairs, staircases, an obstacle
   * on a slope, an obstacle followed by a step down. Tighter and busier with the circuit.
   */
  private technicalZone(n: number, count: number, pos: number, rocks: AssetDef[], lo: number, hi: number, pickRock: (h: number) => AssetDef): void {
    const r = this.rng;
    const g = this.grade;
    const forest = this.region.id === 'foret' || this.region.id === 'alpes';
    const city = this.region.id === 'sf';
    const tech = assetsFor(['trial'], 'obstacle').filter((a) => a.obstacle!.tech && a.obstacle!.h <= hi + 0.05 && (!a.world || a.world === this.region.id));
    const pickTech = (maxH: number) => {
      const list = tech.filter((a) => a.obstacle!.h <= maxH + 0.05 && a.obstacle!.h >= Math.min(maxH - 0.6, lo - 0.2));
      const pool = list.length ? list : tech;
      // San Francisco: parked cars, skips, planters and street stairs first
      return r.weighted(pool, pool.map((a) => (a.world ? 6 : city ? (a.obstacle!.tech === 'nature' ? 0.2 : 1) : a.obstacle!.tech === 'nature' ? (forest ? 1.6 : 0.8) : forest ? 0.8 : 1.4)));
    };
    const pick = (h: number) => (r.chance(city ? 0.12 : 0.45) || !tech.length ? pickRock(h) : pickTech(h));
    const height = () => lo + (hi - lo) * Math.pow(r.next(), 1.3 - pos * 0.6);
    // more run-up when the ground is slippery (rain, snow): the bike needs room to get going
    const wet = [1, 1.25, 1.5][this.diff];
    const gap = () => (r.range(1.1, 2.2) + (1 - g) * 1.5) * wet;
    let left = count;
    let first = true;
    while (left > 0) {
      const p = first && n === this.trialZones ? 'single' : r.weighted(['single', 'pair', 'stair', 'slope', 'drop', 'modules', 'giant'], [2, 1 + g * 2, 0.6 + g * 2, 0.6 + g, 0.5 + g * 1.5, 3.5, 1 + g * 1.5]);
      const h = first && n === this.trialZones ? hi : height();
      first = false;
      if (p === 'pair' && left >= 2) {
        const h2 = height();
        // enough run-up between the two for the second one (and for a restart after a fall)
        this.queue.push(this.obstacleSeg(pick(h)), this.flat(Math.max(gap() * 0.8, (1.2 + h2 * 1.4) * wet), Surface.Dirt), this.obstacleSeg(pick(h2)));
        left -= 2;
      } else if (p === 'stair' && left >= 2) {
        const k = Math.min(left, 3);
        for (let j = 0; j < k; j++) {
          const hj = lo + ((h - lo) * (j + 1)) / k;
          this.queue.push(this.obstacleSeg(pick(hj)), this.flat(Math.max(gap() * 0.7, (1 + hj * 1.3) * wet), Surface.Dirt));
        }
        left -= k;
        continue;
      } else if (p === 'slope') {
        // the obstacle sits on a short climb: no run-up speed to help
        const s = r.range(0.12, 0.2);
        const L = r.range(5, 8);
        this.queue.push(this.dirt(this.slopeProfile([[L, s]], 0, 0, 2)), this.obstacleSeg(pick(Math.min(h, hi * 0.85))), this.dirt(this.slopeProfile([[L * 0.8, 0.02], [L, -s]], 0, 0, 2)));
        left--;
      } else if (p === 'giant') {
        // v2.18: one big module, about as high as the bike can climb here
        const capH = Math.min(hi + 0.15, moduleClimb(expectedBike(Math.max(1, this.circuit), true).id, this.diff) - 0.1);
        const big = assetsFor(['trial'], 'obstacle').filter((a) => (a.obstacle!.module === 'gros' || a.obstacle!.module === 'support') && a.obstacle!.h <= capH + 1e-6 && a.obstacle!.h >= capH - 0.45);
        this.queue.push(this.obstacleSeg(big.length ? r.pick(big) : pick(h)));
        left--;
      } else if (p === 'modules') {
        // a structure of stacked trial modules (from the first circuits on)
        this.queue.push(this.moduleStructure(hi));
        left--;
      } else if (p === 'drop') {
        // up an obstacle, then a step down: control the front on the way down
        const D = r.range(0.4, 0.6 + g * 0.5) * (this.diff ? 0.8 : 1);
        this.queue.push(this.obstacleSeg(pick(h)), this.flat(1.2, Surface.Dirt), this.dirt(this.slopeProfile([[D / 0.9, -0.9], [3, 0]], 0, 0, 0.6)), this.flat(3, Surface.Dirt), this.dirt(this.slopeProfile([[D / 0.25, 0.25]], 0, 0, 2)), this.flat(2, Surface.Dirt));
        left--;
      } else {
        this.queue.push(this.obstacleSeg(pick(h)));
        left--;
      }
      // a real run-up before whatever comes next (also where you restart after a fall)
      this.queue.push(this.flat(Math.max(gap() + 1, (3.2 + hi * 0.8) * wet), Surface.Dirt));
    }
    void rocks;
  }

  /**
   * Trial module structure: modules side by side and stacked into staircases, pyramids,
   * towers, tables with ramps, doubles… Each rise is at most one module step (0.3 → 0.6 m
   * with the circuit), the top never above `maxH`. Neighbouring blocks overlap their
   * chamfers so there is no trap between them.
   */
  /** Highest module step for this circuit and weather (what the expected bike climbs, minus a margin). */
  private moduleStep(): number {
    const cap = moduleClimb(expectedBike(Math.max(1, this.circuit), true).id, this.diff) - 0.25;
    return Math.max(0.3, Math.min(cap, (0.45 + this.grade * 0.75) * [1, 0.92, 0.82][this.diff]));
  }

  private moduleStructure(maxH: number, small = false): Segment {
    const r = this.rng;
    const g = this.grade;
    const mods = assetsFor(['trial'], 'obstacle').filter((a) => a.obstacle!.module);
    const boxKinds = [...(this.region.id === 'sf' ? ['bloc', 'plateau', 'palette', 'pneus'] : this.region.id === 'foret' || this.region.id === 'alpes' ? ['caisse', 'pierre', 'palette', 'bloc'] : ['caisse', 'bloc', 'pneus', 'plateau', 'pierre']), 'gros'];
    const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
    const box = (h: number, minW = 0, maxW = 9) => {
      const list = mods.filter((a) => boxKinds.includes(a.obstacle!.module!) && near(a.obstacle!.h, h) && a.obstacle!.w >= minW && a.obstacle!.w <= maxW);
      return list.length ? r.pick(list) : (mods.find((a) => boxKinds.includes(a.obstacle!.module!) && near(a.obstacle!.h, h)) ?? mods.find((a) => near(a.obstacle!.h, h)) ?? mods[0]);
    };
    // v2.18: big steps — as high as the bike expected here climbs (with a margin), bigger
    // with the circuit; summits up to ~3 m with the big modules
    const maxStep = this.moduleStep() + 1e-6;
    const top = Math.max(0.45, small ? maxH : Math.min(maxH * 1.5, 0.9 + g * 2.1));
    const SINGLES = [0.3, 0.45, 0.6, 0.9, 1.05, 1.2, 1.35, 1.5, 1.8];
    const isSingle = (v: number) => SINGLES.some((h) => near(h, v));
    // reachable levels: one block, or a block of at most one step stacked on a wide base
    const steps = SINGLES.filter((t) => t <= maxStep);
    const stackOf = new Map<number, [number, number]>();
    for (const b of [0.6, 0.9, 1.2, 1.5]) for (const t of steps) if (!stackOf.has(Math.round((b + t) * 100)) && !SINGLES.some((h) => near(h, b + t))) stackOf.set(Math.round((b + t) * 100), [b, t]);
    const LEVELS = [...new Set([...SINGLES, ...[...stackOf.keys()].map((k) => k / 100)])].filter((v) => v <= top + 1e-6).sort((a, b) => a - b);
    type Place = { a: AssetDef; x: number; y: number };
    const place: Place[] = [];
    let x = 0;
    let prevRun = 0;
    let prevLvl = 0;
    /** Where a ground block of height H and chamfer run rn starts so the envelope has no dip. */
    const startFor = (H: number, rn: number) => Math.max(0, prevLvl <= 0 || prevRun <= 0 ? x - prevRun * 0.9 : H >= prevLvl ? x - prevRun - (rn * prevLvl) / H : x - (prevRun * H) / prevLvl - rn);
    /** A column reaching `v`: one block, or a narrower block stacked on a wide one. */
    const column = (v: number): void => {
      if (isSingle(v)) {
        // each step is wide enough to settle the bike before the next one
        // high steps get a wide top (a narrow tall block is a spike, not a step)
        const a = v > 0.7 ? box(v, this.diff === 2 ? 2.4 : 2, 3.6) : v > 0.55 && !small ? box(v, this.diff === 2 ? 2 : 1.6, 2.8) : box(v, small ? 0.8 : this.diff === 2 ? 1.6 : 1.2, small ? 1.6 : 2.4);
        const rn = Math.min(a.obstacle!.w / 3, v * 0.52);
        const start = startFor(v, rn);
        place.push({ a, x: start, y: 0 });
        x = start + a.obstacle!.w;
        prevRun = rn;
        prevLvl = v;
        return;
      }
      const [b, t] = stackOf.get(Math.round(v * 100)) ?? [0.6, Math.round((v - 0.6) * 100) / 100];
      // wide base, at least ~0.7 m of ledge each side of the block on top
      const base = box(b, 2.6, 3.2);
      const topB = box(t, 0.8, Math.max(0.8, base.obstacle!.w - 1.4));
      const rn = Math.min(base.obstacle!.w / 3, b * 0.52);
      const start = startFor(b, rn);
      place.push({ a: base, x: start, y: 0 });
      place.push({ a: topB, x: start + (base.obstacle!.w - topB.obstacle!.w) / 2, y: b });
      x = start + base.obstacle!.w;
      prevRun = rn;
      prevLvl = b;
    };
    const climb = (): number[] => {
      const out: number[] = [];
      let v = 0;
      while (true) {
        const next = LEVELS.filter((l) => l > v + 0.01 && l - v <= maxStep);
        if (!next.length) break;
        v = r.chance(0.6) ? next[next.length - 1] : r.pick(next);
        out.push(v);
        // a stacked block is the summit: only one tower per structure
        if (out.length >= (small ? 2 : this.diff === 2 ? 3 : 5) || v >= top - 0.01 || !isSingle(v)) break;
      }
      return out.length ? out : [0.3];
    };
    const pattern = small ? r.weighted(['escalier', 'pyramide', 'plateforme'] as const, [1, 1, 1]) : r.weighted(['escalier', 'pyramide', 'tour', 'table', 'double', 'touret', 'plateforme'] as const, [3, 3, 0.8 + g, 1.5, 1 + g, 1, 3.5]);
    const ramp = (h: number, dir: 'up' | 'down') => {
      const list = mods.filter((a) => a.obstacle!.module === 'rampe' && near(a.obstacle!.h, h) && a.id.endsWith(dir));
      return list.length ? r.pick(list) : null;
    };
    if (pattern === 'plateforme') {
      this.platform(place, mods, box, maxStep, top, small);
      x = place.reduce((m, p) => Math.max(m, p.x + p.a.obstacle!.w), 0);
    } else if (pattern === 'table') {
      const h = [0.45, 0.6, 0.9].filter((v) => v <= top + 1e-6).pop() ?? 0.45;
      const up = ramp(h, 'up');
      const deck = mods.filter((a) => a.obstacle!.module === 'plateau' && near(a.obstacle!.h, h));
      const down = ramp(h, 'down');
      if (up && deck.length && down) {
        const d = r.pick(deck);
        place.push({ a: up, x: 0, y: 0 });
        x = up.obstacle!.w - 0.25;
        place.push({ a: d, x, y: 0 });
        x += d.obstacle!.w - 0.25;
        place.push({ a: down, x, y: 0 });
        x += down.obstacle!.w;
      } else climb().forEach(column);
    } else if (pattern === 'double') {
      for (let k = 0; k < 2; k++) {
        climb().slice(0, 2).forEach(column);
        x += r.range(1, 1.6);
        prevRun = 0;
        prevLvl = 0;
      }
    } else if (pattern === 'touret') {
      const spool = mods.filter((a) => a.obstacle!.module === 'touret' && a.obstacle!.h <= Math.min(top, maxStep * 1.6) + 1e-6);
      column(0.3);
      if (spool.length) {
        const s0 = r.pick(spool);
        place.push({ a: s0, x: x - 0.1, y: 0 });
        x += s0.obstacle!.w - 0.1;
        prevRun = 0.2;
        prevLvl = 0;
      }
      column(Math.min(0.45, top));
    } else {
      const ups = climb();
      ups.forEach(column);
      if (pattern === 'pyramide' || pattern === 'tour') ups.slice(0, -1).reverse().forEach(column);
      else {
        // end: a ramp down when one fits, otherwise step down (the drop is part of the game)
        const last = ups[ups.length - 1];
        const dn = ramp(last, 'down');
        if (dn && r.chance(0.6)) {
          place.push({ a: dn, x: x - 0.2, y: 0 });
          x += dn.obstacle!.w - 0.2;
        }
      }
    }
    const len = x + 0.6;
    return {
      len,
      shape: (t) => {
        let y = 0;
        for (const p of place) {
          const o = p.a.obstacle!;
          const u = (t - 0.3 - p.x) / o.w;
          if (u > 0 && u < 1) y = Math.max(y, p.y + o.h * o.profile(u));
        }
        return y;
      },
      visual: () => 0,
      surface: () => Surface.Rock,
      noPickup: [[0, len]],
      onStart: (x0, h0) => {
        // stacked blocks are pushed after their base, so they are drawn on top of it
        for (const p of place) this.world.props.push({ x: x0 + 0.3 + p.x + p.a.obstacle!.w / 2, kind: 'asset', asset: p.a.id, depth: 0, scale: 1, variant: 0, flip: false, baseY: h0 + p.y });
        for (const [dx, f] of [[0.1, 'tb.flag.0'], [len - 0.1, 'tb.flag.1']] as [number, string][]) this.world.props.push({ x: x0 + dx, kind: 'asset', asset: f, depth: 0.03, scale: 0.75, variant: 0, flip: false });
      },
      props: 0.3,
    };
  }

  /**
   * v2.14 "plateforme": a wide support (0.3 → 1.2 m) reached by module steps, with crates or a
   * second, narrower support on top, sometimes a second support next to it for a bigger
   * structure, then steps back down. Every rise and every drop is at most one step, and the
   * blocks are chained so their chamfers never leave a dip between them.
   */
  private platform(place: { a: AssetDef; x: number; y: number }[], mods: AssetDef[], box: (h: number, minW?: number, maxW?: number) => AssetDef, maxStep: number, top: number, small: boolean): void {
    const r = this.rng;
    const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
    const kinds = this.region.id === 'sf' ? ['beton', 'acier', 'palettes'] : this.region.id === 'foret' || this.region.id === 'alpes' ? ['bois', 'pierre', 'palettes'] : ['bois', 'beton', 'acier', 'pierre', 'palettes'];
    const kind = r.pick(kinds);
    const sups = mods.filter((a) => a.obstacle!.module === 'support');
    const support = (h: number, minW: number, maxW: number) => {
      const list = sups.filter((a) => near(a.obstacle!.h, h) && a.obstacle!.w >= minW && a.obstacle!.w <= maxW);
      const own = list.filter((a) => a.id.startsWith(`ts.${kind}.`));
      return own.length ? r.pick(own) : list.length ? r.pick(list) : null;
    };
    const runOf = (a: AssetDef) => Math.min(a.obstacle!.w / 3, a.obstacle!.h * 0.52);
    // a 0.3 m module step is always allowed (the smallest module), even on early snowy circuits
    maxStep = Math.max(maxStep, 0.3 + 1e-6);
    // summit allowed a bit above the usual top: it is the size, not the steps, that grows
    const cap = small ? Math.max(0.45, top) : Math.max(top, 0.9) + 0.35;
    const heights = [0.3, 0.45, 0.6, 0.9, 1.2].filter((h) => h <= (small ? Math.min(0.6, cap) : cap - 0.25) + 1e-6);
    let S = heights.length ? r.weighted(heights, heights.map((_h, i) => 1 + i * 0.6)) : 0.3;
    const minW = small ? 3 : this.diff === 2 ? 4 : 3;
    const base = support(S, minW, small ? 4 : 6)!;
    // ground-based chain: each block starts where the envelope stays monotone
    let xEnd = 0;
    let lvl = 0;
    let run = 0;
    const chain = (a: AssetDef) => {
      const H = a.obstacle!.h;
      const rn = runOf(a);
      const start = lvl <= 0 ? xEnd : H >= lvl ? xEnd - run - (rn * lvl) / H : xEnd - (run * H) / lvl - rn;
      place.push({ a, x: Math.max(0, start), y: 0 });
      xEnd = Math.max(0, start) + a.obstacle!.w;
      lvl = H;
      run = rn;
    };
    const singles = [0.3, 0.45, 0.6, 0.9, 1.05, 1.2, 1.35, 1.5];
    const path = (from: number, to: number): number[] | null => {
      const outL: number[] = [];
      let v = from;
      while (to - v > maxStep) {
        const opts = singles.filter((h) => h > v + 0.01 && h - v <= maxStep && h < to - 0.01);
        if (!opts.length) return null;
        v = opts[opts.length - 1];
        outL.push(v);
      }
      return outL;
    };
    // the support must be reachable one step at a time
    while (S > 0.3 && !path(0, S)) S = heights.filter((h) => h < S - 0.01).pop() ?? 0.3;
    const stepW = small ? 1.2 : this.diff === 2 ? 1.6 : 1.2;
    const up = path(0, S) ?? [];
    for (const v of up) chain(box(v, stepW, 2.4));
    chain(base);
    const sx = place[place.length - 1].x;
    const sw = base.obstacle!.w;
    const sr = runOf(base);
    // on top: a block, two blocks, or a narrower support (one step up each time)
    const tops = [0.3, 0.45, 0.6, 0.9].filter((t) => t <= maxStep && S + t <= cap + 1e-6);
    if (tops.length && r.chance(small ? 0.5 : 0.85)) {
      const t = r.pick(tops);
      const flat = sw - 2 * sr;
      // at least ~1.8 m of shelf around what stands on the support (run-up for the next step)
      const choice = r.weighted(['bloc', 'deux', 'socle', 'rien'], [flat >= 5.2 ? 2 : 0, flat >= 7.8 ? 1.2 : 0, flat >= 6.6 ? 1.3 : 0, 0.3]);
      if (choice === 'socle') {
        const s2 = support(t, 3, Math.min(4, flat - 3.6));
        if (s2) place.push({ a: s2, x: sx + (sw - s2.obstacle!.w) / 2, y: S });
      } else if (choice === 'deux') {
        const b1 = box(t, t >= 0.45 ? 1.6 : 0.8, t >= 0.45 ? 2 : 1.2);
        const b2 = box(t, t >= 0.45 ? 1.6 : 0.8, t >= 0.45 ? 2 : 1.2);
        const gapX = flat - b1.obstacle!.w - b2.obstacle!.w;
        place.push({ a: b1, x: sx + sr + gapX / 3, y: S });
        place.push({ a: b2, x: sx + sw - sr - gapX / 3 - b2.obstacle!.w, y: S });
      } else if (choice === 'bloc') {
        const b = box(t, t >= 0.45 ? 1.6 : 0.8, Math.max(t >= 0.45 ? 1.6 : 0.8, Math.min(2.4, flat - 3.6)));
        place.push({ a: b, x: sx + (sw - b.obstacle!.w) / 2, y: S });
      }
    }
    let last = S;
    // a second support next to it, one step higher or lower: a bigger structure
    if (!small && r.chance(0.4)) {
      const opts = heights.filter((h) => !near(h, S) && Math.abs(h - S) <= maxStep && path(0, h));
      if (opts.length) {
        const S2 = r.pick(opts);
        const b2 = support(S2, minW, 5);
        if (b2) {
          chain(b2);
          last = S2;
        }
      }
    }
    for (const v of (path(0, last) ?? []).reverse()) chain(box(v, stepW, 2.4));
  }

  /** Packed earth surface on a segment (trial zones keep their grip whatever the weather). */
  private dirt(seg: Segment): Segment {
    seg.surface = () => Surface.Dirt;
    return seg;
  }

  /** A physical catalog obstacle with a short flat margin on each side. */
  private obstacleSeg(a: AssetDef): Segment {
    const o = a.obstacle!;
    const pad = 0.3;
    const top = (t: number) => {
      const u = (t - pad) / o.w;
      return u <= 0 || u >= 1 ? 0 : o.h * o.profile(u);
    };
    if (o.big) {
      // big trial obstacles: packed-earth ramps against both faces (as on real trial
      // sections) keep every face at ≤ ~50°, so they are climbable at walking pace
      const ramp = o.h * 0.75;
      const len = o.w + ramp * 2;
      const slope = o.h / ramp;
      return {
        len,
        shape: (t) => Math.max(top(t - ramp + pad), Math.min(o.h * 0.92, t * slope, (len - t) * slope)),
        visual: (t) => Math.min(o.h * 0.92, t * slope, (len - t) * slope) * (t < ramp || t > len - ramp ? 1 : 0),
        surface: () => (a.id.includes('rock') || a.id.includes('boulder') || a.id.includes('stone') || a.id.includes('slab') ? Surface.Rock : Surface.Wood),
        noPickup: [[0, len]],
        onStart: (x0, h0) => this.world.props.push({ x: x0 + ramp + o.w / 2, kind: 'asset', asset: a.id, depth: 0, scale: 1, variant: 0, flip: false, baseY: h0 }),
        props: 0.3,
      };
    }
    const trialMark = this.mode === 'trial' && (o.rock || o.tech);
    return {
      len: o.w + pad * 2,
      onStart: (x0, h0) => {
        this.world.props.push({ x: x0 + pad + o.w / 2, kind: 'asset', asset: a.id, depth: 0, scale: 1, variant: 0, flip: false, baseY: h0 });
        // zone stakes with tape on both sides: this is the course, not scenery
        if (trialMark) for (const [dx, f] of [[0.1, 'tb.flag.0'], [o.w + pad * 2 - 0.1, 'tb.flag.1']] as [number, string][]) this.world.props.push({ x: x0 + dx, kind: 'asset', asset: f, depth: 0.03, scale: 0.75, variant: 0, flip: false });
      },
      shape: top,
      // the drawn obstacle stands on the flat ground: the track band does not bulge under it
      visual: () => 0,
      surface: () => (o.rock || o.tech || a.id.includes('rock') || a.id.includes('stone') ? Surface.Rock : Surface.Wood),
      noPickup: [[0, o.w + pad * 2]],
      props: 0.3,
    };
  }

  /** Mode decor (trackside) at a given x: a specific asset or a random one of the group. */
  private decor(x: number, group: AssetGroup, id?: string, depth = this.rng.range(0.05, 0.35)): void {
    let assetId = id;
    if (!assetId) {
      const list = assetsFor([group], 'trackside');
      if (!list.length) return;
      assetId = this.rng.weighted(list, list.map((a) => a.weight ?? 1)).id;
    }
    this.world.props.push({ x, kind: 'asset', asset: assetId, depth, scale: 1, variant: 0, flip: false });
  }

  /** Coins along the ground (line) or in an arc over the top of a jump. */
  private placeCoins(seg: Segment, x0: number, h0: number): void {
    const n = 5;
    if (seg.coins === 'line') {
      const t0 = seg.len / 2 - 3;
      for (let k = 0; k < n; k++) {
        const t = t0 + k * 1.5;
        if (t < 0 || t > seg.len) continue;
        this.world.coins.push({ x: x0 + t, y: h0 + seg.shape(t) + 0.95, taken: false, takenAt: 0 });
      }
    } else {
      let tMax = 0;
      let hMax = -1e9;
      for (let t = 0; t <= seg.len; t += 0.5) {
        const h = seg.shape(t);
        if (h > hMax) {
          hMax = h;
          tMax = t;
        }
      }
      for (let k = 0; k < n; k++) {
        const u = k / (n - 1) - 0.5;
        const t = tMax + 2 + u * 7;
        this.world.coins.push({ x: x0 + t, y: h0 + Math.max(seg.shape(Math.min(seg.len, Math.max(0, t))), hMax * 0.8) + 1.5 + (0.25 - u * u) * 2.4, taken: false, takenAt: 0 });
      }
    }
  }

  private baseSurface(x: number): Surface {
    const s = this.dryBaseSurface(x);
    // rain: puddles of mud on the earth and the grass
    // rain and snow: patches of mud on the earth and the grass (cruising: where it is wet now)
    let wet = this.diff;
    if (this.world.dynamic) {
      const w = this.world.weatherAt(x);
      wet = w.wet > 0.5 ? 1 : w.snowGround > 0.5 ? 2 : 0;
    }
    if (wet >= 1 && (s === Surface.Dirt || s === Surface.Grass) && noise1(x / 17, 33) > (wet === 1 ? 0.3 : 0.45)) return Surface.Mud;
    return s;
  }

  private dryBaseSurface(x: number): Surface {
    const def = BIOMES[this.biome];
    const n = noise1(x / 23, 77);
    switch (this.biome) {
      case Biome.Canyon:
        return n > 0.45 ? Surface.Rock : Surface.Sand;
      case Biome.City:
        return Surface.Rock;
      case Biome.Desert:
        // mostly sand, packed-earth tracks (better grip) and the odd rock slab
        return n > 0.6 ? Surface.Rock : n < -0.25 ? Surface.Dirt : Surface.Sand;
      case Biome.Mountain:
        return n > 0.4 ? Surface.Rock : n < -0.6 ? Surface.Grass : Surface.Dirt;
      case Biome.River:
        return n > 0.5 ? Surface.Mud : Surface.Dirt;
      case Biome.Meadow:
        return n < -0.55 ? Surface.Grass : Surface.Dirt;
      default:
        return n > 0.62 ? Surface.Mud : def.surface;
    }
  }

  // ---------------------------------------------------------------- segments

  private flat(len: number, surf?: Surface): Segment {
    return { len, shape: () => 0, surface: surf !== undefined ? () => surf : undefined };
  }

  /**
   * v2.21 cruising: a gap jump onto a downhill landing ramp of limited length, then a flat far
   * below. It only works in a speed window: too slow drops into the gap, too fast flies past
   * the ramp and lands flat from high up (a fall). Each jump has its own window.
   */
  private speedJump(d: number): Segment[] {
    const r = this.rng;
    const g = 9.81 * GRAVITY_SCALE;
    const width = ((22 - d * 8) * 1.1) / 3.6; // window width (m/s), narrower further on (v2.22: +10 %)
    const lo = r.range(38, 62) / 3.6; // approach speed (m/s) at the low end
    const hi = lo + width;
    const Hk = r.range(1.3, 2.0);
    const th = r.range(0.3, 0.38);
    const Lk = (1.6 * Hk) / Math.tan(th);
    const lip = (v: number) => Math.sqrt(Math.max(4, v * v - 2 * g * Hk * 1.15)); // speed left at the lip
    const Ht = Hk - 0.2;
    const phi = r.range(0.38, 0.48);
    const tp = Math.tan(phi);
    const flight = (v: number) => g / (2 * v * v * Math.cos(th) ** 2);
    // ramp top: reached at the low end of the window
    const k1 = flight(lip(lo));
    const dxt = (Math.tan(th) + Math.sqrt(Math.tan(th) ** 2 + 4 * k1 * (Hk - Ht))) / (2 * k1);
    // ramp end: reached at the high end
    const k2 = flight(lip(hi));
    const a = Math.tan(th) + tp;
    const c = Hk - Ht + dxt * tp;
    const dxe = (a + Math.sqrt(a * a + 4 * k2 * c)) / (2 * k2);
    const Lr = Math.max(6, dxe - dxt);
    const pit = 0.6;
    const faceUp = (Ht + pit) / 1.3;
    const fall = (Hk + pit) / 1.1;
    const floor = Math.max(1.5, dxt - fall - faceUp);
    const drop = Lr * tp;
    const bottom = Ht - drop;
    const xa = Lk, xb = xa + fall, xc = xb + floor, xd = xc + faceUp, xe = xd + Lr, xf = xe + 4;
    const len = xf + 30;
    return [
      this.flat(r.range(30, 45)),
      {
        len,
        shape: (t) => {
          if (t < xa) return Hk * Math.pow(t / xa, 1.6);
          if (t < xb) return Hk - (Hk + pit) * ease((t - xa) / fall);
          if (t < xc) return -pit;
          if (t < xd) return -pit + (Ht + pit) * ease((t - xc) / faceUp);
          if (t < xe) return Ht - drop * ((t - xd) / Lr) + 0.4 * Math.sin(Math.PI * Math.min(1, (t - xd) / 2)) * 0;
          if (t < xf) return bottom - 0.3 * Math.sin(((t - xe) / 4) * Math.PI);
          return bottom;
        },
        surface: () => Surface.Dirt,
        noPickup: [[0, len]],
        onStart: (x0) => this.world.marks.push({ x0, x1: x0 + xa, kind: 'kicker', vmin: Math.round(lo * 3.6), vmax: Math.round(hi * 3.6) }),
        props: 0.3,
      },
    ];
  }

  /** v2.26: the motocross track as one segment of the 2D world (height along its path). */
  private mxSegment(cruise: boolean, len: number): Segment {
    return {
      len,
      shape: (t) => (t >= len ? 0 : mxPathHeight(t, cruise)),
      surface: () => Surface.Dirt,
      noPickup: [[0, len]],
      props: 0,
      onStart: (x0, h0) => {
        this.world.mxZones.push({ x0, x1: x0 + len, h0, cruise });
        // coins in the air, on the ideal line of every jump
        const laps = cruise ? 2 : 6;
        for (let lap = 0; lap < laps; lap++)
          for (const f of cruise ? MX_FEATURES_CRUISE : MX_FEATURES) {
            if (f.h < 1) continue;
            const u = ((f.s0 - MX_STRAIGHT[0]) % MX_LEN + MX_LEN) % MX_LEN + lap * MX_LEN + (cruise ? MX_ENTRY : 0);
            if (cruise && u + f.len > MX_ENTRY + MX_CRUISE_LOOP) continue;
            if (u + f.len > len) continue;
            for (let k = 0; k < 5; k++) {
              const t = f.len * (0.35 + (k / 4) * 0.55);
              this.world.coins.push({ x: x0 + u + t, y: h0 + f.h + 1.2 + Math.sin((k / 4) * Math.PI) * 1.0, taken: false, takenAt: 0 });
            }
          }
      },
    };
  }

  /** Natural ground: biome undulation plus a gentle trend that keeps altitude bounded. */
  private base(len: number, ampScale: number): Segment {
    const def = BIOMES[this.biome];
    const seed = this.rng.int(0, 1e6);
    const pull = clamp(-this.segH0 / 260, -0.08, 0.08);
    const trend = clamp(this.rng.range(-def.trend, def.trend) + pull, -0.22, 0.22);
    const amp = def.baseAmp * ampScale * this.hard;
    const wave = def.baseWave;
    const n0 = fbm1(0, seed, 4);
    return {
      len,
      shape: (t) => {
        const fade = smoothstep(t / 8);
        return trend * t + amp * (fbm1(t / wave, seed, 4) - n0) * fade;
      },
    };
  }

  private feature(name: FeatureName, d: number): Segment[] {
    const r = this.rng;
    const k = this.hard;
    switch (name) {
      case 'tabletop': {
        const H = (r.range(1.0, 1.7) + d * 0.5) * k;
        const Lr = H * r.range(4.2, 5); // ~14° lip: realistic, not a launch pad
        const top = r.range(7, 13);
        const Ld = H * r.range(5, 6.5);
        const len = Lr + top + Ld;
        return [
          this.flat(4),
          {
            len,
            shape: (t) => {
              if (t < Lr) return H * Math.pow(t / Lr, 1.25);
              if (t < Lr + top) return H;
              return H * (1 - ease((t - Lr - top) / Ld));
            },
            surface: () => Surface.Dirt,
            onStart: (x0) => this.world.marks.push({ x0, x1: x0 + Lr, kind: 'kicker' }),
            props: 0.6,
          },
        ];
      }
      case 'double':
      case 'gap': {
        const gap = name === 'gap';
        const H = (r.range(1.0, 1.5) + d * 0.4) * k;
        const Lr = H * r.range(4, 4.8);
        const down = gap ? r.range(2, 3.5) + d * 2 : 0;
        const fall = (H + down) / 0.9;
        const G = gap ? r.range(2, 5) : r.range(1.5, 3) + d;
        const H2 = H * r.range(0.8, 1.0);
        const rise = (H2 + down) / 0.9;
        const roundTop = 1.5;
        const Ld = H2 * r.range(5, 6.5);
        const a = Lr;
        const b = a + fall;
        const c = b + G;
        const e = c + rise;
        const f = e + roundTop;
        const len = f + Ld;
        return [
          this.flat(5),
          {
            len,
            shape: (t) => {
              if (t < a) return H * Math.pow(t / a, 1.25);
              if (t < b) return H - (H + down) * ease((t - a) / fall);
              if (t < c) return -down;
              if (t < e) return -down + (H2 + down) * ease((t - c) / rise);
              if (t < f) return H2;
              return H2 * (1 - ease((t - f) / Ld));
            },
            surface: (t) => (gap && t > a && t < e ? Surface.Rock : Surface.Dirt),
            noPickup: [[a - 2, f]],
            onStart: (x0) => this.world.marks.push({ x0, x1: x0 + Lr, kind: 'kicker' }),
            props: 0.4,
          },
        ];
      }
      case 'speedJump':
        return this.speedJump(d);
      case 'stepUp': {
        const H = (r.range(0.7, 1.2) + d * 0.3) * k;
        const L = H * 5;
        return [
          this.flat(4),
          { len: L + 6, shape: (t) => (t < L ? H * ease(t / L) : H), props: 0.7 },
        ];
      }
      case 'drop': {
        const kick = 0.12;
        const D = (r.range(1.0, 1.8) + d * 0.5) * k;
        const lipLen = 3;
        const faceLen = D / 0.75;
        const runout = 8;
        return [
          this.flat(6),
          {
            len: lipLen + faceLen + runout,
            shape: (t) => {
              if (t < lipLen) return kick * Math.sin((Math.PI / 2) * (t / lipLen));
              if (t < lipLen + faceLen) return kick - (kick + D) * ease((t - lipLen) / faceLen);
              return -D;
            },
            noPickup: [[lipLen - 1, lipLen + faceLen]],
            props: 0.6,
          },
        ];
      }
      case 'whoops': {
        const n = r.int(6, 11);
        const s = r.range(3.2, 4.4);
        const a = (r.range(0.22, 0.38) + d * 0.1) * k;
        return [
          {
            len: n * s,
            shape: (t) => a * sin2(t / s),
            onStart: (x0) => this.world.marks.push({ x0, x1: x0 + n * s, kind: 'whoops' }),
            surface: () => Surface.Dirt,
          },
        ];
      }
      case 'rollers': {
        const n = r.int(3, 5);
        const s = r.range(13, 17);
        const a = (r.range(0.6, 1.0) + d * 0.2) * k;
        return [{ len: n * s, shape: (t) => a * sin2(t / s) }];
      }
      case 'berm': {
        const L = r.range(16, 22);
        return [
          {
            len: L,
            shape: (t) => 0.7 * k * sin2(t / L),
            surface: () => Surface.Dirt,
            onStart: (x0) => this.world.marks.push({ x0, x1: x0 + L, kind: 'berm' }),
          },
        ];
      }
      case 'bridge': {
        const kinds = Object.keys(this.region.bridges) as BridgeKind[];
        const kind = r.weighted(kinds, kinds.map((k) => this.region.bridges[k]!));
        const water = this.biome === Biome.River || (this.biome !== Biome.Desert && r.chance(kind === 'viaduct' ? 0.4 : 0.5));
        let L: number;
        let D: number;
        let sag: number;
        let spans: number;
        switch (kind) {
          case 'wood':
            L = r.range(16, 30);
            D = water ? r.range(3.5, 5) : r.range(5, 9);
            sag = Math.min(0.5, L / 60);
            spans = 1;
            break;
          case 'stone':
            spans = r.int(1, 3);
            L = spans * r.range(9, 13);
            D = water ? r.range(4, 6) : r.range(5, 9);
            sag = -r.range(0.5, 0.9); // humpback deck
            break;
          case 'iron':
            spans = r.int(1, 3);
            L = spans * r.range(14, 18);
            D = water ? r.range(5, 7) : r.range(7, 12);
            sag = 0;
            break;
          case 'urban':
            // concrete overpass over a street, a railway or the bay
            spans = r.int(2, 4);
            L = spans * r.range(12, 16);
            D = water ? r.range(5, 8) : r.range(6, 10);
            sag = -r.range(0.2, 0.5);
            break;
          case 'viaduct':
          default:
            spans = r.int(4, 7);
            L = spans * r.range(10, 13);
            D = r.range(15, 24);
            sag = 0;
            break;
        }
        const approach = 4;
        const total = approach * 2 + L;
        const cliff = kind === 'viaduct' ? 10 : 3;
        return [
          this.flat(6),
          {
            len: total,
            shape: (t) => {
              if (t < approach || t > approach + L) return 0;
              const u = (t - approach) / L;
              if (sag < 0) {
                // stone humpback: smooth ramps on and off the arch
                return -sag * Math.sin(Math.PI * u) ** 1.5;
              }
              return -sag * Math.sin(Math.PI * u);
            },
            visual: (t) => {
              const u = t - approach;
              const wall = smoothstep(u / cliff) * smoothstep((L - u) / cliff);
              // V-shaped valley for viaducts, steep gorge otherwise
              const shape = kind === 'viaduct' ? Math.sin(Math.PI * clamp(u / L, 0, 1)) ** 0.6 : 1;
              const rough = noise1(t * 0.7, 9) * 0.6;
              return -(D * shape + rough) * wall;
            },
            surface: (t) =>
              t > approach && t < approach + L ? (kind === 'stone' || kind === 'viaduct' ? Surface.Rock : Surface.Wood) : Surface.Dirt,
            noPickup: [[approach - 1, approach + L + 1]],
            onStart: (x0, h0) =>
              this.world.bridges.push({
                kind,
                x0: x0 + approach,
                x1: x0 + approach + L,
                deckY0: h0,
                deckY1: h0,
                floorY: h0 - D,
                water,
                sag,
                spans,
              }),
            props: 0.3,
          },
          this.flat(5),
        ];
      }
      case 'ford': {
        const L = r.range(9, 14);
        const depth = r.range(0.4, 0.7);
        return [
          this.flat(3),
          {
            len: L,
            shape: (t) => -depth * sin2(t / L),
            surface: (t) => (t > 1.5 && t < L - 1.5 ? Surface.Water : Surface.Mud),
            onStart: (x0) => this.world.marks.push({ x0, x1: x0 + L, kind: 'ford' }),
            props: 0.5,
          },
        ];
      }
      // ------------------------------------------------ desert set
      // Rules (keep the ride fair): no pit deeper than 1.6 m, every face ≤ ~0.3 slope on the
      // side you ride up, lee sides ≤ ~0.35, crests rounded so they never launch hard.
      case 'dunes': {
        // asymmetric dunes: long gentle windward rise, rounded crest, steeper (but safe) lee
        const n = r.int(2, 4);
        const out: Segment[] = [];
        for (let j = 0; j < n; j++) {
          const H = (r.range(1.2, 2.6) + d * 0.5) * k;
          const up = H / r.range(0.12, 0.17);
          const down = H / r.range(0.24, 0.32);
          const crest = r.range(3, 6);
          const L = up + crest + down;
          out.push({
            len: L,
            shape: (t) => {
              if (t < up) return H * ease(t / up);
              if (t < up + crest) return H;
              return H * (1 - ease((t - up - crest) / down));
            },
            surface: (t) => (t > up * 0.2 && t < up + crest + down * 0.8 ? Surface.Sand : Surface.Dirt),
            props: 0.6,
          });
          out.push(this.flat(r.range(4, 12), Surface.Sand));
        }
        return out;
      }
      case 'wadi': {
        // dry riverbed: gentle banks down to a stony bed, then back up (never a trap)
        const D = r.range(0.9, 1.5);
        const bank = D / r.range(0.2, 0.28);
        const bed = r.range(8, 16);
        const L = bank * 2 + bed;
        return [
          this.flat(3),
          {
            len: L,
            shape: (t) => {
              if (t < bank) return -D * ease(t / bank);
              if (t < bank + bed) return -D + 0.12 * Math.sin(t * 1.7) * Math.sin(t * 0.6);
              return -D * (1 - ease((t - bank - bed) / bank));
            },
            surface: (t) => (t > bank * 0.7 && t < bank + bed + bank * 0.3 ? Surface.Rock : Surface.Sand),
            onStart: (x0) => this.world.marks.push({ x0: x0 + bank, x1: x0 + bank + bed, kind: 'wadi' }),
            props: 0.5,
          },
        ];
      }
      case 'oasis': {
        // shallow pool between palm trees: a ford with packed earth around
        const L = r.range(10, 15);
        const depth = r.range(0.35, 0.55);
        return [
          this.flat(5, Surface.Dirt),
          {
            len: L,
            shape: (t) => -depth * sin2(t / L),
            surface: (t) => (t > 1.5 && t < L - 1.5 ? Surface.Water : Surface.Mud),
            onStart: (x0) => {
              this.world.marks.push({ x0, x1: x0 + L, kind: 'ford' });
              this.world.marks.push({ x0: x0 - 5, x1: x0 + L + 5, kind: 'oasis' });
              // palms close behind the pool and one in front
              for (const [dx, depth2] of [[-3, 0.25], [2, 0.5], [L * 0.6, 0.3], [L + 3, 0.7]] as [number, number][])
                this.world.props.push({ x: x0 + dx, kind: 'palm', depth: depth2, scale: r.range(0.9, 1.25), variant: r.int(0, 2), flip: r.chance(0.5) });
            },
            props: 0.3,
          },
          this.flat(5, Surface.Dirt),
        ];
      }
      case 'ledges': {
        // sandstone steps: up two or three low rock shelves with ramps, then a long ramp down
        const steps = r.int(2, 3);
        const hs: number[] = [];
        for (let j = 0; j < steps; j++) hs.push(r.range(0.35, 0.6) * k);
        const ramp = 1.6;
        const shelf = r.range(4, 7);
        const total = hs.reduce((a, b) => a + b, 0);
        const down = total / 0.2;
        const L = steps * (ramp + shelf) + down;
        return [
          {
            len: L,
            shape: (t) => {
              let y = 0;
              let x = 0;
              for (const h of hs) {
                if (t < x + ramp) return y + h * ease((t - x) / ramp);
                y += h;
                x += ramp;
                if (t < x + shelf) return y;
                x += shelf;
              }
              return y * (1 - ease((t - x) / down));
            },
            surface: (t) => (t < steps * (ramp + shelf) ? Surface.Rock : Surface.Sand),
            onStart: (x0) => this.world.marks.push({ x0, x1: x0 + steps * (ramp + shelf), kind: 'ledges' }),
            props: 0.5,
          },
        ];
      }
      case 'climb':
      case 'descent': {
        const L = r.range(35, 70);
        const s = (name === 'climb' ? 1 : -1) * (r.range(0.14, 0.26) + d * 0.08);
        const amp = BIOMES[this.biome].baseAmp * 0.4;
        const seed = r.int(0, 1e5);
        return [
          {
            len: L,
            shape: (t) => s * L * ease(t / L) + amp * fbm1(t / 18, seed, 3) * sin2(t / L),
          },
        ];
      }
      case 'bigHill':
        return this.bigHill(d);
      case 'techHill':
        return this.techHill();
      case 'cruiseHill':
        return this.cruiseHill(d);
      case 'enduroObs': {
        // one to three enduro obstacles (roots, fallen trees, stones, mossy logs) in a row
        const list = assetsFor(['enduro'], 'obstacle');
        const out: Segment[] = [];
        for (let k = 0; k < r.int(1, 3); k++) {
          out.push(this.obstacleSeg(r.weighted(list, list.map((a) => a.weight ?? 1))));
          out.push(this.flat(r.range(3, 8)));
        }
        return out;
      }
      case 'logs': {
        const n = r.int(1, 3);
        const spacing = r.range(5, 8);
        const L = n * spacing + 2;
        const bumps: number[] = [];
        for (let i = 0; i < n; i++) bumps.push(2 + i * spacing);
        return [
          {
            len: L,
            shape: (t) => {
              for (const bx of bumps) {
                const u = (t - bx) / 0.45;
                if (u > -1 && u < 1) return 0.26 * Math.sqrt(1 - u * u);
              }
              return 0;
            },
            onStart: (x0) => {
              for (const bx of bumps)
                this.world.props.push({ x: x0 + bx, kind: 'log', depth: 0, scale: 1, variant: 0, flip: false });
            },
          },
        ];
      }
      case 'rocks': {
        const L = r.range(14, 24);
        const bumps: [number, number, number][] = [];
        for (let x = 1.5; x < L - 1.5; x += r.range(1.4, 3)) bumps.push([x, (r.range(0.08, 0.2) + d * 0.05) * k, r.range(0.6, 1.2)]);
        return [
          {
            len: L,
            shape: (t) => {
              let y = 0;
              for (const [bx, bh, bw] of bumps) {
                const u = (t - bx) / bw;
                if (u > -1 && u < 1) y = Math.max(y, bh * (0.5 + 0.5 * Math.cos(Math.PI * u)));
              }
              return y;
            },
            surface: () => Surface.Rock,
          },
        ];
      }
    }
  }

  /**
   * Terrain from a slope programme: pieces of (length, slope); slope changes are blended over a
   * few metres so there is never a kink, then optional bumps are added on the sloped parts.
   */
  private slopeProfile(pieces: [number, number][], bump: number, seed: number, blend = 4): Segment {
    const step = 0.25;
    const L = pieces.reduce((a, p) => a + p[0], 0);
    const n = Math.ceil(L / step) + 1;
    const ys = new Float32Array(n);
    const ends: number[] = [];
    let acc = 0;
    for (const p of pieces) ends.push((acc += p[0]));
    const slopeAt = (t: number) => {
      // smooth blend between neighbouring pieces
      let i = 0;
      while (i < pieces.length - 1 && t > ends[i]) i++;
      const s0 = pieces[i][1];
      const start = i ? ends[i - 1] : 0;
      if (i > 0 && t - start < blend / 2) return pieces[i - 1][1] + (s0 - pieces[i - 1][1]) * smoothstep((t - start + blend / 2) / blend);
      if (i < pieces.length - 1 && ends[i] - t < blend / 2) return s0 + (pieces[i + 1][1] - s0) * smoothstep((t - ends[i] + blend / 2) / blend);
      return s0;
    };
    let y = 0;
    for (let k = 1; k < n; k++) {
      const t = k * step;
      y += slopeAt(t - step / 2) * step;
      ys[k] = y;
    }
    const end = ys[n - 1];
    return {
      len: L,
      shape: (t) => {
        const f = Math.min(n - 1.001, Math.max(0, t / step));
        const i = Math.floor(f);
        let h = ys[i] + (ys[i + 1] - ys[i]) * (f - i);
        if (bump > 0) {
          const s = Math.abs(slopeAt(t));
          // bumps on the slopes (not on the flats), faded at both ends of the hill
          h += bump * Math.min(1, s * 6) * smoothstep(t / 6) * smoothstep((L - t) / 6) * (0.5 + 0.5 * noise1(t / 2.2, seed));
        }
        return t >= L ? end : h;
      },
    };
  }

  /**
   * Enduro hills, mixed along each circuit: classic, camel (two humps), terraces, short and
   * steep, long and gentle, valley, ridge with rollers. Hard to ride without falling, but
   * never trial: everything is a slope, no wall.
   */
  private bigHill(d: number): Segment[] {
    const r = this.rng;
    const g = this.circuit ? this.grade : Math.min(0.12, d * 0.25); // cruising: like the first enduro circuits
    // v2.18: higher and steeper from the first circuits
    // v2.21: +20 % (height, steepness, bumps)
    const H = (r.range(9, 13) + g * 12) * HILL_SCALE[this.diff] * 1.2;
    const su = (r.range(0.24, 0.3) + g * 0.1) * (this.diff ? 0.93 : 1) * 1.12;
    const sd = (r.range(0.26, 0.32) + g * 0.1) * (this.diff ? 0.93 : 1) * 1.12;
    const bump = (0.2 + g * 0.25) * 1.2;
    const variant = r.weighted(['classic', 'camel', 'terraces', 'steepShort', 'longGentle', 'valley', 'ridge'], [3, 2, 2, 1.5, 1.5, 1.5, 1.5]);
    let pieces: [number, number][];
    switch (variant) {
      case 'camel':
        pieces = [[(H * 0.6) / su, su], [4, 0], [(H * 0.3) / sd, -sd], [5, 0], [(H * 0.7) / su, su], [5, 0], [H / sd, -sd]];
        break;
      case 'terraces': {
        const k = r.int(3, 4);
        pieces = [];
        for (let j = 0; j < k; j++) pieces.push([H / k / (su * 1.25), su * 1.25], [r.range(5, 9), 0.02]);
        pieces.push([H / sd, -sd]);
        break;
      }
      case 'steepShort':
        pieces = [[H * 0.7 / (su * 1.45), su * 1.45], [5, 0], [(H * 0.7) / (sd * 0.6), -sd * 0.6]];
        break;
      case 'longGentle':
        pieces = [[H / (su * 0.6), su * 0.6], [4, 0], [H / (sd * 1.3), -sd * 1.3]];
        break;
      case 'valley': {
        const D = H * 0.7;
        pieces = [[D / sd, -sd], [r.range(6, 12), 0], [D / su, su]];
        break;
      }
      case 'ridge':
        pieces = [[H / su, su], [r.range(18, 30), 0], [H / sd, -sd]];
        break;
      default:
        pieces = [[H / su, su], [r.range(4, 9), 0], [H / sd, -sd]];
    }
    // a short steeper pitch inside the first climb, from the first circuits on
    {
      const i = pieces.findIndex((p) => p[1] > 0.05);
      if (i >= 0) {
        const [L0, s0] = pieces[i];
        const sSteep = (r.range(0.5, 0.58) + g * 0.12) * (this.diff ? 0.92 : 1) * 1.1;
        const hs = Math.min(L0 * s0 * 0.45, (2.4 + g * 2.2) * 1.2);
        const rest = (L0 * s0 - hs) / s0;
        pieces.splice(i, 1, [rest * 0.5, s0], [hs / sSteep, sSteep], [rest * 0.5, s0]);
      }
    }
    const seed = r.int(0, 1e5);
    const seg = this.slopeProfile(pieces, bump, seed, 3);
    const top = pieces[0][0];
    if (variant === 'ridge') {
      // rollers on the ridge
      const base = seg.shape;
      const a = pieces[0][0];
      const b = a + pieces[1][0];
      seg.shape = (t) => base(t) + (t > a + 2 && t < b - 2 ? (0.35 + g * 0.3) * sin2((t - a - 2) / 6) : 0);
    }
    seg.surface = (t) => (noise1(t / 9, seed + 3) > 0.35 ? Surface.Rock : Surface.Dirt);
    seg.noPickup = [[0, seg.len]];
    seg.props = 0.8;
    seg.onStart = (x0) => {
      if (variant !== 'valley') this.decor(x0 - 3, 'enduro', 'eb.steep.0', 0.1);
      this.decor(x0 + top, 'enduro', 'eb.hillflag.' + r.int(0, 3), 0.06);
    };
    return [this.flat(6), seg, this.flat(5)];
  }

  /**
   * v2.18 enduro technical section: a chain of short, steep pitches up and down (rocky,
   * bumpy), small shelves between them — no added obstacle, all terrain. Asks for throttle
   * and balance control rather than speed.
   */
  private techHill(): Segment[] {
    const r = this.rng;
    const g = this.grade;
    const wet = this.diff ? 0.9 : 1;
    const pieces: [number, number][] = [];
    const n = r.int(3, 5) + Math.round(g * 2);
    let h = 0;
    for (let j = 0; j < n; j++) {
      const up = h < 1 || (h < 6 + g * 4 && r.chance(0.6));
      const s = (up ? r.range(0.42, 0.56) + g * 0.12 : -(r.range(0.4, 0.55) + g * 0.12)) * wet * 1.1;
      const dh = r.range(1.2, 2.6 + g * 1.6) * 1.2;
      pieces.push([dh / Math.abs(s), s], [r.range(2.5, 5), up ? 0.03 : -0.03]);
      h += up ? dh : -dh;
    }
    // back down to about where it started
    if (h > 0.5) pieces.push([h / (0.3 * wet), -0.3 * wet]);
    const seed = r.int(0, 1e5);
    const seg = this.slopeProfile(pieces, 0.25 + g * 0.2, seed, 2.2);
    seg.surface = (t) => (noise1(t / 6, seed + 5) > 0.1 ? Surface.Rock : Surface.Dirt);
    seg.noPickup = [[0, seg.len]];
    seg.props = 0.8;
    seg.onStart = (x0) => this.decor(x0 - 3, 'enduro', 'eb.steep.0', 0.1);
    return [this.flat(6), seg, this.flat(6)];
  }

  /**
   * Cruising: a journey, not a trap. Big hills with changing inclines and long varied
   * descents (no bumps, gentle crests); goes down when the road is already high.
   */
  private cruiseHill(d: number): Segment[] {
    const r = this.rng;
    const H = r.range(6, 14) + d * 8;
    const high = this.segH0 > 25;
    const low = this.segH0 < -25;
    const variant = high ? 'descent' : low ? 'climb' : r.weighted(['hill', 'climb', 'descent', 'hill2'], [3, 2, 2, 1.5]);
    const vary = (sign: number, total: number): [number, number][] => {
      // a climb (or descent) in 2-4 pitches of different steepness
      const out: [number, number][] = [];
      const k = r.int(2, 4);
      for (let j = 0; j < k; j++) {
        const s = r.range(0.07, 0.24) * (j === 0 ? 0.7 : 1);
        out.push([total / k / s, sign * s]);
        if (r.chance(0.35)) out.push([r.range(8, 20), sign * 0.02]);
      }
      return out;
    };
    let pieces: [number, number][];
    if (variant === 'climb') pieces = [...vary(1, H), [r.range(15, 30), 0]];
    else if (variant === 'descent') pieces = [...vary(-1, H * 1.3)];
    else if (variant === 'hill2') pieces = [...vary(1, H), [r.range(10, 20), 0], ...vary(-1, H * 0.5), [10, 0], ...vary(1, H * 0.5), [12, 0], ...vary(-1, H)];
    else pieces = [...vary(1, H), [r.range(10, 25), 0], ...vary(-1, H)];
    const seg = this.slopeProfile(pieces, 0.04, r.int(0, 1e5), 8);
    seg.props = 1.1;
    seg.coins = r.chance(0.4) ? 'line' : undefined;
    return [seg];
  }

  // ---------------------------------------------------------------- content

  private maybePickup(x: number, h: number, seg: Segment, t: number): void {
    return; // fuel / water pickups removed (v2.10)
    const blocked = seg.noPickup?.some(([a, b]) => t >= a && t <= b) ?? false;
    if (blocked) return;
    const d = this.difficulty(x);
    if (x >= this.nextFuel) {
      this.world.pickups.push({ x, y: h + 1.0, kind: 'fuel', taken: false, takenAt: 0 });
      this.nextFuel = x + this.rng.range(230, 420) + d * 160;
      if (Math.abs(this.nextFuel - this.nextWater) < 40) this.nextWater += 60;
    } else if (x >= this.nextWater) {
      this.world.pickups.push({ x, y: h + 1.0, kind: 'water', taken: false, takenAt: 0 });
      this.nextWater = x + this.rng.range(200, 380) + d * 160;
      if (Math.abs(this.nextFuel - this.nextWater) < 40) this.nextFuel += 60;
    }
  }

  /** Scatter decor for [x0, x1): trees and rocks behind the track, grass and stones in front. */
  private spawnProps(x0: number, x1: number, density: number): void {
    const start = Math.max(x0, this.propsCursor);
    if (x1 <= start) return;
    this.propsCursor = x1;
    const def = BIOMES[this.biome];
    const r = this.rng;
    const kinds = def.props.map((p) => p.kind);
    const weights = def.props.map((p) => p.weight);
    // Background band (behind the track).
    for (let x = start; x < x1; x += r.range(1.2, 3.5) / Math.max(0.2, density)) {
      let kind = r.weighted(kinds, weights);
      if ((kind === 'pine' || kind === 'pineDead') && !r.chance(def.treeDensity)) kind = 'bush';
      if (kind === 'log' && r.chance(0.5)) kind = 'stump';
      const big = kind === 'pine' || kind === 'pineDead' || kind === 'boulder' || kind === 'cactus' || kind === 'deadTree' || kind === 'sandstone' || kind === 'palm';
      this.world.props.push({
        x: x + r.range(-0.5, 0.5),
        kind,
        depth: big ? r.range(0.15, 1) : r.range(0.05, 0.5),
        scale: r.range(0.75, 1.3),
        variant: r.int(0, 3),
        flip: r.chance(0.5),
      });
    }
    // Foreground band (in front of the track, drawn over the bike's lane).
    for (let x = start; x < x1; x += r.range(2.5, 6) * (this.mode === 'trial' ? 2.5 : 1.7)) {
      const kind: PropKind =
        this.biome === Biome.Canyon
          ? r.chance(0.7)
            ? 'rock'
            : 'grass'
          : this.biome === Biome.Desert
            ? r.weighted(['shrub', 'rock', 'grass', 'tumbleweed'], [4, 3, 2, 0.6])
            : r.weighted(['grass', 'rock', 'flower'], [5, 2, 3]);
      this.world.props.push({
        x,
        kind,
        depth: -r.range(0.2, 1),
        scale: r.range(0.8, 1.4),
        variant: r.int(0, 3),
        flip: r.chance(0.5),
      });
    }
    this.spawnCatalog(start, x1, density);
    this.world.props.sort((a, b) => a.x - b.x);
  }

  /** Catalog groups that dress the current environment. */
  private groups(): AssetGroup[] {
    if (this.biome === Biome.Canyon) return ['canyon'];
    if (this.biome === Biome.Desert) return ['desert'];
    if (this.region.id === 'sf') return ['sf'];
    if (this.region.id === 'alpes') return ['green', 'alpes'];
    if (this.region.id === 'foret') return ['green', 'foret'];
    if (this.region.id === 'cross') return ['green', 'alpes'];
    return ['green'];
  }

  /**
   * Catalog decor. Every ~120 m a "palette" (a handful of species, rocks, buildings and
   * animals) is drawn from the region's catalog, so each stretch has its own character
   * and the scene never repeats exactly; mode decor (race paddock, enduro marking) is added.
   */
  private spawnCatalog(x0: number, x1: number, density: number): void {
    const r = this.rng;
    if (x0 >= this.paletteEnd) {
      const g = this.groups();
      const pick = (slot: Slot, n: number) => {
        const list = assetsFor(g, slot);
        const res: AssetDef[] = [];
        for (let k = 0; k < n && list.length; k++) res.push(r.weighted(list, list.map((a) => a.weight ?? 1)));
        return res;
      };
      const city = this.region.id === 'sf';
      this.palette = { tree: pick('tree', 6), bush: pick('bush', 5), ground: pick('ground', 6), structure: pick('structure', city ? 14 : 2), animal: pick('animal', city ? 5 : 2) };
      if (this.mode === 'enduro') this.palette.trackside = assetsFor(['enduro'], 'trackside');
      if (this.mode === 'course' || this.region.id === 'cross') this.palette.trackside = assetsFor(['course'], 'trackside');
      // San Francisco: cheering supporters along the street in every mode
      if (this.region.id === 'sf') this.palette.trackside = [...(this.palette.trackside ?? []), ...pick('trackside', 10)];
      this.paletteEnd = x0 + r.range(100, 150);
    }
    const P = this.palette;
    const put = (slot: Slot, x: number, depth: number, scale = r.range(0.85, 1.15)) => {
      const list = P[slot];
      if (!list || !list.length) return;
      const a = r.weighted(list, list.map((d) => d.weight ?? 1));
      // signs, banners and buildings carry text or a lit side: never mirrored
      const mirror = slot === 'tree' || slot === 'bush' || slot === 'ground' || slot === 'animal';
      this.world.props.push({ x, kind: 'asset', asset: a.id, depth, scale, variant: 0, flip: mirror && r.chance(0.5) });
    };
    const k = Math.max(0.2, density);
    for (let x = x0; x < x1; x += r.range(3, 7) / k) put(r.chance(0.55) ? 'tree' : 'bush', x, r.range(0.2, 1));
    // trial: keep the edges of the track clear so the obstacles read at a glance;
    // San Francisco: small street items a bit further back
    const gMin = this.mode === 'trial' ? 0.35 : this.region.id === 'sf' ? 0.18 : 0.04;
    for (let x = x0; x < x1; x += r.range(2, 5) / k) put('ground', x, r.range(gMin, Math.max(gMin + 0.2, 0.6)));
    if (this.region.id === 'sf') {
      // a street: cars, lamps and benches close by, houses and shops behind, towers far away
      for (let x = x0 + r.range(0, 6); x < x1; x += r.range(5, 12)) {
        const list = P.structure ?? [];
        if (!list.length) break;
        const a = r.weighted(list, list.map((d) => d.weight ?? 1));
        const id = a.id;
        // outside trial the street sits a bit further back so it scrolls by more calmly
        const far = this.mode === 'trial' ? 0 : 1;
        const depth = /tower|\.wh\./.test(id) ? r.range(0.88, 1) : /vic|shop|hill|mural|board/.test(id) ? r.range(0.4 + far * 0.25, 0.8 + far * 0.15) : r.range(0.08 + far * 0.24, 0.3 + far * 0.25);
        this.world.props.push({ x, kind: 'asset', asset: id, depth, scale: 1, variant: 0, flip: false });
      }
    } else for (let x = x0 + r.range(0, 40); x < x1; x += r.range(45, 90)) put('structure', x, r.range(0.65, 1), 1);
    for (let x = x0 + r.range(0, 50); x < x1; x += r.range(60, 120)) put('animal', x, r.range(0.3, 0.9), 1);
    for (let x = x0; x < x1; x += r.range(5, 11) * (this.mode === 'trial' ? 2.5 : this.region.id === 'sf' ? 2.2 : 1.6)) put('ground', x, -r.range(this.mode === 'trial' ? 0.5 : 0.2, 0.9), r.range(0.9, 1.3));
    // mode decor along the track
    if (this.mode === 'course' || this.mode === 'enduro' || this.region.id === 'sf' || this.region.id === 'cross') {
      const dense = (x: number) => this.mode === 'course' && (x < 120 || Math.abs(x - (this.raceLen + 5)) < 80);
      for (let x = x0; x < x1; x += dense(x) ? r.range(2.5, 5) : r.range(12, 24)) put('trackside', x, r.range(0.04, 0.4), 1);
      if (this.mode === 'course' && x0 <= this.raceLen + 5 && x1 > this.raceLen + 5) this.decor(this.raceLen + 6, 'course', 'c.finish.' + r.int(0, 3), 0.02);
      if (this.mode === 'course' && x0 < 10) this.decor(4, 'course', 'c.startgate.0', 0.02);
      const fx = this.world.finishX;
      if (this.mode === 'enduro' && x0 <= fx && x1 > fx) this.decor(fx + 1, 'enduro', 'eb.finish.' + r.int(0, 2), 0.02);
    }
  }
}
