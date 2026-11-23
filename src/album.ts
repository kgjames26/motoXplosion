import { circuitKey, CircuitMode } from './circuits';
import type { RegionId } from './world/regions';

/**
 * Album (v2.70, autocollants v2.82): 60 stickers « L'épopée du motocross » in 3 volumes of 20
 * (pictures cut from the posters by tools/build_stickers.py into public/res/stickers/NN.webp).
 * A sticker is won with a bronze medal, so ownership is derived from the saved circuits:
 * nothing new is stored in the profile (saves are untouched).
 * Order = pages of 12: 5 worlds × (trial, enduro, course) × levels 10/20/30, then Fuite, then Envol.
 */
export type CardReq =
  | { kind: 'circuit'; mode: CircuitMode; region: RegionId; n: number }
  | { kind: 'fuite'; n: number }
  | { kind: 'envol'; dist: number };

export interface Card {
  id: number;
  name: string;
  /** volume of the poster it comes from (1-3) */
  vol: 1 | 2 | 3;
  bio: string;
  tier: 1 | 2 | 3;
  img: string;
  req: CardReq;
}

export const ALBUM_PAGE = 12;
const WORLDS: RegionId[] = ['alpes', 'foret', 'canyon', 'desert', 'sf'];
const MODES: CircuitMode[] = ['trial', 'enduro', 'course'];
const FUITE_LEVELS = [3, 5, 8, 10, 13, 15, 18, 20, 23, 25, 28, 30];
export const ENVOL_CARDS = [120, 170, 220]; // v2.75: the humps of the run-up must be ridden well for the long ones

export const VOLUMES: Record<1 | 2 | 3, string> = { 1: 'Les fondations', 2: 'Technique & environnement', 3: 'Compétition & logistique' };

/** [name, one line about it], in poster order (vol 1, 2, 3; left to right, top to bottom). */
const STICKERS: [string, string][] = [
  ['Le pilote', 'Celui qui tient le guidon et ne lâche rien.'],
  ['Le casque', 'Léger, solide, avec sa visière : la première protection.'],
  ['Les lunettes', 'Pour voir la piste malgré la terre et les projections.'],
  ['Les bottes', 'Rigides et montantes, elles protègent chevilles et tibias.'],
  ['La protection', 'Le pare-pierres protège la poitrine et les épaules.'],
  ['Les gants', 'Pour garder la prise sur les poignées, même mouillées.'],
  ['Le maillot', 'Coloré, aéré, aux couleurs de l’équipe.'],
  ['Le guidon', 'Large et cintré, avec sa mousse de protection.'],
  ['L’amortisseur', 'Il encaisse les réceptions à l’arrière de la moto.'],
  ['La fourche', 'La suspension avant : elle avale bosses et trous.'],
  ['Le pneu', 'Des crampons pour mordre dans la terre.'],
  ['La chaîne', 'Elle transmet la force du moteur à la roue arrière.'],
  ['Le départ', 'Tous alignés derrière la grille, moteur hurlant.'],
  ['Le virage', 'Le corps penché, la jambe tendue, on garde l’élan.'],
  ['Le saut', 'Quelques secondes dans les airs, la moto bien droite.'],
  ['L’atterrissage', 'Bien réceptionner pour repartir sans perdre de vitesse.'],
  ['La boue', 'Elle colle partout et rend chaque mètre plus dur.'],
  ['Le stand', 'Là où la moto est préparée entre deux manches.'],
  ['La piste', 'Bosses, virages, sauts : le terrain de jeu.'],
  ['Le podium', 'Les trois meilleurs, le trophée et le champagne.'],
  ['Le moteur', 'Le cœur de la moto, qui donne toute la puissance.'],
  ['Le pot d’échappement', 'Il évacue les gaz et donne sa voix à la moto.'],
  ['Le carbu', 'Il mélange l’air et l’essence avant l’explosion.'],
  ['Le filtre à air', 'Il empêche la poussière d’entrer dans le moteur.'],
  ['Le disque de frein', 'Pincé par l’étrier, il arrête la moto.'],
  ['Le radiateur', 'Il refroidit le moteur pendant l’effort.'],
  ['La poignée de gaz', 'Un quart de tour et la moto bondit.'],
  ['Le repose-pied', 'Crantés pour que la botte ne glisse pas.'],
  ['Le sélecteur', 'Du bout du pied, on passe les vitesses.'],
  ['La visière', 'Elle protège du soleil et des mottes de terre.'],
  ['Le tour de cou', 'Il protège la nuque lors des chutes.'],
  ['La genouillère', 'Elle tient le genou bien en place.'],
  ['L’ornière', 'Un sillon creusé par les roues, à suivre ou à éviter.'],
  ['Le scrub', 'Coucher la moto en l’air pour rester bas et rapide.'],
  ['Le whoops', 'Une suite de petites bosses à survoler.'],
  ['L’échauffement', 'Préparer le corps avant de rouler.'],
  ['Le panneau de stand', 'L’équipe y affiche place, écart et tours restants.'],
  ['Le commissaire', 'Ses drapeaux annoncent les dangers et l’arrivée.'],
  ['Le nettoyage', 'Un coup de jet pour retrouver la moto sous la boue.'],
  ['Le transport', 'La moto voyage sanglée à l’arrière du pick-up.'],
  ['Le réservoir', 'Il contient l’essence pour toute la manche.'],
  ['La selle', 'Striée pour ne pas glisser, même debout.'],
  ['Le cadre', 'Le squelette de la moto, qui tient tout ensemble.'],
  ['La plaque numéro', 'Le numéro du pilote, bien visible à l’avant.'],
  ['Le pignon', 'Sa taille change l’accélération et la vitesse.'],
  ['Le levier', 'Embrayage à gauche, frein avant à droite.'],
  ['Le rayon', 'Des dizaines de rayons tendus font une roue solide.'],
  ['Le moyeu', 'Le centre de la roue, autour duquel tout tourne.'],
  ['Le pare-pierres', 'Il arrête les cailloux projetés par les autres.'],
  ['L’orthèse', 'Elle soutient une articulation fragile.'],
  ['Le tear-off', 'Un film qu’on arrache des lunettes quand elles sont sales.'],
  ['La poulie de départ', 'Elle cale la fourche basse pour un départ canon.'],
  ['L’entraînement', 'Des tours et des tours pour progresser.'],
  ['Le briefing', 'Les consignes de course avant le départ.'],
  ['L’inspection', 'On vérifie la moto et la piste avant de rouler.'],
  ['Le chrono', 'Il départage les pilotes au centième.'],
  ['L’assistance', 'L’équipe qui répare, encourage et fête les succès.'],
  ['La conduite', 'Doigts sur les leviers, regard loin devant.'],
  ['Le parc fermé', 'Les motos y attendent, alignées, avant la course.'],
  ['La victoire', 'Le bras levé : tout ce travail a payé.'],
];

