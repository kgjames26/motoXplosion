import type { Difficulty, ModeId } from './modes';
import { OBSTACLE_SCALE } from './weather';
import { expectedBike, rockClimb } from './bikes';
import type { RegionId } from './world/regions';

/**
 * Circuits: 25 hand-numbered tracks per world for Trial, Enduro and Course. Each circuit is a
 * deterministic generation (fixed seed) with a finish line; its grade (0 → 1) grows with its
 * number and drives obstacle size, hill height, opponents and par times.
 */
export const CIRCUITS = 30;
export type CircuitMode = 'trial' | 'enduro' | 'course' | 'fuite';

export function isCircuitMode(m: ModeId): m is CircuitMode {
  return m === 'trial' || m === 'enduro' || m === 'course' || m === 'fuite';
}

/** Steepness of the difficulty curve: > 1 means gentle first circuits, hard last ones. */
export const GRADE_CURVE = 1.6;

/** 0 (circuit 1) → 1 (circuit 30), accelerating: circuit 10 ≈ 0.15, 20 ≈ 0.50, 30 = 1. */
export function circuitGrade(n: number): number {
  const lin = Math.min(1, Math.max(0, (n - 1) / (CIRCUITS - 1)));
  return Math.pow(lin, GRADE_CURVE);
}

const MODE_SALT: Record<CircuitMode, number> = { trial: 0x7a11, enduro: 0x3d0e, course: 0x9c3b, fuite: 0x5f0e };
const REGION_SALT: Record<RegionId, number> = { alpes: 11, foret: 23, canyon: 37, desert: 51, sf: 67, cross: 83 };

