import * as THREE from 'three';
import type { Assets } from '../assets';
import type { Sprite } from '../render/sprites';

/**
 * GPU texture helpers: the seamless ground textures (from /public/res) and the painted
 * billboard sprites (trees, rocks, grass, pickups) generated on 2D canvases at start-up.
 */
export type GroundTex = 'dirt' | 'grass' | 'rock' | 'rockWarm' | 'stone' | 'sand';

export class TextureBank {
  private ground = new Map<string, THREE.Texture>();
  private sprites = new Map<Sprite, THREE.Texture>();

  constructor(
    private assets: Assets,
    private anisotropy: number,
  ) {}

  /** Repeating ground texture; `metres` = world size of one tile. */
  groundTex(name: GroundTex, metres: number): THREE.Texture {
    const key = `${name}:${metres}`;
    let t = this.ground.get(key);
    if (!t) {
      t = new THREE.Texture(this.assets.textures[name]);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1 / metres, 1 / metres);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = this.anisotropy;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.needsUpdate = true;
      this.ground.set(key, t);
    }
    return t;
  }

  spriteTex(s: Sprite): THREE.Texture {
    let t = this.sprites.get(s);
    if (!t) {
      t = new THREE.CanvasTexture(s.canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(4, this.anisotropy);
      this.sprites.set(s, t);
    }
    return t;
  }
}

/** A unit billboard quad anchored at its bottom centre, matching a Sprite's anchor. */
export function spriteGeometry(s: Sprite): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(s.w, s.h);
  // anchor: (ax, ay) from the top-left corner in metres
  g.translate(s.w / 2 - s.ax, s.ay - s.h / 2, 0);
  return g;
}
