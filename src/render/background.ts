import { fbm1, hash1, ridge1 } from '../core/math';
import { Biome } from '../world/types';
import { BiomePalette, PALETTES } from './palette';
import { propSprite } from './sprites';

/**
 * Parallax background made of cached tiles. Each layer is an infinite strip generated from
 * noise; tiles are rendered once per biome/size and reused, which keeps the frame cost low on
 * phones while allowing detailed cel-shaded art (snow caps, facets, tree lines).
 */

export type LayerKind = 'far' | 'mid' | 'near' | 'forest';

interface LayerDef {
  kind: LayerKind;
  parallax: number;
  /** Top of the layer strip as a fraction of the screen height (at reference altitude). */
  top: number;
  /** Strip height as a fraction of the screen height. */
  height: number;
  /** Vertical parallax factor. */
  py: number;
}

const LAYERS: LayerDef[] = [
  { kind: 'far', parallax: 0.04, top: 0.14, height: 0.34, py: 0.02 },
  { kind: 'mid', parallax: 0.1, top: 0.3, height: 0.3, py: 0.05 },
  { kind: 'near', parallax: 0.22, top: 0.38, height: 0.32, py: 0.1 },
  { kind: 'forest', parallax: 0.42, top: 0.4, height: 0.36, py: 0.2 },
];

const TILE_W = 512;

export class Background {
  private tiles = new Map<string, HTMLCanvasElement>();
  private sizeKey = '';

  /** Draw all background layers for one biome palette (alpha for crossfades). */
  draw(
    ctx: CanvasRenderingContext2D,
    biome: Biome,
    camX: number,
    camY: number,
    scale: number,
    W: number,
    H: number,
    alpha: number,
    only?: LayerKind[],
  ): void {
    const sk = `${W}x${H}`;
    if (sk !== this.sizeKey) {
      this.tiles.clear();
      this.sizeKey = sk;
    }
    if (this.tiles.size > 140) this.tiles.clear();
    const pal = PALETTES[biome];
    ctx.globalAlpha = alpha;
    for (let li = 0; li < LAYERS.length; li++) {
      const L = LAYERS[li];
      if (only && !only.includes(L.kind)) continue;
      const th = Math.ceil(L.height * H);
      const tw = TILE_W;
      const yShift = Math.max(-H * 0.12, Math.min(H * 0.12, camY * scale * L.py));
      const top = Math.round(L.top * H + yShift);
      const offset = camX * scale * L.parallax;
      const first = Math.floor(offset / tw);
      const last = Math.floor((offset + W) / tw);
      for (let i = first; i <= last; i++) {
        const key = `${biome}:${li}:${i}`;
        let tile = this.tiles.get(key);
        if (!tile) {
          tile = this.renderTile(L, pal, i, tw, th, H);
          this.tiles.set(key, tile);
        }
        ctx.drawImage(tile, Math.round(i * tw - offset), top);
      }
      // fill below the strip with the layer base colour
      ctx.fillStyle = this.baseColor(L.kind, pal);
      ctx.fillRect(0, top + th - 1, W, H - top - th + 1);
    }
    ctx.globalAlpha = 1;
  }

  private baseColor(kind: LayerKind, p: BiomePalette): string {
    switch (kind) {
      case 'far':
        return p.farShade;
      case 'mid':
        return p.midShade;
      case 'near':
        return p.nearShade;
      case 'forest':
        return p.forestShade;
    }
  }

