import type { RegionId } from './world/regions';

/**
 * Player settings, persisted in localStorage.
 *  - layout 'gauche'  : balance bottom-left, brake just left of the throttle (default)
 *  - layout 'centre'  : brake bottom-left, balance in the centre (classic)
 *  - layout 'inverse' : mirrored for left-handed players (throttle on the left)
 */
export type Layout = 'gauche' | 'centre' | 'inverse';
export type Quality = 'haute' | 'moyenne' | 'basse';

export interface Settings {
  music: number; // 0..1
  sfx: number; // 0..1 (engine + effects)
  layout: Layout;
  region: RegionId;
  vibration: boolean;
  quality: Quality;
  /** Player name shown in races and on the home screen. */
  pseudo: string;
}

const KEY = 'mx.settings.v2';
const DEFAULTS: Settings = { music: 0.6, sfx: 0.85, layout: 'gauche', region: 'alpes', vibration: true, quality: 'haute', pseudo: '' };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
