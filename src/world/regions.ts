import { Biome } from './types';

/**
 * A region is a level: the rider stays in the same part of the world for the whole run,
 * crossing its different environments (biomes). Each region has its own biome mix,
 * bridge styles and backdrop art.
 */
export type BridgeKind = 'wood' | 'stone' | 'iron' | 'viaduct' | 'urban';
export type RegionId = 'alpes' | 'canyon' | 'foret' | 'desert' | 'sf' | 'cross';

export interface RegionDef {
  id: RegionId;
  name: string;
  subtitle: string;
  /** Biomes met in this region, with relative frequency. */
  biomes: Partial<Record<Biome, number>>;
  start: Biome;
  bridges: Partial<Record<BridgeKind, number>>;
  /** Painted backdrop per biome (keys of public/res/backdrops.json); missing = procedural. */
  backdrop: Partial<Record<Biome, string>>;
  /** Overall colour grading of the world (multiplied on the near layers). */
  tint: string;
}

export const REGIONS = {
  alpes: {
    id: 'alpes',
    name: 'Alpes',
    subtitle: 'Alpages, forêts de pins et gorges',
    biomes: { [Biome.Meadow]: 3, [Biome.Forest]: 3, [Biome.Mountain]: 2, [Biome.River]: 2 },
    start: Biome.Meadow,
    bridges: { wood: 3, stone: 3, iron: 2, viaduct: 2 },
    backdrop: {
      [Biome.Meadow]: 'alps-forest',
      [Biome.Mountain]: 'alps-forest',
      [Biome.Forest]: 'alps-forest',
      [Biome.River]: 'alps-forest',
    },
    tint: '#ffffff',
  },
  foret: {
    id: 'foret',
    name: 'Grande Forêt',
    subtitle: 'Sous-bois, rivières et vieux ponts',
    biomes: { [Biome.Forest]: 5, [Biome.River]: 3, [Biome.Meadow]: 1 },
    start: Biome.Forest,
    bridges: { wood: 4, stone: 3, iron: 1, viaduct: 1 },
    backdrop: { [Biome.Forest]: 'alps-forest', [Biome.River]: 'alps-forest', [Biome.Meadow]: 'alps-forest' },
    tint: '#eef6ea',
  },
  desert: {
    id: 'desert',
    name: 'Désert',
    subtitle: 'Dunes, oueds, oasis et dalles de grès',
    biomes: { [Biome.Desert]: 6, [Biome.Canyon]: 1 },
    start: Biome.Desert,
    bridges: { wood: 2, iron: 2 },
    backdrop: {},
    tint: '#fff4e0',
  },
  sf: {
    id: 'sf',
    name: 'San Francisco',
    subtitle: 'Rues en pente, maisons victoriennes, ponts et baie',
    biomes: { [Biome.City]: 6, [Biome.River]: 1, [Biome.Meadow]: 1 },
    start: Biome.City,
    bridges: { urban: 4, iron: 2, viaduct: 1 },
    backdrop: {},
    tint: '#f2f4f8',
  },
  canyon: {
    id: 'canyon',
    name: 'Canyon',
    subtitle: 'Mesas, sable rouge et voies ferrées',
    biomes: { [Biome.Canyon]: 5, [Biome.Mountain]: 1, [Biome.River]: 1 },
    start: Biome.Canyon,
    bridges: { wood: 1, stone: 1, iron: 3, viaduct: 2 },
    backdrop: {},
    tint: '#fff2e4',
  },
} as Record<RegionId, RegionDef>;

/** v2.25: the motocross track — an outdoor MX circuit, bump after bump. */
REGIONS.cross = {
  id: 'cross',
  name: 'Circuit de cross',
  subtitle: 'Buttes à enchaîner, whoops et tables : un vrai terrain de motocross',
  biomes: { [Biome.Meadow]: 1 },
  start: Biome.Meadow,
  bridges: { wood: 1 },
  backdrop: { [Biome.Meadow]: 'alps-forest' },
  tint: '#ffffff',
};

export const REGION_ORDER: RegionId[] = ['alpes', 'foret', 'canyon', 'desert', 'sf', 'cross'];