function make(): Card[] {
  const reqs: CardReq[] = [];
  const tiers: (1 | 2 | 3)[] = [];
  for (const region of WORLDS)
    for (const mode of MODES)
      for (const n of [10, 20, 30]) {
        reqs.push({ kind: 'circuit', mode, region, n });
        tiers.push(n === 10 ? 1 : n === 20 ? 2 : 3);
      }
  FUITE_LEVELS.forEach((n) => {
    reqs.push({ kind: 'fuite', n });
    tiers.push(n <= 10 ? 1 : n <= 20 ? 2 : 3);
  });
  ENVOL_CARDS.forEach((dist, k) => {
    reqs.push({ kind: 'envol', dist });
    tiers.push((k + 1) as 1 | 2 | 3);
  });
  return reqs.map((req, i) => ({
    id: i,
    name: STICKERS[i][0],
    vol: (1 + Math.floor(i / 20)) as 1 | 2 | 3,
    bio: STICKERS[i][1],
    tier: tiers[i],
    img: `/res/stickers/${String(i).padStart(2, '0')}.webp`,
    req,
  }));
}

export const CARDS: Card[] = make();
export const ALBUM_PAGES = Math.ceil(CARDS.length / ALBUM_PAGE);

export function cardOwned(c: Card, circuits: Record<string, { done: boolean }>, best: Record<string, number>): boolean {
  const r = c.req;
  if (r.kind === 'envol') return (best['envol:alpes'] ?? 0) >= r.dist;
  const mode: CircuitMode = r.kind === 'fuite' ? 'fuite' : r.mode;
  const region: RegionId = r.kind === 'fuite' ? 'alpes' : r.region;
  return (['facile', 'normal', 'difficile'] as const).some((d) => circuits[circuitKey(mode, region, r.n, d)]?.done);
}

/** The sticker's picture (lazy: 12 per page, 60 in all). */
export function cardArt(c: Card): string {
  return `<img src="${c.img}" alt="" loading="lazy" decoding="async" draggable="false">`;
}

/** Ids of the stickers owned, to spot the ones a run has just won. */
export function ownedIds(circuits: Record<string, { done: boolean }>, best: Record<string, number>): Set<number> {
  return new Set(CARDS.filter((c) => cardOwned(c, circuits, best)).map((c) => c.id));
}
