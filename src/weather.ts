import type { Difficulty } from './modes';
import { Surface } from './world/types';

/**
 * Weather follows the difficulty in every mode: Facile = sec, Moyen = pluie (wet ground,
 * mud), Difficile = neige (thin snow cover, a half-cleared line where the bikes ride, slippery
 * and muddy). It changes grip, the light, the sky, falling rain/snow and the sound. Tracks are
 * made a bit gentler in bad weather so the player never gets stuck because of it.
 */
export type Weather = 0 | 1 | 2;
export const WEATHER_NAMES = ['Sec', 'Pluie', 'Neige'];

export function weatherFor(d: Difficulty): Weather {
  return d === 'facile' ? 0 : d === 'normal' ? 1 : 2;
}

export const DIFF_ORDER: Difficulty[] = ['facile', 'normal', 'difficile'];
export const diffIndex = (d: Difficulty): number => DIFF_ORDER.indexOf(d);

/** Grip multiplier by weather and surface (sand gets firmer when wet). */
const GRIP: Record<Surface, [number, number, number]> = {
  [Surface.Dirt]: [1, 0.88, 0.8],
  [Surface.Grass]: [1, 0.8, 0.74],
  [Surface.Mud]: [1, 0.9, 0.86],
  [Surface.Sand]: [1, 1.05, 0.9],
  [Surface.Rock]: [1, 0.88, 0.8],
  [Surface.Wood]: [1, 0.82, 0.76],
  [Surface.Water]: [1, 1, 1],
};

/** Tyres sold in the garage: each set adds grip in its own weather (mounted automatically). */
export const TYRES = [
  { id: 'sec', name: 'Pneus Sec', price: 900, bonus: 1.07, desc: 'Gomme tendre à crampons serrés : +7 % d’adhérence sur le sec.' },
  { id: 'pluie', name: 'Pneus Pluie', price: 1600, bonus: 1.12, desc: 'Crampons espacés qui évacuent l’eau et la boue : +12 % d’adhérence sous la pluie.' },
  { id: 'neige', name: 'Pneus Neige', price: 2400, bonus: 1.2, desc: 'Gomme hiver à lamelles et petits clous : +20 % d’adhérence dans la neige.' },
];

/** Grip multiplier given by the tyres owned for a weather. */
export function tyreBonus(owned: string[], w: Weather): number {
  const t = TYRES[w];
  return owned.includes(t.id) ? t.bonus : 1;
}

/** Bad weather makes tracks a bit gentler (obstacles, hills) so nobody gets stuck. */
export const OBSTACLE_SCALE = [1, 0.9, 0.82];
export const HILL_SCALE = [1, 0.95, 0.88];

export function weatherGrip(w: Weather, s: Surface): number {
  return GRIP[s][w];
}

/** Small inline icons (sun, cloud, rain) for buttons and tiles. */
export const WEATHER_ICONS = [
  '<svg viewBox="0 0 24 24" class="wx-ico sun" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  '<svg viewBox="0 0 24 24" class="wx-ico rain" aria-hidden="true"><path d="M7 14h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 5.5 4.3 4.3 0 0 0 7 14z"/><path d="M8 17l-1.5 3M12.5 17L11 20M17 17l-1.5 3"/></svg>',
  '<svg viewBox="0 0 24 24" class="wx-ico snow" aria-hidden="true"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9.5 3.5L12 5.5l2.5-2M9.5 20.5L12 18.5l2.5 2"/></svg>',
];
