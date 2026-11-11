import * as THREE from 'three';
import { fbm1, hash1, noise1 } from '../core/math';
import { propSprite, Sprite } from '../render/sprites';
import { Biome, CHUNK_SAMPLES, DX, PropKind, Surface } from '../world/types';
import type { World } from '../world/world';
import { spriteGeometry, TextureBank } from './textures';

/**
 * 3D terrain built per world chunk (128 m):
 *   - the track (physical surface) as a 2 m wide band at z ∈ [Z_BACK, Z_FRONT],
 *   - a field behind it and rolling hills further back (true depth with the perspective camera),
 *   - the ground in front of the track down towards the camera,
 *   - billboards for trees, rocks and grass placed at their depth.
 * Ravines/valleys under bridges come from the "visual" profile, so gorges cross the scene.
 */

export const Z_FRONT = 0.75;
export const Z_BACK = -1.25;
const FIELD_END = -12;
const HILLS_END = -75;
const FG_END = 42;

export interface ChunkVisual {
  index: number;
  group: THREE.Group;
}

export interface TerrainStyle {
  warm: boolean; // canyon region
  treeDensity: number; // quality multiplier
}

/** Height of the field behind the track at (x, z). */
export function backFieldY(w: World, x: number, z: number): number {
  const t = Math.min(1, (Z_BACK - z) / (Z_BACK - FIELD_END));
  return w.visualAt(x) + 0.05 + t * (1.0 + 0.4 * noise1(x * 0.11, 3)) + t * t * 0.3;
}

function smoothVisual(w: World, x: number): number {
  let s = 0;
  for (let k = -3; k <= 3; k++) s += w.visualAt(x + k * 5);
  return s / 7;
}

/** Height of the hills band (behind the field). */
export function hillsY(w: World, x: number, z: number): number {
  const t = Math.min(1, Math.max(0, (FIELD_END - z) / (FIELD_END - HILLS_END)));
  const base = smoothVisual(w, x);
  const swell = 0.8 + 2.6 * (fbm1(x / 55 + z * 0.01, 17, 3) * 0.5 + 0.5);
  return base + 1.2 + t * swell + Math.sin(x * 0.05 + z * 0.08) * t * 0.6;
}

/** Height of the ground in front of the track at (x, z). */
export function foreY(w: World, x: number, z: number): number {
  const t = (z - Z_FRONT) / (FG_END - Z_FRONT);
  const near = Math.min(1, (z - Z_FRONT) / 8);
  return w.visualAt(x) - 0.28 - near * 1.5 - t * 2 + noise1(x * 0.3 + z, 5) * 0.2 * near;
}

const SURF_COLOR: Record<Surface, [number, number, number]> = {
  [Surface.Dirt]: [1, 1, 1],
  [Surface.Grass]: [0.72, 0.95, 0.6],
  [Surface.Mud]: [0.55, 0.42, 0.34],
  [Surface.Sand]: [1.12, 1.02, 0.86],
  [Surface.Rock]: [0.82, 0.82, 0.86],
  [Surface.Wood]: [1, 1, 1],
  [Surface.Water]: [0.45, 0.75, 1.15],
};

/** Grid surface helper: builds an indexed grid of (cols × rows) vertices. */
function grid(
  cols: number,
  rows: number,
  pos: (c: number, r: number) => [number, number, number],
  uv: (x: number, y: number, z: number) => [number, number],
  color: (c: number, r: number, x: number, y: number, z: number) => [number, number, number],
  steepGroup?: (c: number) => boolean,
  flip = false,
): THREE.BufferGeometry {
  const p = new Float32Array(cols * rows * 3);
  const u = new Float32Array(cols * rows * 2);
  const col = new Float32Array(cols * rows * 3);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const [x, y, z] = pos(c, r);
      p.set([x, y, z], i * 3);
      u.set(uv(x, y, z), i * 2);
      col.set(color(c, r, x, y, z), i * 3);
    }
  const normalIdx: number[] = [];
  const steepIdx: number[] = [];
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      const target = steepGroup && steepGroup(c) ? steepIdx : normalIdx;
      if (flip) target.push(a, b, d, b, e, d);
      else target.push(a, d, b, b, d, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex([...normalIdx, ...steepIdx]);
  g.addGroup(0, normalIdx.length, 0);
  if (steepIdx.length) g.addGroup(normalIdx.length, steepIdx.length, 1);
  g.computeVertexNormals();
  return g;
}

export class TerrainBuilder {
  private mats: {
    track: THREE.Material;
    ground: THREE.Material;
    rock: THREE.Material;
    hills: THREE.Material;
    water: THREE.MeshLambertMaterial;
    lip: THREE.Material;
  };
  private spriteGeo = new Map<Sprite, THREE.PlaneGeometry>();
  private spriteMat = new Map<Sprite, THREE.Material>();

