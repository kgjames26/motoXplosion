import type { RegionId } from './world/regions';

/**
 * Player settings, persisted in localStorage.
 *  - layout 'gauche'  : balance bottom-left, brake just left of the throttle (default)
 *  - layout 'centre'  : brake bottom-left, balance in the centre (classic)
 *  - layout 'inverse' : mirrored for left-handed players (throttle on the left)
 */
export type Layout = 'gauche' | 'centre' | 'inverse';
export type Quality = 'haute' | 'moyenne' | 'basse';

/** Keyboard actions that can be rebound (stored as the lower-cased `KeyboardEvent.key`, so Z is Z on any layout). */
export type KeyAction = 'throttle' | 'brake' | 'up' | 'down' | 'left' | 'right';
export const KEY_ACTIONS: { id: KeyAction; label: string }[] = [
  { id: 'throttle', label: 'Accélérateur' },
  { id: 'brake', label: 'Frein' },
  { id: 'up', label: 'Joystick ↑ (pencher en avant)' },
  { id: 'down', label: 'Joystick ↓ (pencher en arrière)' },
  { id: 'left', label: 'Joystick ←' },
  { id: 'right', label: 'Joystick →' },
];
export const DEFAULT_KEYS: Record<KeyAction, string> = { throttle: 'z', brake: 's', up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright' };
/** Readable name of a stored key. */
export function keyLabel(k: string): string {
  const names: Record<string, string> = { arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', ' ': 'Espace', control: 'Ctrl', shift: 'Maj', enter: 'Entrée', tab: 'Tab', alt: 'Alt', altgraph: 'Alt Gr' };
  return names[k] ?? k.toUpperCase();
}

export interface Settings {
  keys: Record<KeyAction, string>;
  music: number; // 0..1
  sfx: number; // 0..1 (engine + effects)
  layout: Layout;
  region: RegionId;
  vibration: boolean;
  quality: Quality;
  /** Player name shown in races and on the home screen. */
  pseudo: string;
  /** v2.25 parental timer: minutes allowed (0 = off) and seconds already used. */
  timerMin: number;
  timerUsed: number;
  /** v2.51: 3D circuit handling, new (tyres that slide, wheelspin) or the old one (v2.50). */
  mxPhysics: 'nouvelle' | 'ancienne';
}

const KEY = 'mx.settings.v2';
const DEFAULTS: Settings = { keys: { ...DEFAULT_KEYS }, music: 0.6, sfx: 0.85, layout: 'gauche', region: 'alpes', vibration: true, quality: 'haute', pseudo: '', timerMin: 0, timerUsed: 0 , mxPhysics: 'nouvelle' };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<Settings>;
      return { ...DEFAULTS, ...o, keys: { ...DEFAULT_KEYS, ...(o.keys ?? {}) } };
    }
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