  private renderTile(L: LayerDef, p: BiomePalette, index: number, tw: number, th: number, H: number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = tw;
    cv.height = th;
    const c = cv.getContext('2d')!;
    c.lineJoin = 'round';
    const x0 = index * tw;
    const unit = H / 400; // stroke widths scale with screen size
    const step = 4;
    const cols: number[] = [];
    for (let x = -step; x <= tw + step; x += step) cols.push(this.profile(L.kind, p, x0 + x, th, H));

    // silhouette
    const silhouette = () => {
      c.beginPath();
      c.moveTo(-step, th);
      for (let i = 0; i < cols.length; i++) c.lineTo(-step + i * step, cols[i]);
      c.lineTo(tw + step, th);
      c.closePath();
    };
    const [base, shade] =
      L.kind === 'far' ? [p.far, p.farShade] : L.kind === 'mid' ? [p.mid, p.midShade] : L.kind === 'near' ? [p.near, p.nearShade] : [p.forest, p.forestShade];
    silhouette();
    c.fillStyle = base;
    c.fill();

    // cel-shaded facets: each slope descending to the right gets a shadow facet bounded by a
    // diagonal from its peak, like a hand-painted mountain.
    c.save();
    silhouette();
    c.clip();
    c.fillStyle = shade;
    this.facets(c, cols, step, th, L.kind === 'far' ? 0.35 : 0.55);
    // distance haze gradient on the lower part
    const g = c.createLinearGradient(0, th * 0.3, 0, th);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, L.kind === 'far' ? 'rgba(200,225,255,0.35)' : 'rgba(200,230,255,0.12)');
    c.fillStyle = g;
    c.fillRect(0, 0, tw, th);

    if (L.kind === 'far') this.snowCaps(c, cols, step, th, p, unit);
    if (L.kind === 'mid' && !p.mesas) this.treeDots(c, cols, step, th, x0, p, unit, 0.035);
    if (L.kind === 'near' && !p.mesas) this.treeDots(c, cols, step, th, x0, p, unit, 0.06);
    if (p.mesas && L.kind !== 'forest') this.strata(c, cols, step, th, p, unit);
    c.restore();

    // outline (thin for distant layers)
    c.beginPath();
    for (let i = 0; i < cols.length; i++) {
      const x = -step + i * step;
      if (i === 0) c.moveTo(x, cols[i]);
      else c.lineTo(x, cols[i]);
    }
    c.strokeStyle = L.kind === 'far' ? 'rgba(40,60,110,0.45)' : 'rgba(28,26,43,0.55)';
    c.lineWidth = Math.max(1, unit * (L.kind === 'far' ? 0.8 : 1.2));
    c.stroke();

