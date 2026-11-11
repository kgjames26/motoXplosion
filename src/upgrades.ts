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
    id: 'moteur',
    chip: '+5 % PUISSANCE',
    color: '#ff6a3a',
    name: 'Préparation moteur',
    effect: '+5 % de puissance et +4 % de couple par niveau',
    icon: svg('M4 9h3l2-2h6v3h2l2-2h1v8h-1l-2-2h-2v3H9l-2-2H4zM9 4h6'),
    apply: (s, l) => ({ ...s, power: s.power * (1 + 0.05 * l), torque: s.torque * (1 + 0.04 * l) }),
  },
  {
    id: 'echappement',
    chip: '+3 % PUISSANCE · +2,5 % VITESSE',
    color: '#ffb020',
    name: 'Échappement sport',
    effect: '+3 % de puissance et +2,5 % de vitesse max par niveau',
    icon: svg('M3 14h10l4-3h4v6h-4l-4-3M6 14v3M17 9l2-3'),
    apply: (s, l) => ({ ...s, power: s.power * (1 + 0.03 * l), maxSpeed: s.maxSpeed * (1 + 0.025 * l) }),
  },
  {
    id: 'transmission',
    chip: '+6 % COUPLE',
    color: '#e84a8a',
    name: 'Transmission courte',
    effect: '+6 % de couple par niveau (reprises, montées, rochers)',
    icon: svg('M8 12a4 4 0 1 0 0 .01M18 12a2.5 2.5 0 1 0 0 .01M8 8l10 1.5M8 16l10-1.5'),
    apply: (s, l) => ({ ...s, torque: s.torque * (1 + 0.06 * l) }),
  },
  {
    id: 'suspensions',
    chip: '+7 % SUSPENSIONS',
    color: '#3fa8ff',
    name: 'Suspensions réglables',
    effect: '+7 % de fermeté et +5 % de débattement par niveau',
    icon: svg('M12 2v4M12 18v4M8 6h8M8 18h8M9 8l6 2-6 2 6 2-6 2'),
    apply: (s, l) => ({ ...s, suspK: s.suspK * (1 + 0.07 * l), travel: s.travel * (1 + 0.05 * l) }),
  },
  {
    id: 'freins',
    chip: '+10 % FREINAGE',
    color: '#d8261f',
    name: 'Freins gros disque',
    effect: '+10 % de freinage par niveau',
    icon: svg('M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6M18 6l3-2'),
    apply: (s, l) => ({ ...s, brakes: s.brakes * (1 + 0.1 * l) }),
  },
  {
    id: 'allegement',
    chip: '−4 % POIDS · +4 % AGILITÉ',
    color: '#14d1c0',
    name: 'Allègement carbone',
    effect: '−4 % de poids et +4 % d’agilité en l’air par niveau',
    icon: svg('M12 3l7 4v10l-7 4-7-4V7zM12 3v18M5 7l14 10M19 7L5 17'),
    apply: (s, l) => ({ ...s, mass: s.mass * (1 - 0.04 * l), air: s.air * (1 + 0.04 * l) }),
  },
  {
    id: 'reservoir',
    chip: '−8 % CONSOMMATION',
    color: '#7ad84a',
    name: 'Grand réservoir / batterie',
    effect: '−8 % de consommation par niveau (roule plus longtemps)',
    icon: svg('M6 5h9l3 3v11H6zM9 9h5M18 8h2v6'),
    apply: (s, l) => ({ ...s, consumption: s.consumption * (1 - 0.08 * l) }),
  },
];

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
