import type { Difficulty } from './modes';
import { Surface } from './world/types';

/**
 * Weather follows the difficulty in every mode: Facile = sec, Moyen = nuageux (ground a bit
 * damp), Difficile = pluie (wet ground, less grip, mud). It changes grip, the light, the sky,
 * rain streaks and the sound.
 */
export type Weather = 0 | 1 | 2;
export const WEATHER_NAMES = ['Sec', 'Nuageux', 'Pluie'];

export function weatherFor(d: Difficulty): Weather {
  return d === 'facile' ? 0 : d === 'normal' ? 1 : 2;
}

export const DIFF_ORDER: Difficulty[] = ['facile', 'normal', 'difficile'];
export const diffIndex = (d: Difficulty): number => DIFF_ORDER.indexOf(d);

/** Grip multiplier by weather and surface (sand gets firmer when wet). */
const GRIP: Record<Surface, [number, number, number]> = {
  [Surface.Dirt]: [1, 0.95, 0.88],
  [Surface.Grass]: [1, 0.9, 0.8],
  [Surface.Mud]: [1, 0.95, 0.9],
  [Surface.Sand]: [1, 1.02, 1.05],
  [Surface.Rock]: [1, 0.93, 0.88],
  [Surface.Wood]: [1, 0.92, 0.82],
  [Surface.Water]: [1, 1, 1],
};

export function weatherGrip(w: Weather, s: Surface): number {
  return GRIP[s][w];
}

/** Small inline icons (sun, cloud, rain) for buttons and tiles. */
export const WEATHER_ICONS = [
  '<svg viewBox="0 0 24 24" class="wx-ico sun" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  '<svg viewBox="0 0 24 24" class="wx-ico cloud" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/></svg>',
  '<svg viewBox="0 0 24 24" class="wx-ico rain" aria-hidden="true"><path d="M7 14h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 5.5 4.3 4.3 0 0 0 7 14z"/><path d="M8 17l-1.5 3M12.5 17L11 20M17 17l-1.5 3"/></svg>',
];
