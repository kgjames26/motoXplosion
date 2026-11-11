import type { Difficulty, ModeId } from './modes';
import { OBSTACLE_SCALE } from './weather';
import { expectedBike, rockClimb } from './bikes';
import type { RegionId } from './world/regions';

/**
 * Circuits: 25 hand-numbered tracks per world for Trial, Enduro and Course. Each circuit is a
 * deterministic generation (fixed seed) with a finish line; its grade (0 → 1) grows with its
 * number and drives obstacle size, hill height, opponents and par times.
 */
export const CIRCUITS = 25;
export type CircuitMode = 'trial' | 'enduro' | 'course';

export function isCircuitMode(m: ModeId): m is CircuitMode {
  return m === 'trial' || m === 'enduro' || m === 'course';
}

/** 0 (circuit 1) → 1 (circuit 25). */
export function circuitGrade(n: number): number {
  return Math.min(1, Math.max(0, (n - 1) / (CIRCUITS - 1)));
}

const MODE_SALT: Record<CircuitMode, number> = { trial: 0x7a11, enduro: 0x3d0e, course: 0x9c3b };
const REGION_SALT: Record<RegionId, number> = { alpes: 11, foret: 23, canyon: 37, desert: 51 };

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
  return 0;
}

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
  const cap = rockClimb(expectedBike(n, true).id, diff) - 0.2;
  const hi = Math.min(2.5, cap, (0.6 + circuitGrade(n) * 1.9) * OBSTACLE_SCALE[diff]);
  return [Math.max(0.5, hi - 0.7), Math.max(0.5, hi)];
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
  if (mode === 'trial') gold = trialZones(n) * (19 + g * 8) + 10;
  // enduro: set for the bike the player can afford by then (see expectedBike)
  else gold = circuitLength(mode, n) / (mode === 'enduro' ? 21.5 + g * 2.5 : 22);
  gold = Math.round(gold * [1, 1.08, 1.16][diff]);
  return { gold, silver: Math.round(gold * 1.3) };
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
export const CRUISE_UNLOCK = 2000;

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
}
