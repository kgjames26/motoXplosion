import { BIKES } from './bikes';
import type { CircuitRecord } from './circuits';
import type { Difficulty, ModeId } from './modes';
import type { RegionId } from './world/regions';

/**
 * Player progression saved in the browser: coins, owned bikes, selected bike, records per mode
 * and region, race championship level and race difficulty.
 */
export interface Profile {
  coins: number;
  owned: string[];
  bike: string;
  mode: ModeId;
  difficulty: Difficulty;
  /** Race championship level (1..10+), raised by podium finishes. */
  raceLevel: number;
  /** Progress inside the level: podiums collected (3 = level up). */
  racePoints: number;
  best: Record<string, number>;
  totalEarned: number;
  /** Rider outfit worn and outfits owned. */
  outfit: string;
  outfits: string[];
  /** Circuit results by `mode:region:n`. */
  circuits: Record<string, CircuitRecord>;
  /** Last circuit picked per `mode:region`. */
  circuitSel: Record<string, number>;
  /** Cruising: highest difficulty unlocked per world (0 facile, 1 moyen, 2 difficile). */
  cruiseUnlock: Record<string, number>;
  /** Garage upgrades: bike id → part id → level (0..3). */
  upgrades: Record<string, Record<string, number>>;
  /** Tyre sets owned (sec, pluie, neige). */
  tyres: string[];
  /** v2.25 statistics: seconds spent riding, metres ridden, falls. */
  playTime: number;
  totalDist: number;
  /** v2.15 gadgets bought in the garage (cruise control). */
  gear: string[];
}

const KEY = 'mx.profile.v1';
const DEFAULT: Profile = { coins: 0, owned: ['explorer'], bike: 'explorer', mode: 'cruising', difficulty: 'normal', raceLevel: 1, racePoints: 0, best: {}, totalEarned: 0, outfit: 'moto', outfits: ['moto'], circuits: {}, circuitSel: {}, cruiseUnlock: {}, upgrades: {}, tyres: [], gear: [], playTime: 0, totalDist: 0 };

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = { ...DEFAULT, ...(JSON.parse(raw) as Partial<Profile>) };
      // carry over cruising records of older versions
      for (const r of ['alpes', 'foret', 'canyon', 'desert']) {
        const old = Number(localStorage.getItem('mx.best.' + r) ?? 0);
        const k = bestKey('cruising', r as RegionId);
        if (old > (p.best[k] ?? 0)) p.best[k] = old;
      }
      if (!BIKES.some((b) => b.id === p.bike)) p.bike = 'explorer';
      // v2.7: circuit records are kept per difficulty (older ones count as Facile)
      const circ: Profile['circuits'] = {};
      for (const [k, v] of Object.entries(p.circuits ?? {})) circ[k.split(':').length === 3 ? k + ':facile' : k] = v;
      p.circuits = circ;
      p.cruiseUnlock = { ...p.cruiseUnlock };
      p.upgrades = JSON.parse(JSON.stringify(p.upgrades ?? {}));
      p.tyres = [...(p.tyres ?? [])];
      p.outfits = [...p.outfits];
      p.owned = [...p.owned];
      p.circuitSel = { ...p.circuitSel };
      if (!p.outfits.includes(p.outfit)) p.outfit = 'moto';
      return p;
    }
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT, best: {}, owned: ['explorer'], outfits: ['moto'], circuits: {}, circuitSel: {}, cruiseUnlock: {}, upgrades: {}, tyres: [] };
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

export function bestKey(mode: ModeId, region: RegionId): string {
  return `${mode}:${region}`;
}

/** Badge colour for a championship level (bronze → silver → gold → diamond). */
export function levelTier(level: number): { name: string; color: string } {
  if (level >= 10) return { name: 'Diamant', color: '#7fe3ff' };
  if (level >= 7) return { name: 'Or', color: '#f6c23a' };
  if (level >= 4) return { name: 'Argent', color: '#d6dbe4' };
  return { name: 'Bronze', color: '#d98a4a' };
}
