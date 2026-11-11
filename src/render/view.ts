import type { Assets } from '../assets';

/** Screen mapping shared by the render modules (device pixels, y down on screen). */
export interface View {
  W: number;
  H: number;
  camX: number;
  camY: number;
  scale: number; // pixels per metre
  time: number;
  sx(x: number): number;
  sy(y: number): number;
}

export type TexName = 'dirt' | 'grass' | 'rock' | 'rockWarm' | 'stone';

/** World size (metres) covered by one texture tile. */
const TEX_METRES: Record<TexName, number> = { dirt: 3.2, grass: 3.0, rock: 6, rockWarm: 6, stone: 4 };

/**
 * Canvas patterns for the seamless textures, anchored to world coordinates so they scroll
 * with the terrain (no swimming).
 */
export class Textures {
  private patterns: Partial<Record<TexName, CanvasPattern>> = {};
  private sizes: Partial<Record<TexName, number>> = {};

  constructor(ctx: CanvasRenderingContext2D, assets: Assets) {
    for (const k of Object.keys(assets.textures) as TexName[]) {
      const img = assets.textures[k];
      const p = ctx.createPattern(img, 'repeat');
      if (p) {
        this.patterns[k] = p;
        this.sizes[k] = img.width;
      }
    }
  }

  /** Pattern positioned for the current camera. `parallax` < 1 for distant planes. */
  get(name: TexName, v: View, scaleMul = 1, offsetY = 0): CanvasPattern | null {
    const p = this.patterns[name];
    if (!p) return null;
    const s = (TEX_METRES[name] * v.scale * scaleMul) / (this.sizes[name] ?? 512);
    const tx = v.sx(0);
    const ty = v.sy(offsetY);
    p.setTransform(new DOMMatrix([s, 0, 0, s, tx, ty]));
    return p;
  }
}
