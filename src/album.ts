import { circuitKey, CircuitMode } from './circuits';
import type { RegionId } from './world/regions';

/**
 * Album (v2.70): 60 collectible cards of invented motocross riders (names that sound like the
 * paddock, but none is a real person). A card is won with a bronze medal, so ownership is
 * derived from the saved circuits: nothing new is stored in the profile.
 * Order = pages of 12: 5 worlds × (trial, enduro, course) × levels 10/20/30, then Fuite, then Envol.
 */
export type CardReq =
  | { kind: 'circuit'; mode: CircuitMode; region: RegionId; n: number }
  | { kind: 'fuite'; n: number }
  | { kind: 'envol'; dist: number };

export interface Card {
  id: number;
  name: string;
  country: string;
  no: number;
  bio: string;
  tier: 1 | 2 | 3;
  hue: number;
  req: CardReq;
}

export const ALBUM_PAGE = 12;
const WORLDS: RegionId[] = ['alpes', 'foret', 'canyon', 'desert', 'sf'];
const MODES: CircuitMode[] = ['trial', 'enduro', 'course'];
const FUITE_LEVELS = [3, 5, 8, 10, 13, 15, 18, 20, 23, 25, 28, 30];
export const ENVOL_CARDS = [200, 250, 275]; // v2.74: jumps are longer (≈ 225 m to 280 m)

const FIRST = ['Antoine', 'Tonio', 'Jorge', 'Jeremy', 'Romain', 'Max', 'Glenn', 'Ken', 'Dylan', 'Eli', 'Marvin', 'Calvin', 'Gautier', 'Mathys', 'Jago', 'Ryan', 'Tim', 'Brian', 'Kevin', 'Pauls', 'Valentin', 'Lucas', 'Hunter', 'Jett'];
const LAST = [
  'Cairelli', 'Herlinx', 'Pradelo', 'Gajsek', 'Februre', 'Jonask', 'Paulard', 'Desallor', 'Seewart', 'Coldenhaf',
  'Lawrenson', 'Roczen-Vik', 'Tixier-Lan', 'Vlaans', 'Simpsen', 'Barcia-Roy', 'Musquin-Ay', 'Webbel', 'Anderko', 'Plessing',
  'Strijbos', 'Everts-Dael', 'Geerts', 'Bobryshov', 'Lupinaz', 'Guadagni', 'Olsenn', 'Renaux', 'Marcheau', 'Bogersen',
  'Van Horbeck', 'Aranzio', 'Beaton-Fell', 'Cooperix', 'Zanchi', 'Karlsson-Be', 'Jasikonis', 'Tonkov-Ray', 'Smetz', 'Mewse',
  'Ferrandis-L', 'Hofmann-Dy', 'Pichon', 'Vialle', 'Bernardet', 'Lesiardo', 'Mancini-Ro', 'Boissier', 'Frossard', 'Thévenot',
  'Dubiel', 'Vuillemin', 'Cervellin', 'Stauffer', 'Janssens-Ho', 'Delacroze', 'Fonvieille', 'Hautecour', 'Maillard-Sy', 'Rousseaux',
];
const COUNTRIES = ['Italie', 'Pays-Bas', 'Espagne', 'France', 'Belgique', 'Slovénie', 'Lettonie', 'Allemagne', 'États-Unis', 'Australie', 'Suisse', 'Estonie'];

const TITLES: Record<1 | 2 | 3, string[]> = {
  1: ['Champion national junior', 'Vainqueur du Motocross de Lommel', 'Vice-champion régional MX2', 'Révélation de la saison', 'Vainqueur de la Coupe des Ardennes'],
  2: ["Champion d'Europe EMX250", 'Vainqueur du Grand Prix de Belgique', 'Triple vainqueur du Supercross de Bercy', 'Podium au Motocross des Nations', 'Champion de France Élite'],
  3: ['Quintuple champion du monde MX1', 'Vainqueur du Motocross des Nations', 'Champion du monde MXGP', 'Légende des sables de Lommel', 'Double champion du monde et du Supercross'],
};

function bio(i: number, tier: 1 | 2 | 3): string {
  const t = TITLES[tier];
  const a = t[i % t.length];
  const b = t[(i * 3 + 1) % t.length];
  const y = 2004 + ((i * 7) % 22);
  return `${a} (${y}) · ${b === a ? 'Vainqueur de 12 manches' : b} (${y + 2})`;
}

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
    name: `${FIRST[i % FIRST.length]} ${LAST[i]}`,
    country: COUNTRIES[(i * 5) % COUNTRIES.length],
    no: 2 + ((i * 17) % 98),
    bio: bio(i, tiers[i]),
    tier: tiers[i],
    hue: (i * 47) % 360,
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

/** The card's picture: a stylised rider bust (jersey colour from the card, number on the chest). */
export function cardArt(c: Card): string {
  const j = `hsl(${c.hue} 70% 50%)`;
  const j2 = `hsl(${(c.hue + 40) % 360} 75% 35%)`;
  const h = `hsl(${(c.hue + 180) % 360} 60% 92%)`;
  return `<svg viewBox="0 0 100 120" aria-hidden="true"><defs><linearGradient id="bg${c.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${c.hue} 45% 28%)"/><stop offset="1" stop-color="hsl(${(c.hue + 60) % 360} 50% 12%)"/></linearGradient></defs>
<rect width="100" height="120" fill="url(#bg${c.id})"/><path d="M0 100 L30 70 L52 92 L74 62 L100 96 V120 H0Z" fill="rgba(255,255,255,.08)"/>
<path d="M14 120 C14 86 30 74 50 74 C70 74 86 86 86 120Z" fill="${j}"/><path d="M14 120 C14 100 20 90 28 84 L36 120Z M86 120 C86 100 80 90 72 84 L64 120Z" fill="${j2}"/>
<rect x="42" y="66" width="16" height="12" rx="4" fill="#d9a77c"/>
<ellipse cx="50" cy="46" rx="22" ry="24" fill="${h}"/><path d="M28 46 C28 38 36 38 50 38 C64 38 72 38 72 46 L72 54 C72 58 66 58 50 58 C34 58 28 58 28 54Z" fill="#14181f"/>
<path d="M30 33 C36 22 64 22 70 33" fill="none" stroke="${j}" stroke-width="5" stroke-linecap="round"/>
<text x="50" y="108" text-anchor="middle" font-family="Impact,Arial Black,sans-serif" font-size="22" fill="#fff" stroke="rgba(0,0,0,.4)" stroke-width="1">${c.no}</text></svg>`;
}
