/**
 * The bikes of the garage: look (3D model style and colours), physical specifications and
 * price. Better specs cost more; some bikes are specialists (trial, rally) rather than strictly
 * "better".
 */

export type BikeStyle = 'scrambler' | 'mx' | 'trial' | 'enduro' | 'electric' | 'rally';

export interface BikeSpec {
  /** Peak power at the wheel (W). */
  power: number;
  /** Max rear wheel torque (N·m): low-end punch. */
  torque: number;
  /** Rev limiter (m/s). */
  maxSpeed: number;
  /** Bike + rider mass (kg), wheels excluded. */
  mass: number;
  /** Suspension: spring rate & damping multiplier, travel multiplier. */
  suspK: number;
  travel: number;
  /** Tyre grip multiplier. */
  grip: number;
  /** In-air rotation authority multiplier. */
  air: number;
  /** Fuel (or battery) consumption multiplier: lower = longer range. */
  consumption: number;
  brakes: number;
}

export interface BikeModel {
  id: string;
  name: string;
  style: BikeStyle;
  tagline: string;
  description: string;
  price: number;
  number: string;
  colors: {
    frame: number;
    primary: number; // tank / shrouds
    secondary: number; // panels, stripes
    seat: number;
    rims: number;
    forks: number; // lower fork legs
    plate: string; // number plate background
    plateText: string;
  };
  electric?: boolean;
  spec: BikeSpec;
}

export const BIKES: BikeModel[] = [
  {
    id: 'explorer',
    name: 'Explorer 98',
    style: 'scrambler',
    tagline: 'Scrambler vintage',
    description: 'La fidèle du départ : lourde et douce, parfaite pour la balade. Double amortisseur, gros réservoir.',
    price: 0,
    number: '98',
    colors: { frame: 0x6f6236, primary: 0x8c7442, secondary: 0x2f4d33, seat: 0x6b3a22, rims: 0xe6e9ef, forks: 0x8c7442, plate: '#cdbf96', plateText: '#22402a' },
    spec: { power: 30000, torque: 540, maxSpeed: 27, mass: 178, suspK: 1, travel: 1, grip: 1, air: 1, consumption: 1, brakes: 1 },
  },
  {
    id: 'sprint',
    name: 'Sprint 125',
    style: 'mx',
    tagline: 'Cross 2 temps léger',
    description: 'Légère et vive, elle tourne facilement en l’air. Le 2 temps boit un peu plus.',
    price: 1200,
    number: '12',
    colors: { frame: 0x2d4fb3, primary: 0xffd21f, secondary: 0x2d4fb3, seat: 0x1e2a55, rims: 0x22242a, forks: 0xe8b53a, plate: '#ffd21f', plateText: '#1e2a55' },
    spec: { power: 29000, torque: 500, maxSpeed: 28.5, mass: 152, suspK: 1.05, travel: 1.08, grip: 1.03, air: 1.25, consumption: 1.15, brakes: 1.05 },
  },
  {
    id: 'ridge',
    name: 'Ridge T300',
    style: 'trial',
    tagline: 'Spécialiste du trial',
    description: 'Ultra légère, énorme couple à bas régime et pneus collants : faite pour franchir les obstacles. Lente en vitesse de pointe.',
    price: 2800,
    number: '3',
    colors: { frame: 0xd8d8de, primary: 0xd8261f, secondary: 0xffffff, seat: 0x222222, rims: 0x222428, forks: 0xd8d8de, plate: '#ffffff', plateText: '#d8261f' },
    spec: { power: 24000, torque: 700, maxSpeed: 22, mass: 138, suspK: 0.85, travel: 0.95, grip: 1.25, air: 1.4, consumption: 0.75, brakes: 1.2 },
  },
  {
    id: 'trail',
    name: 'Trailblazer 250',
    style: 'enduro',
    tagline: 'Enduro polyvalente',
    description: 'Phare, sabot et suspensions confortables : à l’aise partout, sobre, idéale pour l’enduro.',
    price: 4500,
    number: '25',
    colors: { frame: 0x1d2a3f, primary: 0x1f6fd6, secondary: 0xf2f4f8, seat: 0x1d2a3f, rims: 0x1d2a3f, forks: 0xe0a332, plate: '#f2f4f8', plateText: '#1f6fd6' },
    spec: { power: 33000, torque: 580, maxSpeed: 29.5, mass: 165, suspK: 1.15, travel: 1.15, grip: 1.1, air: 1.1, consumption: 0.85, brakes: 1.1 },
  },
  {
    id: 'fury',
    name: 'Fury 450',
    style: 'mx',
    tagline: 'Cross 4 temps de course',
    description: 'Puissance de course, suspensions de compétition et grande vitesse. Le choix des courses.',
    price: 7000,
    number: '45',
    colors: { frame: 0x2a2a2e, primary: 0xff6a12, secondary: 0x16161a, seat: 0x16161a, rims: 0x16161a, forks: 0xff8a2a, plate: '#16161a', plateText: '#ff6a12' },
    spec: { power: 41000, torque: 660, maxSpeed: 32, mass: 160, suspK: 1.3, travel: 1.2, grip: 1.12, air: 1.2, consumption: 1.1, brakes: 1.2 },
  },
  {
    id: 'volt',
    name: 'Volt X',
    style: 'electric',
    tagline: 'Électrique',
    description: 'Couple instantané et silence presque total. Batterie à recharger avec les bidons « énergie ».',
    price: 10000,
    number: 'V',
    colors: { frame: 0x15181d, primary: 0x14d1c0, secondary: 0x15181d, seat: 0x15181d, rims: 0x14d1c0, forks: 0x6b7280, plate: '#15181d', plateText: '#14d1c0' },
    electric: true,
    spec: { power: 43000, torque: 780, maxSpeed: 31, mass: 168, suspK: 1.25, travel: 1.15, grip: 1.12, air: 1.15, consumption: 0.9, brakes: 1.25 },
  },
  {
    id: 'dakar',
    name: 'Dakar 690',
    style: 'rally',
    tagline: 'Rallye-raid',
    description: 'La reine des grands espaces : la plus rapide, énorme autonomie et longues suspensions. Lourde en l’air.',
    price: 15000,
    number: '1',
    colors: { frame: 0x2a2f3a, primary: 0xf4f4f6, secondary: 0xd8261f, seat: 0x1d2a5a, rims: 0xe0a332, forks: 0xe0a332, plate: '#f4f4f6', plateText: '#1d2a5a' },
    spec: { power: 52000, torque: 740, maxSpeed: 36, mass: 192, suspK: 1.4, travel: 1.3, grip: 1.08, air: 0.9, consumption: 0.6, brakes: 1.3 },
  },
];