  constructor(
    private bank: TextureBank,
    private style: TerrainStyle,
  ) {
    const warm = style.warm;
    const lambert = (map: THREE.Texture, color = 0xffffff) => new THREE.MeshLambertMaterial({ map, vertexColors: true, color });
    this.mats = {
      track: lambert(bank.groundTex('dirt', 3.2), warm ? 0xffe2c4 : 0xffffff),
      ground: lambert(bank.groundTex(warm ? 'rockWarm' : 'grass', warm ? 7 : 3.4)),
      rock: lambert(bank.groundTex(warm ? 'rockWarm' : 'rock', 6)),
      hills: lambert(bank.groundTex(warm ? 'rockWarm' : 'grass', warm ? 14 : 9)),
      water: new THREE.MeshLambertMaterial({ color: 0x3aa6e0, transparent: true, opacity: 0.88 }),
      lip: lambert(bank.groundTex('dirt', 3.2), 0x8a6a52),
    };
  }

  dispose(): void {
    for (const m of Object.values(this.mats)) m.dispose();
    for (const m of this.spriteMat.values()) m.dispose();
    for (const g of this.spriteGeo.values()) g.dispose();
  }

  get waterMaterial(): THREE.MeshLambertMaterial {
    return this.mats.water;
  }

  private billboardMat(s: Sprite): THREE.Material {
    let m = this.spriteMat.get(s);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: this.bank.spriteTex(s), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
      this.spriteMat.set(s, m);
    }
    return m;
  }
  private billboardGeo(s: Sprite): THREE.PlaneGeometry {
    let g = this.spriteGeo.get(s);
    if (!g) {
      g = spriteGeometry(s);
      this.spriteGeo.set(s, g);
    }
    return g;
  }

  build(w: World, ci: number): ChunkVisual {
    const group = new THREE.Group();
    const i0 = ci * CHUNK_SAMPLES;
    const n = CHUNK_SAMPLES + 1;
    const x0 = i0 * DX;
    const x1 = (i0 + CHUNK_SAMPLES) * DX;
    const warm = this.style.warm;

    // ---- track band (skipping bridge decks)
    let runStart = -1;
    const flushTrack = (a: number, b: number) => {
      if (b - a < 1) return;
      const cols = b - a + 1;
      const geo = grid(
        cols,
        2,
        (c, r) => {
          const i = i0 + a + c;
          return [i * DX, w.sampleHeight(i), r === 0 ? Z_BACK : Z_FRONT];
        },
        (x, _y, z) => [x, z],
        (c) => SURF_COLOR[w.sampleSurface(i0 + a + c)],
      );
      const m = new THREE.Mesh(geo, this.mats.track);
      m.receiveShadow = true;
      group.add(m);
      // front lip: from the track edge down to the ground in front
      const lip = grid(
        cols,
        2,
        (c, r) => {
          const i = i0 + a + c;
          const x = i * DX;
          return r === 0 ? [x, w.sampleHeight(i), Z_FRONT] : [x, foreY(w, x, Z_FRONT + 0.05), Z_FRONT + 0.05];
        },
        (x, y) => [x, y],
        () => [1, 1, 1],
      );
      group.add(new THREE.Mesh(lip, this.mats.lip));
    };
    for (let k = 0; k < n; k++) {
      const onBridge = !!w.bridgeAt((i0 + k) * DX);
      if (!onBridge && runStart < 0) runStart = k;
      if ((onBridge || k === n - 1) && runStart >= 0) {
        flushTrack(runStart, onBridge ? k - 1 : k);
        runStart = -1;
      }
    }

    // ---- field behind the track (1 m columns), rock where it gets steep (gorges)
    const fCols = Math.round((x1 - x0) / 1) + 1;
    const fRows = 5;
    const fieldZ = (r: number) => Z_BACK + ((FIELD_END - Z_BACK) * r) / (fRows - 1);
    const steepAt = (x: number) => Math.abs(w.visualAt(x + 1) - w.visualAt(x)) > 0.9 || Math.abs(w.visualAt(x) - w.heightAt(x)) > 1.5;
    const field = grid(
      fCols,
      fRows,
      (c, r) => {
        const x = x0 + c;
        const z = fieldZ(r);
        return [x, r === 0 ? w.visualAt(x) + 0.02 : backFieldY(w, x, z), z];
      },
      (x, _y, z) => [x, z],
      (_c, r, x, _y, z) => {
        const n = fbm1(x / 9 + z * 0.13, 23, 3);
        const k = 1 - r * 0.03 + n * 0.18;
        return warm ? [k, k * 0.95, k * 0.9] : [k * (0.96 + n * 0.1), k, k * (0.9 - n * 0.08)];
      },
      (c) => steepAt(x0 + c),
      true,
    );
    const fm = new THREE.Mesh(field, [this.mats.ground, this.mats.rock]);
    fm.receiveShadow = true;
    group.add(fm);

    // ---- hills further back (2 m columns)
    const hCols = Math.round((x1 - x0) / 2) + 1;
    const hRows = 7;
    const hillZ = (r: number) => FIELD_END + ((HILLS_END - FIELD_END) * r) / (hRows - 1);
    const hills = grid(
      hCols,
      hRows,
      (c, r) => {
        const x = x0 + c * 2;
        const z = hillZ(r);
        return [x, r === 0 ? backFieldY(w, x, FIELD_END) : hillsY(w, x, z), z];
      },
      (x, _y, z) => [x, z],
      (_c, r, x, _y, z) => {
        const n = fbm1(x / 25 + z * 0.05, 29, 3);
        const k = 0.95 - r * 0.03 + n * 0.2;
        return warm ? [k, k * 0.92, k * 0.85] : [k * (0.85 + n * 0.12), k, k * 0.88];
      },
      undefined,
      true,
    );
    group.add(new THREE.Mesh(hills, this.mats.hills));

    // ---- ground in front of the track
    const gRows = 8;
    const fgZ = (r: number) => Z_FRONT + 0.05 + (FG_END - Z_FRONT - 0.05) * Math.pow(r / (gRows - 1), 1.8);
    const fore = grid(
      fCols,
      gRows,
      (c, r) => {
        const x = x0 + c;
        const z = fgZ(r);
        return [x, foreY(w, x, z), z];
      },
      (x, _y, z) => [x, z],
      (_c, r) => {
        const k = 0.92 - r * 0.08;
        return [k, k, k];
      },
      (c) => steepAt(x0 + c),
    );
    const gm = new THREE.Mesh(fore, [this.mats.ground, this.mats.rock]);
    gm.receiveShadow = true;
    group.add(gm);

    // ---- billboards: props from the generator + extra trees on the hills
    const inst = new Map<Sprite, THREE.Matrix4[]>();
    const add = (s: Sprite, x: number, y: number, z: number, scale: number, flip: boolean) => {
      let arr = inst.get(s);
      if (!arr) inst.set(s, (arr = []));
      const m = new THREE.Matrix4().makeScale(flip ? -scale : scale, scale, scale);
      m.setPosition(x, y, z);
      arr.push(m);
    };
    for (const p of w.props) {
      if (p.x < x0 || p.x >= x1) continue;
      const biome = w.biomeAt(p.x);
      const s = propSprite(p.kind, p.variant, biome);
      if (p.depth > 0) {
        const z = Z_BACK - 0.4 - p.depth * 9.5;
        add(s, p.x, backFieldY(w, p.x, z) - 0.05, z, p.scale, p.flip);
      } else if (p.depth < 0) {
        const z = Z_FRONT + 1 - p.depth * 6;
        add(s, p.x, foreY(w, p.x, z) - 0.05, z, p.scale * 0.9, p.flip);
      } else {
        add(s, p.x, w.heightAt(p.x) - 0.12, -0.3, 0.62, false);
      }
    }
    // field decor between the track and the hills
    for (let x = x0; x < x1; x += 1.6) {
      const biome = w.biomeAt(x);
      const h = hash1(Math.floor(x * 11), 41);
      if (h > 0.55 * this.style.treeDensity + 0.25) continue;
      const z = Z_BACK - 2 - hash1(Math.floor(x * 19), 43) * 9;
      const kinds: PropKind[] = biome === Biome.Canyon ? ['rock', 'boulder', 'bush'] : ['grass', 'flower', 'bush', 'rock', 'grass'];
      const kind = kinds[Math.floor(hash1(Math.floor(x * 23), 47) * kinds.length)];
      const s = propSprite(kind, Math.floor(h * 7), biome);
      add(s, x + h, backFieldY(w, x + h, z) - 0.05, z, 0.8 + h * 0.6, h > 0.3);
    }
    // hill trees: density by biome, scaled by the quality setting
    const density = this.style.treeDensity;
    for (let x = x0; x < x1; x += 2.2) {
      const biome = w.biomeAt(x);
      const per = biome === Biome.Forest ? 3 : biome === Biome.Canyon ? 0.6 : biome === Biome.Meadow ? 0.9 : 1.6;
      const count = Math.floor(per * density + hash1(Math.floor(x * 7), 3));
      for (let k = 0; k < count; k++) {
        const h = hash1(Math.floor(x * 13) + k * 101, 9);
        const z = FIELD_END - 1 - Math.pow(hash1(Math.floor(x * 17) + k * 71, 11), 0.8) * (FIELD_END - HILLS_END - 8);
        const xx = x + hash1(Math.floor(x * 5) + k, 2) * 2.2;
        let kind: PropKind = biome === Biome.Canyon ? (h > 0.5 ? 'cactus' : 'boulder') : h > 0.92 ? 'pineDead' : 'pine';
        if (biome === Biome.Meadow && h < 0.35) kind = 'bush';
        const s = propSprite(kind, Math.floor(h * 3), biome);
        add(s, xx, hillsY(w, xx, z) - 0.3, z, 0.8 + h * 0.8, h > 0.5);
      }
    }
    for (const [s, mats] of inst) {
      const im = new THREE.InstancedMesh(this.billboardGeo(s), this.billboardMat(s), mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      group.add(im);
    }
    return { index: ci, group };
  }
}
