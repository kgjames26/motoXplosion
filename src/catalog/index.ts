import type { Sprite } from '../render/sprites';
import { EXTRA_ASSETS } from './extra';
import { MODE_ASSETS } from './modes';
import { ROCK_ASSETS } from './rocks';
import { NATURE_ASSETS } from './nature';
import type { AssetDef, AssetGroup, Slot } from './types';

export type { AssetDef, AssetGroup, Slot, Obstacle } from './types';

/** Every asset of the game, by id. */
export const CATALOG: AssetDef[] = [...NATURE_ASSETS, ...MODE_ASSETS, ...EXTRA_ASSETS, ...ROCK_ASSETS];
const byId = new Map(CATALOG.map((a) => [a.id, a]));
const sprites = new Map<string, Sprite>();

export function assetDef(id: string): AssetDef | undefined {
  return byId.get(id);
}

/** Drawn lazily the first time it is needed, then cached. */
export function assetSprite(id: string): Sprite {
  let s = sprites.get(id);
  if (!s) {
    s = byId.get(id)!.draw();
    sprites.set(id, s);
  }
  return s;
}

const queryCache = new Map<string, AssetDef[]>();
export function assetsFor(groups: AssetGroup[], slot: Slot): AssetDef[] {
  const key = groups.join(',') + ':' + slot;
  let list = queryCache.get(key);
  if (!list) {
    list = CATALOG.filter((a) => a.slot === slot && groups.includes(a.group) && (a.weight ?? 1) > 0);
    queryCache.set(key, list);
  }
  return list;
}

/** Count per group (shown in the README / tests). */
export function catalogStats(): Record<string, number> {
  const r: Record<string, number> = {};
  for (const a of CATALOG) r[a.group] = (r[a.group] ?? 0) + 1;
  return r;
}
