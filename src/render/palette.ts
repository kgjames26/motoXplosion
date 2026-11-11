import { Biome } from '../world/types';

/** Cel-shading outline colour used everywhere. */
export const INK = '#1c1a2b';

export interface BiomePalette {
  skyTop: string;
  skyBottom: string;
  far: string; // distant mountains
  farShade: string;
  snow: string;
  mid: string;
  midShade: string;
  near: string;
  nearShade: string;
  forest: string;
  forestShade: string;
  grass: string;
  grassLight: string;
  grassDark: string;
  dirt: string;
  dirtLight: string;
  dirtDark: string;
  soil: string;
  rock: string;
  rockShade: string;
  water: string;
  waterLight: string;
  /** Background layer style. */
  mesas: boolean;
}

const BASE: BiomePalette = {
  skyTop: '#1f6fe0',
  skyBottom: '#9fd6ff',
  far: '#7d9cc9',
  farShade: '#5f7fb0',
  snow: '#f4f8ff',
  mid: '#5f9e7a',
  midShade: '#4a8466',
  near: '#5daa4c',
  nearShade: '#468f3c',
  forest: '#2f7a3b',
  forestShade: '#1f5c2e',
  grass: '#6cbf3f',
  grassLight: '#9be05a',
  grassDark: '#3f8f2c',
  dirt: '#b97a48',
  dirtLight: '#d89a62',
  dirtDark: '#8a5432',
  soil: '#6b4128',
  rock: '#9a9aa2',
  rockShade: '#6d6d7a',
  water: '#3aa6e0',
  waterLight: '#bfeaff',
  mesas: false,
};

export const PALETTES: Record<Biome, BiomePalette> = {
  [Biome.Forest]: { ...BASE },
  [Biome.City]: {
    ...BASE,
    skyTop: '#2f7ad8',
    skyBottom: '#d8e8f4',
    far: '#9aa8bc',
    mid: '#7f8a9c',
    midShade: '#68738a',
    near: '#7aa05a',
    grass: '#7ab05a',
    dirt: '#8e8a86',
    dirtLight: '#a8a49e',
    dirtDark: '#6a6662',
    soil: '#5a5652',
    rock: '#a0a0a6',
  },
  [Biome.Meadow]: {
    ...BASE,
    grass: '#78c844',
    grassLight: '#a8e865',
    near: '#6cb850',
    mid: '#6aa682',
    forest: '#3a8a43',
  },
  [Biome.Mountain]: {
    ...BASE,
    skyTop: '#1a64d6',
    far: '#8aa4cf',
    mid: '#6c8f9c',
    midShade: '#56778a',
    near: '#5a9a5a',
    grass: '#5fae45',
    dirt: '#a8784e',
    dirtLight: '#c99366',
  },
  [Biome.Canyon]: {
    ...BASE,
    skyTop: '#2a78e4',
    skyBottom: '#ffe0b0',
    far: '#c8906a',
    farShade: '#a86f52',
    snow: '#f6e2c8',
    mid: '#d27a4a',
    midShade: '#ad5c38',
    near: '#e0904f',
    nearShade: '#bb6f3a',
    forest: '#8e8a3a',
    forestShade: '#6d6a2c',
    grass: '#b9b05a',
    grassLight: '#d8cf78',
    grassDark: '#8c8540',
    dirt: '#d9945a',
    dirtLight: '#efb27a',
    dirtDark: '#a8683a',
    soil: '#a4552f',
    rock: '#c97a50',
    rockShade: '#9b5636',
    mesas: true,
  },
  [Biome.Desert]: {
    ...BASE,
    skyTop: '#3d86e0',
    skyBottom: '#ffe9c4',
    far: '#e2b98a',
    farShade: '#c9966a',
    snow: '#fbecd2',
    mid: '#ecc28a',
    midShade: '#d29d64',
    near: '#f0c88e',
    nearShade: '#d6a46a',
    forest: '#9a9a48',
    forestShade: '#77773a',
    grass: '#c7b46a',
    grassLight: '#e2d28a',
    grassDark: '#968848',
    dirt: '#d9a066',
    dirtLight: '#f0c088',
    dirtDark: '#a8723e',
    soil: '#a86a3a',
    rock: '#c98a5a',
    rockShade: '#9b6038',
    mesas: true,
  },
  [Biome.River]: {
    ...BASE,
    mid: '#5a9a88',
    near: '#4fa058',
    grass: '#5fba48',
    dirt: '#a8703f',
    dirtDark: '#7a4a2a',
  },
};

/** Blend two hex colours. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

export function mixPalette(a: BiomePalette, b: BiomePalette, t: number): BiomePalette {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof BiomePalette)[]) {
    const va = a[k];
    const vb = b[k];
    if (typeof va === 'string' && typeof vb === 'string') (out as Record<string, unknown>)[k] = mix(va, vb, t);
  }
  out.mesas = t > 0.5 ? b.mesas : a.mesas;
  return out;
}
