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
    description: 'Balade sans fin : la météo change toute seule en route. Plus tu roules longtemps, plus tu gagnes : c’est ici qu’on gagne le plus !',
  },
  {
    id: 'trial',
    name: 'Trial',
    short: 'Chrono d’obstacles',
    description: '25 circuits de gros obstacles par monde. Arrive au bout le plus vite possible : chaque chute ajoute 15 secondes.',
  },
  {
    id: 'enduro',
    name: 'Enduro',
    short: 'Grosses collines',
    description: '25 circuits par monde avec de grosses collines à monter et à descendre sans tomber. Le chrono décide de la médaille.',
  },
  {
    id: 'course',
    name: 'Course',
    short: '8 pilotes',
    description: '25 circuits par monde contre 7 pilotes, en facile, moyen ou difficile. Monte sur le podium pour gagner une médaille.',
  },
];

export type Difficulty = 'facile' | 'normal' | 'difficile';
export const DIFFICULTIES: { id: Difficulty; name: string }[] = [
  { id: 'facile', name: 'Facile' },
  { id: 'normal', name: 'Moyen' },
  { id: 'difficile', name: 'Difficile' },
];

/** Enduro: distance between control points (m). */
export const ENDURO_CP = 700;

/** Course: race length (m) for a championship level. */
export function raceLength(level: number): number {
  return 1500 + Math.min(level, 10) * 90;
}
