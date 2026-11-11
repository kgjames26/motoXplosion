/** Shared world data types. Units are metres, y points up. */

export const DX = 0.5; // terrain sample spacing (m)
export const CHUNK_SAMPLES = 256; // samples per storage chunk (128 m)

export enum Biome {
  Forest = 0,
  Meadow = 1,
  Mountain = 2,
  Canyon = 3,
  River = 4,
  Desert = 5,
}
export const BIOME_COUNT = 6;

export enum Surface {
  Dirt = 0,
  Grass = 1,
  Mud = 2,
  Sand = 3,
  Rock = 4,
  Wood = 5,
  Water = 6,
}

/** Physical properties for each surface. */
export interface SurfaceProps {
  grip: number; // friction coefficient
  rolling: number; // rolling resistance coefficient
  tireDamp: number; // multiplier on tyre damping (low = bouncier)
  dust: [number, number, number]; // particle RGB
  dustAmount: number;
}

export const SURFACES: Record<Surface, SurfaceProps> = {
  [Surface.Dirt]: { grip: 1.05, rolling: 0.025, tireDamp: 1, dust: [196, 150, 104], dustAmount: 1 },
  [Surface.Grass]: { grip: 0.85, rolling: 0.04, tireDamp: 1, dust: [150, 170, 90], dustAmount: 0.45 },
  [Surface.Mud]: { grip: 0.7, rolling: 0.09, tireDamp: 1.4, dust: [110, 78, 50], dustAmount: 1.2 },
  [Surface.Sand]: { grip: 0.78, rolling: 0.08, tireDamp: 1.3, dust: [230, 186, 130], dustAmount: 1.5 },
  [Surface.Rock]: { grip: 1.1, rolling: 0.02, tireDamp: 0.6, dust: [170, 165, 160], dustAmount: 0.4 },
  [Surface.Wood]: { grip: 0.95, rolling: 0.02, tireDamp: 0.8, dust: [160, 120, 80], dustAmount: 0.15 },
  [Surface.Water]: { grip: 0.65, rolling: 0.16, tireDamp: 1.5, dust: [200, 230, 255], dustAmount: 1.6 },
};

export type PropKind =
  | 'pine'
  | 'pineDead'
  | 'bush'
  | 'rock'
  | 'boulder'
  | 'flower'
  | 'grass'
  | 'log'
  | 'cactus'
  | 'flag'
  | 'stump'
  // desert set
  | 'palm'
  | 'shrub'
  | 'deadTree'
  | 'tumbleweed'
  | 'sandstone';

/**
 * Decorative prop. `depth` 0 = on the track line, >0 = behind (further away, drawn smaller
 * and higher), <0 = in front of the track (foreground).
 */
export interface Prop {
  x: number;
  kind: PropKind | 'asset';
  /** Catalog asset id (kind === 'asset'). */
  asset?: string;
  /** Explicit ground height for the base (obstacles on the track). */
  baseY?: number;
  depth: number;
  scale: number;
  variant: number;
  flip: boolean;
}

export type PickupKind = 'fuel' | 'water';

/** Coins to collect (the garage currency). */
export interface Coin {
  x: number;
  y: number;
  taken: boolean;
  takenAt: number;
}
export interface Pickup {
  x: number;
  y: number;
  kind: PickupKind;
  taken: boolean;
  takenAt: number;
}

/** A wooden bridge spanning a ravine or a river. Physics uses the deck height stored in the heightfield. */
export interface Bridge {
  kind: 'wood' | 'stone' | 'iron' | 'viaduct';
  x0: number;
  x1: number;
  deckY0: number;
  deckY1: number;
  floorY: number;
  water: boolean;
  /** Deck sag (rope bridge, > 0) or hump (stone arch, < 0) in metres. */
  sag: number;
  /** Number of arches / truss spans. */
  spans: number;
}

/** Special track decoration for berms / ramps drawn in 2.5D. */
export interface TrackMark {
  x0: number;
  x1: number;
  kind: 'berm' | 'kicker' | 'whoops' | 'ford' | 'start' | 'checkpoint' | 'wadi' | 'oasis' | 'ledges' | 'sectionStart' | 'sectionEnd' | 'finish';
  /** Section number (trial) or checkpoint index. */
  n?: number;
}