/** Same circuit = same track every time. */
export function circuitSeed(mode: CircuitMode, region: RegionId, n: number): number {
  let h = (MODE_SALT[mode] * 2654435761) ^ (REGION_SALT[region] * 40503) ^ (n * 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Track length (m) from the start line to the finish (enduro, course). */
export function circuitLength(mode: CircuitMode, n: number): number {
  const g = circuitGrade(n);
  if (mode === 'enduro') return Math.round(1300 + g * 1500);
  if (mode === 'course') return Math.round(1300 + g * 900);
  if (mode === 'fuite') return Math.round(1500 + g * 1500);
  return 0;
}

/**
 * Fuite (v2.70, v2.74): a rockslide chasing the rider. Same plan every time for a level: the front
 * of the slide starts gap0 m behind, rolls at v (m/s), with a few announced surges (progress range
 * 0..1 and speed factor). v2.75: its speed never depends on the rider; at each waypoint a rider who
 * left it far behind gets a new slide FUITE_VIEW m behind him.
 * rocks = the stones of the slide: metres behind the front, radius, bounce phase.
 */
export interface RockPlan {
  gap0: number;
  v: number;
  surges: [number, number, number][];
  rocks: { off: number; r: number; ph: number }[];
}
/** The slide is held at most this far behind the rider (m): always in view. */
export const FUITE_VIEW = 16; // v2.80: the rider is centred again, ~20 m of view behind
/** v2.75: every FUITE_WAYPOINT m a waypoint; a rider far ahead of the slide gets a new one just behind. */
export const FUITE_WAYPOINT = 250;
export function fuitePlan(n: number): RockPlan {
  const g = circuitGrade(n);
  const lin = Math.min(1, Math.max(0, (n - 1) / (CIRCUITS - 1)));
  const surges: [number, number, number][] = [];
  if (n >= 6 && n < 24) surges.push([0.45, 0.53, 1.06]);
  if (n >= 14) surges.push([0.75, 0.82, 1.1]);
  if (n >= 24) surges.push([0.25, 0.31, 1.06]);
  surges.sort((a, b) => a[0] - b[0]);
  // the stones: one big boulder in front, more and bigger ones on the high levels, a trail of small ones
  const rocks: { off: number; r: number; ph: number }[] = [{ off: 0, r: 2.2 + lin * 1.2, ph: 0 }];
  const big = 1 + Math.round(lin * 2);
  for (let i = 0; i < big; i++) rocks.push({ off: 3 + i * 6.5, r: 1.6 + ((i * 7) % 5) * 0.2 + lin * 0.6, ph: i * 1.3 + 0.5 });
  const small = 7 + Math.round(lin * 6);
  for (let i = 0; i < small; i++) rocks.push({ off: 1 + ((i * 37) % 23), r: 0.45 + ((i * 13) % 7) * 0.12, ph: i * 2.1 });
  return { gap0: FUITE_VIEW + 4, v: FUITE_V0 + (lin + g) * 0.5 * FUITE_V1, surges, rocks };
}
/** Slide speed (m/s): level 1, and how much more at level 30 (see the simulation). */
export const FUITE_V0 = 15;
export const FUITE_V1 = 5.5;
/** Gold medal: average speed (m/s) to finish with, set from the simulated rides of the expected bikes. */
export const FUITE_GOLD = 21;

/** Trial: number of zones in the circuit (4 → 10). */
export function trialZones(n: number): number {
  return 4 + Math.floor(circuitGrade(n) * 6.99);
}

/** Course: opponents' championship level for a circuit (1 → 10). */
export function circuitRaceLevel(n: number): number {
  return 1 + Math.round(circuitGrade(n) * 9);
}

/**
 * Trial: range of rock heights (m) on a circuit: 0.6 m max on circuit 1, 2.5 m on circuit 25.
 * Wetter weathers (moyen, difficile) keep them a bit smaller since the grip drops.
 */
export function trialRockRange(n: number, diff = 0): [number, number] {
  // never higher than what the bike expected at this circuit climbs in this weather
  // v2.18: bigger from the start, close to what the bike can do
  // v2.65: high circuits may go past the expected bike (needs a better bike or upgrades there)
  const cap = rockClimb(expectedBike(n, true).id, diff) - 0.1 + Math.pow(circuitGrade(n), 2) * 0.2;
  const hi = Math.min(2.5, cap, (0.95 + circuitGrade(n) * 1.9) * OBSTACLE_SCALE[diff]);
  return [Math.max(0.6, hi - 0.45), Math.max(0.6, hi)];
}

export type Medal = 0 | 1 | 2 | 3; // none, bronze, silver, gold
export const MEDAL_NAMES = ['', 'Bronze', 'Argent', 'Or'];
export const MEDAL_COLORS = ['', '#d98a4a', '#d6dbe4', '#f6c23a'];

/**
 * Time limits for silver and gold (s), from the circuit size: gold needs a clean, quick ride,
 * silver a steady one, bronze is any finish.
 */
export function parTimes(mode: CircuitMode, n: number, diff = 0): { gold: number; silver: number } {
  const g = circuitGrade(n);
  let gold: number;
  // trial: a fast, clean ride (a careful rider gets silver)
  if (mode === 'trial') gold = (trialZones(n) * (10 + g * 14) + 6) * 0.92;
  // enduro: set for the bike the player can afford by then (see expectedBike)
  else if (mode === 'fuite') gold = circuitLength(mode, n) / FUITE_GOLD;
  else gold = circuitLength(mode, n) / (mode === 'enduro' ? 22.5 + g * 2.5 : 22);
  gold = Math.round(gold * [1, 1.08, 1.16][diff]);
  return { gold, silver: Math.round(gold * (mode === 'trial' ? 1.22 : 1.3)) };
}

export function medalForTime(mode: CircuitMode, n: number, t: number, diff = 0): Medal {
  const p = parTimes(mode, n, diff);
  return t <= p.gold ? 3 : t <= p.silver ? 2 : 1;
}

export function medalForPlace(place: number): Medal {
  return place === 1 ? 3 : place === 2 ? 2 : place === 3 ? 1 : 0;
}

/** One-time bonus for reaching a medal on a circuit for the first time (paid as upgrades). */
export const MEDAL_BONUS = [0, 20, 45, 90];

export interface CircuitRecord {
  /** Best time (trial, enduro) in seconds. */
  time?: number;
  /** Course: best place. */
  place?: number;
  medal: Medal;
  done: boolean;
}

export function circuitKey(mode: CircuitMode, region: RegionId, n: number, d: Difficulty): string {
  return `${mode}:${region}:${n}:${d}`;
}

/** Cruising: distance (m) to ride in a difficulty to unlock the next one. */
export const CRUISE_UNLOCK = 1000; // v2.65: was 2000 (too long before the next difficulty)

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
}
