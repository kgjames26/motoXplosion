import type { BikeModel, BikeSpec } from './bikes';

/**
 * Technical upgrades sold in the garage, per bike, 3 levels each. Every part says exactly what
 * it changes. A fully upgraded bike beats the next stock bike on most stats; the next bike
 * needs a few upgrades to pull ahead again.
 */
export interface Part {
  id: string;
  name: string;
  /** What one level brings, shown in the shop. */
  effect: string;
  /** Short badge (e.g. "+5 % PUISSANCE") and the card colour. */
  chip: string;
  color: string;
  icon: string;
  apply: (s: BikeSpec, level: number) => BikeSpec;
}

const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

export const PARTS: Part[] = [
  {
    id: 'accel',
    chip: '+6 % ACCÉLÉRATION',
    color: '#ff6a3a',
    name: 'Boîte de vitesse',
    effect: '+6 % de puissance et +6 % de couple par niveau',
    icon: svg('M4 9h3l2-2h6v3h2l2-2h1v8h-1l-2-2h-2v3H9l-2-2H4zM9 4h6'),
    apply: (s, l) => ({ ...s, power: s.power * (1 + 0.06 * l), torque: s.torque * (1 + 0.06 * l) }),
  },
  {
    id: 'vmax',
    chip: '+4 % VITESSE DE POINTE',
    color: '#ffb020',
    name: 'Cartographie moteur',
    effect: '+4 % de vitesse max et +2 % de puissance par niveau',
    icon: svg('M3 14h10l4-3h4v6h-4l-4-3M6 14v3M17 9l2-3'),
    apply: (s, l) => ({ ...s, maxSpeed: s.maxSpeed * (1 + 0.04 * l), power: s.power * (1 + 0.02 * l) }),
  },
  {
    id: 'grip',
    chip: '+4 % ADHÉRENCE',
    color: '#e84a8a',
    name: 'Amélioration châssis',
    effect: '+4 % d’adhérence des pneus par niveau',
    icon: svg('M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8M4 12h3M17 12h3'),
    apply: (s, l) => ({ ...s, grip: s.grip * (1 + 0.04 * l) }),
  },
  {
    id: 'control',
    chip: '+8 % CONTRÔLE',
    color: '#14d1c0',
    name: 'Contrôle du pilote',
    effect: '+8 % de freinage et +6 % d’agilité en l’air par niveau',
    icon: svg('M12 3l7 4v10l-7 4-7-4V7zM12 3v18M5 7l14 10M19 7L5 17'),
    apply: (s, l) => ({ ...s, brakes: s.brakes * (1 + 0.08 * l), air: s.air * (1 + 0.06 * l) }),
  },
  {
    id: 'susp',
    chip: '+7 % SUSPENSIONS',
    color: '#3fa8ff',
    name: 'Suspensions',
    effect: 'Absorbent mieux les chocs : +7 % de fermeté et +5 % de débattement par niveau',
    icon: svg('M12 2v4M12 18v4M8 6h8M8 18h8M9 8l6 2-6 2 6 2-6 2'),
    apply: (s, l) => ({ ...s, suspK: s.suspK * (1 + 0.07 * l), travel: s.travel * (1 + 0.05 * l) }),
  },
];

/** Old (v2.15–v2.34) part ids → the five parts of today: levels already bought are kept. */
export function migrateUpgrades(up: Record<string, Record<string, number>>): void {
  const map: Record<string, string> = { moteur: 'accel', transmission: 'accel', echappement: 'vmax', freins: 'control', allegement: 'control', suspensions: 'susp' };
  for (const bike of Object.keys(up)) {
    const lv = up[bike];
    let old = false;
    for (const k of Object.keys(map)) {
      if (lv[k] === undefined) continue;
      old = true;
      lv[map[k]] = Math.min(3, Math.max(lv[map[k]] ?? 0, lv[k]));
      delete lv[k];
    }
    if (lv.reservoir !== undefined) {
      old = true;
      delete lv.reservoir;
    }
    void old;
  }
}

export const MAX_LEVEL = 3;
export type Levels = Record<string, number>;

/** Price of the next level of a part on a bike (dearer on dearer bikes). */
export function partPrice(m: BikeModel, level: number): number {
  const base = Math.max(200, m.price * 0.07);
  return Math.round((base * [1, 1.8, 3][level - 1]) / 10) * 10;
}

/** Specs of a bike with its upgrades. */
export function upgradedSpec(m: BikeModel, levels: Levels = {}): BikeSpec {
  let s = { ...m.spec };
  for (const p of PARTS) if (levels[p.id]) s = p.apply(s, levels[p.id]);
  return s;
}

/** Numbers shown in the shop (real units). */
export function specNumbers(s: BikeSpec): { label: string; value: number; unit: string; higherIsBetter: boolean; digits?: number }[] {
  return [
    { label: 'Puissance', value: s.power / 735.5, unit: 'ch', higherIsBetter: true },
    { label: 'Couple', value: s.torque / 4.3, unit: 'Nm', higherIsBetter: true },
    { label: 'Vitesse max', value: s.maxSpeed * 3.6, unit: 'km/h', higherIsBetter: true },
    { label: 'Poids', value: s.mass, unit: 'kg', higherIsBetter: false },
    { label: 'Suspensions', value: s.suspK * s.travel * 100, unit: '%', higherIsBetter: true },
    { label: 'Adhérence', value: s.grip * 100, unit: '%', higherIsBetter: true },
    { label: 'Freins', value: s.brakes * 100, unit: '%', higherIsBetter: true },
    { label: 'Agilité air', value: s.air * 100, unit: '%', higherIsBetter: true },
    { label: 'Autonomie', value: 100 / s.consumption, unit: '%', higherIsBetter: true },
  ];
}

/** 0..1 scale for the bars, over the whole garage range (stock Explorer → upgraded Dakar). */
export const BAR_RANGE: Record<string, [number, number]> = {
  Puissance: [25, 95],
  Couple: [100, 230],
  'Vitesse max': [70, 150],
  Poids: [210, 120],
  Suspensions: [80, 230],
  Adhérence: [95, 130],
  Freins: [95, 170],
  'Agilité air': [85, 160],
  Autonomie: [80, 280],
  Rochers: [1, 2.7],
};

/** v2.15 cruise control: cruising only, holds the speed the player set. Dear on purpose. */
export const CRUISE_CONTROL = {
  id: 'cruise',
  name: 'Régulateur de vitesse',
  price: 7500,
  desc: 'Cruising seulement : roule à ta vitesse, touche le bouton, la moto la garde toute seule. Un coup de frein l’arrête.',
};