    if (L.kind === 'forest') this.forestRow(c, x0, tw, th, H, p);
    return cv;
  }

  /** Fill shadow facets: from each local peak, ridge down to the next valley, back up diagonally. */
  private facets(c: CanvasRenderingContext2D, cols: number[], step: number, th: number, spread: number): void {
    const n = cols.length;
    let i = 1;
    while (i < n - 1) {
      // find a peak (local minimum of y)
      while (i < n - 1 && !(cols[i] <= cols[i - 1] && cols[i] < cols[i + 1])) i++;
      if (i >= n - 1) break;
      const peak = i;
      while (i < n - 1 && cols[i + 1] >= cols[i]) i++;
      const valley = i;
      if (valley - peak < 2) continue;
      const xp = -step + peak * step;
      const xv = -step + valley * step;
      c.beginPath();
      c.moveTo(xp, cols[peak]);
      for (let k = peak + 1; k <= valley; k++) c.lineTo(-step + k * step, cols[k]);
      const bottom = Math.min(th, cols[valley] + th * 0.3);
      c.lineTo(xv - (xv - xp) * 0.12, bottom);
      c.lineTo(xp + (xv - xp) * spread, bottom);
      c.closePath();
      c.fill();
    }
  }

  /** Ridge height (y in tile pixels) for a layer at absolute layer-x. */
  private profile(kind: LayerKind, p: BiomePalette, x: number, th: number, H: number): number {
    const u = x / H;
    switch (kind) {
      case 'far': {
        if (p.mesas) {
          const n = fbm1(u * 1.2, 11, 3);
          const q = Math.round(n * 3) / 3; // terraced mesas
          const blend = q + (n - q) * 0.25;
          return th * (0.55 - blend * 0.35);
        }
        const r = ridge1(u * 1.4, 21, 5);
        return th * (0.95 - r * 0.9);
      }
      case 'mid': {
        if (p.mesas) {
          const n = fbm1(u * 1.8 + 40, 31, 3);
          const q = Math.round(n * 4) / 4;
          return th * (0.5 - (q + (n - q) * 0.2) * 0.45);
        }
        return th * (0.45 - fbm1(u * 2.2, 33, 4) * 0.35);
      }
      case 'near':
        return th * (0.4 - fbm1(u * 2.6 + 9, 47, 4) * 0.3);
      case 'forest':
        return th * (0.55 - fbm1(u * 3.5 + 3, 59, 3) * 0.15);
    }
  }

  private snowCaps(c: CanvasRenderingContext2D, cols: number[], step: number, th: number, p: BiomePalette, unit: number): void {
    // Already clipped to the silhouette: fill everything above a jagged snow line.
    const snowLine = th * 0.42;
    const line = (i: number) => snowLine + Math.sin(i * 1.7) * 3 * unit + Math.sin(i * 0.43) * 6 * unit + (i % 3) * unit;
    c.save();
    c.beginPath();
    c.moveTo(-step, 0);
    for (let i = 0; i < cols.length; i++) c.lineTo(-step + i * step, line(i));
    c.lineTo(-step + (cols.length - 1) * step, 0);
    c.closePath();
    c.fillStyle = p.snow;
    c.fill();
    c.clip();
    // shadowed snow on descending faces
    c.fillStyle = p.mesas ? '#e2c7a8' : '#c5d4f0';
    this.facets(c, cols, step, th, 0.35);
    c.restore();
  }

  private treeDots(
    c: CanvasRenderingContext2D,
    cols: number[],
    step: number,
    th: number,
    x0: number,
    p: BiomePalette,
    unit: number,
    size: number,
  ): void {
    const s = th * size;
    for (let i = 2; i < cols.length - 2; i++) {
      const x = -step + i * step;
      const n = hash1(Math.floor((x0 + x) / step), 77);
      if (n > 0.55) continue;
      const depth = hash1(Math.floor((x0 + x) / step), 78);
      const y = cols[i] + s * 0.6 + depth * (th - cols[i]) * 0.7;
      const hgt = s * (0.7 + n);
      c.beginPath();
      c.moveTo(x - hgt * 0.32, y);
      c.lineTo(x, y - hgt);
      c.lineTo(x + hgt * 0.32, y);
      c.closePath();
      c.fillStyle = depth > 0.5 ? p.forestShade : p.forest;
      c.fill();
      c.strokeStyle = 'rgba(28,26,43,0.35)';
      c.lineWidth = Math.max(0.7, unit * 0.5);
      c.stroke();
    }
  }

  private strata(c: CanvasRenderingContext2D, cols: number[], step: number, th: number, p: BiomePalette, unit: number): void {
    c.strokeStyle = p.rockShade;
    c.globalAlpha = 0.5;
    c.lineWidth = Math.max(1, unit);
    for (let k = 1; k < 6; k++) {
      const y = th * (0.2 + k * 0.13);
      c.beginPath();
      c.moveTo(0, y);
      for (let i = 0; i < cols.length; i += 3) c.lineTo(-step + i * step, y + Math.sin(i * 0.3 + k) * 2 * unit);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  /** A dense line of cel-shaded pines (or bushes in the canyon). */
  private forestRow(c: CanvasRenderingContext2D, x0: number, tw: number, th: number, H: number, p: BiomePalette): void {
    const treeH = H * 0.2;
    const spacing = treeH * 0.22;
    const firstK = Math.floor((x0 - treeH) / spacing);
    const lastK = Math.ceil((x0 + tw + treeH) / spacing);
    for (let row = 0; row < 2; row++) {
      for (let k = firstK; k <= lastK; k++) {
        const n = hash1(k, 300 + row);
        if (p.mesas && n > 0.25) continue;
        if (!p.mesas && n > 0.85) continue;
        const x = k * spacing - x0 + (hash1(k, 400 + row) - 0.5) * spacing;
        const u = (k * spacing) / H;
        const groundY = th * (0.55 - fbm1(u * 3.5 + 3, 59, 3) * 0.15);
        const scale = (0.55 + n * 0.6) * (row === 0 ? 0.8 : 1);
        const variant = Math.floor(hash1(k, 500) * 3);
        const spr = propSprite(p.mesas ? 'cactus' : 'pine', variant, Biome.Forest);
        const pxPerM = (treeH * scale) / spr.h;
        const y = groundY + th * (row === 0 ? 0.12 : 0.32);
        c.save();
        c.globalAlpha = row === 0 ? 0.85 : 1;
        c.drawImage(spr.canvas, x - spr.ax * pxPerM, y - spr.ay * pxPerM, spr.w * pxPerM, spr.h * pxPerM);
        c.restore();
      }
    }
  }
}
