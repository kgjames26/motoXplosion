/** Game modes. Every mode is played on the region maps (Alpes, Forêt, Canyon, Désert). */
export type ModeId = 'cruising' | 'trial' | 'enduro' | 'course' | 'envol' | 'fuite';

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
    description: 'Un grand voyage sans fin à travers tous les mondes : le décor, le terrain et la météo changent en route. Dose ta vitesse sur les sauts. Plus tu roules longtemps, plus tu gagnes !',
  },
  {
    id: 'trial',
    name: 'Trial',
    short: 'Chrono d’obstacles',
    description: 'Franchis de gros obstacles, zone après zone, le plus vite possible. Chaque chute ajoute 25 secondes.',
  },
  {
    id: 'enduro',
    name: 'Enduro',
    short: 'Grosses collines',
    description: 'De grosses collines raides, des passages techniques et de gros sauts. Arrive au bout sans tomber : le chrono décide de la médaille.',
  },
  {
    id: 'course',
    name: 'Course',
    short: '8 pilotes',
    description: 'Départ arrêté contre 7 pilotes. Monte sur le podium pour gagner une médaille.',
  },
  {
    id: 'envol',
    name: 'Envol',
    short: 'Record de saut',
    description: 'Prends de la vitesse sur la colline, enchaîne les buttes, puis saute le plus loin possible depuis le tremplin. Atterris sans tomber pour que le saut compte !',
  },
  {
    id: 'fuite',
    name: 'Fuite',
    short: 'Un rocher te poursuit',
    description: 'Descends la montagne avant que le rocher ne t’écrase ! Le décor change avec l’altitude : neige au sommet, forêt, plaine puis ville. S’il te rattrape, c’est perdu.',
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
