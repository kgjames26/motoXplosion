import { circuitKey, CircuitMode } from './circuits';
import type { RegionId } from './world/regions';
import STICKERS from './stickers.json';

/**
 * Album (v2.70, autocollants v2.82, 96 autocollants v2.83): « L'épopée du motocross », 7 volumes of
 * posters, 96 stickers picked out of the 140 (tools/build_stickers.py cuts them from
 * art/source/stickers-volN.jpg following src/stickers.json → public/res/stickers/NN.webp + tNN.webp).
 * One sticker every 5 levels: levels 5, 10, 15, 20, 25, 30 of each mode line
 * (5 worlds × trial / enduro / course = 90) + 6 for Fuite = 96 = 4 double pages of 24.
 * A sticker is won once its level is finished (bronze medal at least): ownership is derived from the
 * saved circuits, nothing new is stored in the profile.
 */
export interface CardReq {
  mode: CircuitMode;
  region: RegionId;
  n: number;
}

export interface Card {
  id: number;
  name: string;
  /** poster volume it comes from (1-7) */
  vol: number;
  bio: string;
  tier: 1 | 2 | 3;
  /** full picture (poster resolution) */
  img: string;
  /** 220 px square thumbnail */
  thumb: string;
  req: CardReq;
}

export const STEP = 5; // a sticker every 5 levels
export const SPREAD = 24; // stickers per double page
export const HALF = 12; // per page
export const VOLUMES: Record<number, string> = {
  1: 'Les fondations',
  2: 'Technique & environnement',
  3: 'Compétition & logistique',
  4: 'Sécurité, outils & médias',
  5: 'Mécanique, figures & circuit',
  6: 'Préparation, course & passion',
  7: 'Pièces, piste & coulisses',
};
const WORLDS: RegionId[] = ['alpes', 'foret', 'canyon', 'desert', 'sf'];
const MODES: CircuitMode[] = ['trial', 'enduro', 'course'];

function make(): Card[] {
  const reqs: CardReq[] = [];
  for (const region of WORLDS) for (const mode of MODES) for (let n = STEP; n <= 30; n += STEP) reqs.push({ mode, region, n });
  for (let n = STEP; n <= 30; n += STEP) reqs.push({ mode: 'fuite', region: 'alpes', n });
  const list = STICKERS as { vol: number; name: string; bio: string }[];
  return reqs.map((req, i) => {
    const s = list[i];
    const nn = String(i).padStart(2, '0');
    return {
      id: i,
      name: s.name,
      vol: s.vol,
      bio: s.bio,
      tier: (req.n <= 10 ? 1 : req.n <= 20 ? 2 : 3) as 1 | 2 | 3,
      img: `/res/stickers/${nn}.webp`,
      thumb: `/res/stickers/t${nn}.webp`,
      req,
    };
  });
}

export const CARDS: Card[] = make();
export const SPREADS = Math.ceil(CARDS.length / SPREAD);

export function cardOwned(c: Card, circuits: Record<string, { done: boolean }>): boolean {
  const r = c.req;
  return (['facile', 'normal', 'difficile'] as const).some((d) => circuits[circuitKey(r.mode, r.region, r.n, d)]?.done);
}

/** The sticker that ends the line of `n` (levels 1-5 → the one at 5, …) in this mode/world. */
export function cardFor(mode: CircuitMode, region: RegionId, n: number): Card | undefined {
  const at = Math.ceil(n / STEP) * STEP;
  const reg = mode === 'fuite' ? 'alpes' : region;
  return CARDS.find((c) => c.req.mode === mode && c.req.region === reg && c.req.n === at);
}

/** Ids of the stickers owned, to spot the ones a run has just won. */
export function ownedIds(circuits: Record<string, { done: boolean }>): Set<number> {
  return new Set(CARDS.filter((c) => cardOwned(c, circuits)).map((c) => c.id));
}
