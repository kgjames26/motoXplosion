import * as THREE from 'three';
import type { Assets } from '../assets';
import type { Sprite } from '../render/sprites';

/**
 * GPU texture helpers: the seamless ground textures (from /public/res) and the painted
 * billboard sprites (trees, rocks, grass, pickups) generated on 2D canvases at start-up.
 */
export type GroundTex = 'dirt' | 'grass' | 'rock' | 'rockWarm' | 'stone' | 'sand' | 'snow' | 'asphalt';

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
      t = new THREE.Texture(name === 'snow' || name === 'asphalt' ? proceduralGround(name) : this.assets.textures[name]);
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

/** Generated seamless ground textures (snow cover, city asphalt). */
const procCache: Record<string, HTMLCanvasElement> = {};
function proceduralGround(kind: 'snow' | 'asphalt'): HTMLCanvasElement {
  if (procCache[kind]) return procCache[kind];
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  let seed = kind === 'snow' ? 11 : 29;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // tileable value noise
  const G = 16;
  const grid: number[] = [];
  for (let i = 0; i < G * G; i++) grid.push(rnd());
  const at = (x: number, y: number) => grid[(((y % G) + G) % G) * G + (((x % G) + G) % G)];
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = (x / N) * G;
      const v = (y / N) * G;
      const n = noise(u, v) * 0.6 + noise(u * 2, v * 2) * 0.3 + rnd() * 0.1;
      const i = (y * N + x) * 4;
      if (kind === 'snow') {
        const k = 228 + n * 26;
        img.data.set([k - 6, k - 2, k + 6 > 255 ? 255 : k + 6, 255], i);
      } else {
        const k = 70 + n * 28 + (rnd() < 0.03 ? 30 : 0);
        img.data.set([k, k, k + 4, 255], i);
      }
    }
  g.putImageData(img, 0, 0);
  procCache[kind] = c;
  return c;
}
