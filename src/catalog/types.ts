import type { Sprite } from '../render/sprites';

/**
 * Asset catalog types. An asset is one distinct drawable object (a given tree species, size and
 * season; a chalet with blue shutters; a stack of three red pallets...). Assets are produced by
 * parameterised families and drawn procedurally on first use.
 */
export type AssetGroup = 'green' | 'alpes' | 'foret' | 'canyon' | 'desert' | 'trial' | 'enduro' | 'course';

/** Where the generator may place it. */
export type Slot = 'tree' | 'bush' | 'ground' | 'structure' | 'animal' | 'trackside' | 'obstacle';

/** Physical obstacle on the track (trial / enduro): its top follows `profile` (0..1 of h). */
export interface Obstacle {
  w: number;
  h: number;
  profile: (u: number) => number;
  /** 1 = easy, 2 = medium, 3 = hard. */
  tier: 1 | 2 | 3;
  /** Big trial obstacle (circuits since v2.6). */
  big?: boolean;
}

export interface AssetDef {
  id: string;
  name: string;
  group: AssetGroup;
  slot: Slot;
  draw: () => Sprite;
  obstacle?: Obstacle;
  /** Relative frequency inside its slot (default 1). */
  weight?: number;
}