export function bikeById(id: string): BikeModel {
  return BIKES.find((b) => b.id === id) ?? BIKES[0];
}

/** Ratings 1..10 shown in the garage. */
/**
 * Highest trial rock (m) each STOCK bike climbs (sec, pluie, neige), measured with the physics
 * (see climb.ts, which also computes it for upgraded bikes). Torque, weight and tyre grip
 * decide: the trial bike goes highest.
 */
export const ROCK_CLIMB: Record<string, [number, number, number]> = {
  explorer: [1.33, 1.25, 1.17],
  sprint: [1.5, 1.33, 1.25],
  ridge: [2.5, 2.33, 2.17],
  trail: [2.0, 1.5, 1.33],
  fury: [2.17, 1.5, 1.42],
  volt: [2.5, 2.0, 1.42],
  dakar: [2.0, 1.83, 1.42],
};
export function rockClimb(id: string, weather = 0): number {
  return (ROCK_CLIMB[id] ?? ROCK_CLIMB.explorer)[weather];
}

/**
 * The bike a player is expected to afford by a given circuit (cruising pays for it): goals,
 * par times and obstacles are set for it, not for the starting bike (except circuit 1-2).
 */
export function expectedBike(n: number, trial = false): BikeModel {
  const id = n <= 2 ? 'explorer' : n <= 6 ? 'sprint' : trial ? 'ridge' : n <= 11 ? 'trail' : n <= 16 ? 'fury' : n <= 21 ? 'volt' : 'dakar';
  return bikeById(id);
}

export function ratings(m: BikeModel): { label: string; value: number }[] {
  const s = m.spec;
  const r = (v: number, lo: number, hi: number) => Math.max(1, Math.min(10, Math.round(1 + ((v - lo) / (hi - lo)) * 9)));
  return [
    { label: 'Puissance', value: r(s.power + s.torque * 30, 24000 + 500 * 30, 52000 + 780 * 30) },
    { label: 'Vitesse', value: r(s.maxSpeed, 21, 36) },
    { label: 'Suspensions', value: r(s.suspK * s.travel, 0.8, 1.85) },
    { label: 'Agilité', value: r(s.air * 2 - s.mass / 100, 1.8 - 1.92, 2.8 - 1.38) },
    { label: 'Adhérence', value: r(s.grip, 1, 1.25) },
    { label: 'Autonomie', value: r(1 / s.consumption, 1 / 1.15, 1 / 0.6) },
    { label: 'Rochers', value: r(rockClimb(m.id), 1.3, 2.5) },
  ];
}
