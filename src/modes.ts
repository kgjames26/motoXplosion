/** Game modes. Every mode is played on the region maps (Alpes, Forêt, Canyon, Désert). */
export type ModeId = 'cruising' | 'trial' | 'enduro' | 'course';

export interface ModeDef {
  id: ModeId;
  name: string;
  short: string;
  description: string;
}

export const MODES: ModeDef[] = [
  {
    id: 'cruising',
    name: 'Cruising',
    short: 'Balade infinie',
    description: 'Roule le plus loin possible en gardant de l’essence et de l’eau.',
  },
  {
    id: 'trial',
    name: 'Trial',
    short: 'Zones d’obstacles',
    description: 'Une épreuve de 15 zones d’obstacles : ne pose pas le pied et ne tombe pas. 3 casques, chaque chute en coûte un.',
  },
  {
    id: 'enduro',
    name: 'Enduro',
    short: 'Contre la montre',
    description: 'Terrain cassant, boue et racines. Chaque contrôle rapporte du temps : ne tombe pas à zéro.',
  },
  {
    id: 'course',
    name: 'Course',
    short: '8 pilotes',
    description: 'Affronte 7 pilotes IA jusqu’à la ligne d’arrivée. Finis sur le podium pour monter de niveau.',
  },
];

export type Difficulty = 'facile' | 'normal' | 'difficile';
export const DIFFICULTIES: { id: Difficulty; name: string }[] = [
  { id: 'facile', name: 'Facile' },
  { id: 'normal', name: 'Normal' },
  { id: 'difficile', name: 'Difficile' },
];

/** Enduro: seconds at start and gained at each control point. */
export const ENDURO_START = 70;
export const ENDURO_BONUS = 36;
export const ENDURO_CP = 700;

/** Trial: number of sections in an event. */
export const TRIAL_SECTIONS = 15;

/** Course: race length (m) for a championship level. */
export function raceLength(level: number): number {
  return 1500 + Math.min(level, 10) * 90;
}
