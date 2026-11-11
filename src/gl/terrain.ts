import * as THREE from 'three';
import { fbm1, hash1, noise1 } from '../core/math';
import { propSprite, Sprite } from '../render/sprites';
import { assetDef, assetSprite } from '../catalog';
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
  /** Animated billboards (cheering supporters): base y in userData.y, phase in userData.p. */
  anims: THREE.Mesh[];
}

export interface TerrainStyle {
  /** Ground set: green (Alpes, Forêt), canyon (red rock), desert (sand dunes). */
  kind: 'green' | 'canyon' | 'desert' | 'city';
  treeDensity: number; // quality multiplier
  /** Weather: 0 dry, 1 damp, 2 wet (darker ground). */
  wet?: number;
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
/** Set by the builder: shape of the hills (dunes in the desert). */
let hillKind: TerrainStyle['kind'] = 'green';

export function hillsY(w: World, x: number, z: number): number {
  const t = Math.min(1, Math.max(0, (FIELD_END - z) / (FIELD_END - HILLS_END)));
  const base = smoothVisual(w, x);
  // Kept low and falling away in the distance so the far relief of the painted backdrop
  // (mountains, mesas) always stays visible above the hills.
  const swell = 0.5 + 1.6 * (fbm1(x / 55 + z * 0.01, 17, 3) * 0.5 + 0.5);
  const dune = hillKind === 'desert' ? Math.pow(Math.abs(Math.sin(x * 0.045 + z * 0.11 + Math.sin(z * 0.05) * 2)), 3) * 1.6 : 0;
  return base + 1.0 + (swell + dune) * Math.sin(Math.PI * Math.min(1, t * 1.25)) * (1 - t * 0.5) + Math.sin(x * 0.05 + z * 0.08) * t * 0.4 - t * 1.5;
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
  private snow = false;
  private lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f0e6, side: THREE.DoubleSide });
  private shadowGeo = new THREE.PlaneGeometry(1, 1);
  private haloMats = new Map<Sprite, THREE.Material>();
  private postGeo = new THREE.BoxGeometry(0.05, 0.8, 0.05);
  private postMat = new THREE.MeshLambertMaterial({ color: 0xf2efe6 });
  private tape: THREE.Material | null = null;
  private tapeMat(): THREE.Material {
    if (!this.tape) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 8;
      const g = c.getContext('2d')!;
      for (let k = 0; k < 4; k++) {
        g.fillStyle = k % 2 ? '#ffffff' : '#e02a1f';
        g.beginPath();
        g.moveTo(k * 16, 8);
        g.lineTo(k * 16 + 8, 0);
        g.lineTo(k * 16 + 24, 0);
        g.lineTo(k * 16 + 16, 8);
        g.fill();
      }
      g.fillStyle = '#e02a1f';
      g.beginPath();
      g.moveTo(-16 + 64, 8);
      g.lineTo(-8 + 64, 0);
      g.lineTo(8 + 64, 0);
      g.lineTo(0 + 64, 8);
      g.fill();
      const t = new THREE.CanvasTexture(c);
      t.wrapS = THREE.RepeatWrapping;
      t.repeat.set(1 / 0.8, 1);
      t.colorSpace = THREE.SRGBColorSpace;
      this.tape = new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide });
    }
    return this.tape;
  }
  private haloMat(s: Sprite): THREE.Material {
    let m = this.haloMats.get(s);
    if (!m) {
      m = new THREE.ShaderMaterial({
        uniforms: { map: { value: this.bank.spriteTex(s) } },
        transparent: true,
        depthWrite: false,
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { float a = texture2D(map, vUv).a; if (a < 0.25) discard; gl_FragColor = vec4(1.0, 0.95, 0.78, 0.92); }',
      });
      this.haloMats.set(s, m);
    }
    return m;
  }
  private detail: THREE.Material | null = null;
  /** Transparent decal of road details tiled along the track, per world style. */
  private detailMat(): THREE.Material {
    if (!this.detail) {
      const t = new THREE.CanvasTexture(roadDetail(this.style.kind, this.style.wet ?? 0));
      t.wrapS = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.repeat.set(1 / 9, 1);
      t.anisotropy = 4;
      const m = new THREE.MeshLambertMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      // uv: x in metres → repeat over 9 m; z across the band → 0..1
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = vec2(position.x / 9.0, (position.z - (' + Z_BACK.toFixed(2) + ')) / ' + (Z_FRONT - Z_BACK).toFixed(2) + ');');
      };
      this.detail = m;
    }
    return this.detail;
  }
  private shadowMaterial: THREE.Material | null = null;
  private shadowMat(): THREE.Material {
    if (!this.shadowMaterial) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
      grad.addColorStop(0, 'rgba(20,12,6,0.6)');
      grad.addColorStop(1, 'rgba(20,12,6,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      this.shadowMaterial = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
    }
    return this.shadowMaterial;
  }
  private snowMat: THREE.Material | null = null;
  private spriteMat = new Map<Sprite, THREE.Material>();

  constructor(
    private bank: TextureBank,
    private style: TerrainStyle,
  ) {
    const warm = style.kind !== 'green';
    const desert = style.kind === 'desert';
    hillKind = style.kind;
    const lambert = (map: THREE.Texture, color = 0xffffff) => new THREE.MeshLambertMaterial({ map, vertexColors: true, color });
    this.mats = {
      // canyon: a darker, cooler packed-earth track so it stands out from the red rock around it
      track: lambert(bank.groundTex(desert ? 'sand' : 'dirt', desert ? 2.6 : 3.2), desert ? 0xf4dcc0 : warm ? 0x8f8580 : 0xffffff),
      ground: lambert(bank.groundTex(desert ? 'sand' : warm ? 'rockWarm' : 'grass', desert ? 4 : warm ? 7 : 3.4)),
      rock: lambert(bank.groundTex(warm ? 'rockWarm' : 'rock', 6)),
      hills: lambert(bank.groundTex(desert ? 'sand' : warm ? 'rockWarm' : 'grass', desert ? 9 : warm ? 14 : 9)),
      water: new THREE.MeshLambertMaterial({ color: 0x3aa6e0, transparent: true, opacity: 0.88 }),
      lip: lambert(bank.groundTex('dirt', 3.2), style.kind === 'canyon' ? 0x4e3a30 : 0x8a6a52),
    };
    // San Francisco: asphalt road with a pale pavement field and city lawns behind
    if (style.kind === 'city') {
      this.mats.track = lambert(bank.groundTex('asphalt', 4), 0xffffff);
      this.mats.ground = lambert(bank.groundTex('stone', 3), 0xd8d6d2);
      this.mats.hills = lambert(bank.groundTex('grass', 9), 0xc8dcb8);
      this.mats.lip = lambert(bank.groundTex('stone', 2), 0xb8b6b2);
    }
    // snow: a thin white cover on the ground and hills (the track keeps a cleared line)
    this.snow = style.wet === 2;
    if (this.snow) {
      const sn = lambert(bank.groundTex('snow', 5));
      this.mats.ground = sn;
      this.mats.hills = lambert(bank.groundTex('snow', 11));
      (this.mats.rock as THREE.MeshLambertMaterial).color.setRGB(1.1, 1.12, 1.18);
      this.snowMat = lambert(bank.groundTex('snow', 3.2));
    }
    // wet ground looks darker
    const wk = [1, 0.76, 1][style.wet ?? 0];
    if (wk < 1)
      for (const m of [this.mats.track, this.mats.ground, this.mats.hills, this.mats.lip, this.mats.rock]) (m as THREE.MeshLambertMaterial).color.multiplyScalar(wk);
  }

  dispose(): void {
    for (const m of Object.values(this.mats)) m.dispose();
    this.shadowMaterial?.dispose();
    this.detail?.dispose();
    this.tape?.dispose();
    this.postGeo.dispose();
    this.postMat.dispose();
    for (const m of this.haloMats.values()) m.dispose();
    this.lineMat.dispose();
    this.shadowGeo.dispose();
    for (const m of this.spriteMat.values()) m.dispose();
    for (const g of this.spriteGeo.values()) g.dispose();
  }

  get waterMaterial(): THREE.MeshLambertMaterial {
    return this.mats.water;
  }

  private billboardMat(s: Sprite): THREE.Material {
    let m = this.spriteMat.get(s);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: this.bank.spriteTex(s), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, color: new THREE.Color().setScalar([1, 0.78, 0.96][this.style.wet ?? 0]) });
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
    const warm = this.style.kind !== 'green';
    hillKind = this.style.kind;

    // trial zones of this chunk (between the start and end gates)
    const zones: [number, number][] = [];
    for (const m of w.marks)
      if (m.kind === 'sectionStart') {
        const e = w.marks.find((q) => q.kind === 'sectionEnd' && q.n === m.n);
        const z1 = e ? e.x1 : m.x0 + 60;
        if (z1 >= x0 && m.x0 <= x1) zones.push([m.x0 - 1, z1 + 1]);
      }

    // ---- track band (skipping bridge decks)
    let runStart = -1;
    const flushTrack = (a: number, b: number) => {
      if (b - a < 1) return;
      const cols = b - a + 1;
      // 5 rows across the band: worn lane where the bikes ride, patches of colour along the
      // road, trial zones in a lighter packed earth so their obstacles stand out
      const TZ = [Z_BACK, -0.62, -0.25, 0.12, Z_FRONT];
      const geo = grid(
        cols,
        TZ.length,
        (c, r) => {
          const i = i0 + a + c;
          return [i * DX, w.sampleVisual(i), TZ[r]];
        },
        (x, _y, z) => [x, z],
        (c, r, x) => {
          const [cr, cg, cb] = SURF_COLOR[w.sampleSurface(i0 + a + c)];
          const patch = 0.88 + 0.24 * fbm1(x / 6.5 + r * 0.31, 71, 3);
          const rut = r === 2 ? 0.86 : r === 0 || r === 4 ? 1.06 : 1;
          const zone = zones.some(([z0, z1]) => x >= z0 && x <= z1);
          const k = patch * rut;
          return zone ? [cr * k * 1.22, cg * k * 1.12, cb * k * 0.95] : [cr * k, cg * k, cb * k];
        },
      );
      // detail decal on top (ruts, pebbles, cracks, leaves…)
      if (!this.snow) {
        const dm = new THREE.Mesh(geo, this.detailMat());
        dm.renderOrder = 1;
        dm.userData.shared = true;
        group.add(dm);
      }
      if (this.snow) {
        // snow-covered road: white across the band, the bikes' passage left two slushy brown
        // ruts and a trampled grey line between them
        const zs = [Z_BACK, -0.5, -0.4, -0.33, -0.27, -0.17, -0.1, -0.02, 0.25, Z_FRONT];
        const W: [number, number, number] = [1, 1, 1];
        const Wt: [number, number, number] = [0.93, 0.93, 0.95];
        const G: [number, number, number] = [0.82, 0.82, 0.86];
        const B: [number, number, number] = [0.6, 0.5, 0.42];
        const cols3 = [W, Wt, B, B, G, B, B, Wt, W, W];
        const g2 = grid(
          cols,
          zs.length,
          (c, r) => {
            const i = i0 + a + c;
            return [i * DX, w.sampleVisual(i) + (r >= 2 && r <= 6 ? 0 : 0.02), zs[r]];
          },
          (x, _y, z) => [x, z],
          (c, r) => {
            const k = 0.94 + 0.06 * noise1((i0 + a + c) * 0.37, r);
            const [cr, cg, cb] = cols3[r];
            return [cr * k, cg * k, cb * k];
          },
        );
        const mm = new THREE.Mesh(g2, this.snowMat!);
        mm.receiveShadow = true;
        group.add(mm);
        geo.dispose();
      } else {
        const m = new THREE.Mesh(geo, this.mats.track);
        m.receiveShadow = true;
        group.add(m);
      }
      // city: white dashed lane line and a kerb line on the road
      if (this.style.kind === 'city') {
        const pos: number[] = [];
        const xs = (i0 + a) * DX;
        const xe = (i0 + b) * DX;
        for (let x = Math.ceil(xs / 3) * 3; x + 1.5 <= xe; x += 3) {
          const ya = w.sampleVisual(Math.round(x / DX)) + 0.012;
          const yb = w.sampleVisual(Math.round((x + 1.5) / DX)) + 0.012;
          pos.push(x, ya, -0.95, x + 1.5, yb, -0.95, x, ya, -0.85, x + 1.5, yb, -0.95, x + 1.5, yb, -0.85, x, ya, -0.85);
        }
        if (pos.length) {
          const lg = new THREE.BufferGeometry();
          lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          group.add(new THREE.Mesh(lg, this.lineMat));
        }
      }
      // front lip: from the track edge down to the ground in front
      const lip = grid(
        cols,
        2,
        (c, r) => {
          const i = i0 + a + c;
          const x = i * DX;
          return r === 0 ? [x, w.sampleVisual(i), Z_FRONT] : [x, foreY(w, x, Z_FRONT + 0.05), Z_FRONT + 0.05];
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

    // ---- trial zones: red-and-white tape on stakes along the back of the track
    for (const [z0, z1] of zones) {
      const xa = Math.max(z0, x0);
      const xb = Math.min(z1, x1);
      if (xb - xa < 0.5) continue;
      const pos: number[] = [];
      const uvs: number[] = [];
      const zt = Z_BACK - 0.15;
      for (let x = xa; x < xb; x += 0.5) {
        const xe = Math.min(xb, x + 0.5);
        const ya = w.visualAt(x) + 0.62;
        const yb = w.visualAt(xe) + 0.62;
        pos.push(x, ya, zt, xe, yb, zt, x, ya + 0.12, zt, xe, yb, zt, xe, yb + 0.12, zt, x, ya + 0.12, zt);
        uvs.push(x, 0, xe, 0, x, 1, xe, 0, xe, 1, x, 1);
      }
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      tg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      group.add(new THREE.Mesh(tg, this.tapeMat()));
      for (let x = Math.ceil(xa / 3) * 3; x <= xb; x += 3) {
        const post = new THREE.Mesh(this.postGeo, this.postMat);
        post.position.set(x, w.visualAt(x) + 0.4, zt - 0.02);
        post.userData.shared = true;
        group.add(post);
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
    const anims: THREE.Mesh[] = [];
    for (const p of w.props) {
      if (p.x < x0 || p.x >= x1) continue;
      const biome = w.biomeAt(p.x);
      const isAsset = p.kind === 'asset';
      const s = isAsset ? assetSprite(p.asset!) : propSprite(p.kind as PropKind, p.variant, biome);
      if (isAsset && p.depth > 0 && p.depth < 0.5 && assetDef(p.asset!)?.anim) {
        // supporters jump and cheer: own mesh, moved every frame by the renderer
        const z = Z_BACK - 0.4 - p.depth * 9.5;
        const m = new THREE.Mesh(this.billboardGeo(s), this.billboardMat(s));
        const y = backFieldY(w, p.x, z) - 0.05;
        m.position.set(p.x, y, z);
        m.scale.setScalar(p.scale);
        m.userData = { y, p: (p.x * 1.7) % 6.28, shared: true };
        group.add(m);
        anims.push(m);
        continue;
      }
      if (p.depth > 0) {
        const z = Z_BACK - 0.4 - p.depth * 9.5;
        // tall trees just behind the track are kept moderate so the far relief stays visible
        const tall = p.kind === 'pine' || p.kind === 'pineDead' || p.kind === 'palm' || (isAsset && s.h > 5.5 && p.depth < 0.5);
        add(s, p.x, backFieldY(w, p.x, z) - 0.05, z, p.scale * (tall ? 0.62 : 1), p.flip);
      } else if (p.depth < 0) {
        const z = Z_FRONT + 1 - p.depth * 6;
        add(s, p.x, foreY(w, p.x, z) - 0.05, z, p.scale * 0.9, p.flip);
      } else if (isAsset) {
        // physical obstacle: exact size, base on the ground it was built on, just behind the bike
        add(s, p.x, p.baseY ?? w.heightAt(p.x), -0.5, 1, false);
        // light halo around it: an obstacle of the course, not a piece of scenery
        const halo = new THREE.Mesh(this.billboardGeo(s), this.haloMat(s));
        halo.position.set(p.x, (p.baseY ?? w.heightAt(p.x)) - 0.02, -0.56);
        halo.scale.set(1 + 0.16 / Math.max(0.5, s.w), 1 + 0.14 / Math.max(0.5, s.h), 1);
        halo.userData.shared = true;
        group.add(halo);
        // dark contact shadow on the track: obstacles read as solid objects, not scenery
        const sh = new THREE.Mesh(this.shadowGeo, this.shadowMat());
        sh.rotation.x = -Math.PI / 2;
        sh.scale.set(s.w * 0.95, 1.5, 1);
        sh.position.set(p.x + (s.w / 2 - s.ax) * 0, (p.baseY ?? w.heightAt(p.x)) + 0.025, -0.35);
        sh.renderOrder = 1;
        sh.userData.shared = true;
        group.add(sh);
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
      const kinds: PropKind[] =
        biome === Biome.Canyon ? ['rock', 'boulder', 'bush'] : biome === Biome.Desert ? ['shrub', 'rock', 'shrub', 'tumbleweed', 'grass'] : ['grass', 'flower', 'bush', 'rock', 'grass'];
      const kind = kinds[Math.floor(hash1(Math.floor(x * 23), 47) * kinds.length)];
      const s = propSprite(kind, Math.floor(h * 7), biome);
      add(s, x + h, backFieldY(w, x + h, z) - 0.05, z, 0.8 + h * 0.6, h > 0.3);
    }
    // hill trees: density by biome, scaled by the quality setting
    const density = this.style.treeDensity;
    for (let x = x0; x < x1; x += 2.2) {
      const biome = w.biomeAt(x);
      const per = biome === Biome.Forest ? 3 : biome === Biome.Canyon ? 0.6 : biome === Biome.Desert ? 0.5 : biome === Biome.Meadow ? 0.9 : biome === Biome.City ? 1.1 : 1.6;
      const count = Math.floor(per * density + hash1(Math.floor(x * 7), 3));
      for (let k = 0; k < count; k++) {
        const h = hash1(Math.floor(x * 13) + k * 101, 9);
        const z = FIELD_END - 1 - Math.pow(hash1(Math.floor(x * 17) + k * 71, 11), 0.8) * (FIELD_END - HILLS_END - 8);
        const xx = x + hash1(Math.floor(x * 5) + k, 2) * 2.2;
        let kind: PropKind = biome === Biome.Canyon ? (h > 0.5 ? 'cactus' : 'boulder') : h > 0.92 ? 'pineDead' : 'pine';
        if (biome === Biome.Meadow && h < 0.35) kind = 'bush';
        if (biome === Biome.Desert) kind = h > 0.75 ? 'cactus' : h > 0.55 ? 'sandstone' : h > 0.45 ? 'deadTree' : 'shrub';
        // San Francisco: the hills are covered with little houses
        const city = this.style.kind === 'city';
        const s = city ? assetSprite(h > 0.25 ? `sf.hill.${Math.floor(h * 8) % 8}.${Math.floor(h * 31) % 3}.${Math.floor(h * 57) % 4}` : `sf.tree.${Math.floor(h * 13) % 5}.${Math.floor(h * 23) % 5}.0`) : propSprite(kind, Math.floor(h * 3), biome);
        if (city) {
          const farC = 0.75 - Math.min(1, (FIELD_END - z) / (FIELD_END - HILLS_END)) * 0.35;
          add(s, xx, hillsY(w, xx, z) - 0.3, z, (h > 0.25 ? 0.55 : 0.6) * farC, false);
          continue;
        }
        // far trees are smaller so their tops stay under the backdrop's horizon
        const farK = 0.8 - Math.min(1, (FIELD_END - z) / (FIELD_END - HILLS_END)) * 0.4;
        add(s, xx, hillsY(w, xx, z) - 0.3, z, (0.65 + h * 0.5) * farK, h > 0.5);
      }
    }
    for (const [s, mats] of inst) {
      const im = new THREE.InstancedMesh(this.billboardGeo(s), this.billboardMat(s), mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      group.add(im);
    }
    return { index: ci, group, anims };
  }
}

/**
 * Road details painted on a transparent strip (9 m × the track width), tiled along the track:
 * tyre ruts in the riding lane, stones, cracks, tufts, leaves, tar patches… per world.
 */
function roadDetail(kind: TerrainStyle['kind'], wet: number): HTMLCanvasElement {
  const W = 1152;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  let seed = kind.length * 97 + wet * 13 + 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const laneY = ((-0.25 - Z_BACK) / (Z_FRONT - Z_BACK)) * H;
  const dark = kind === 'city' ? 'rgba(20,20,24,' : kind === 'desert' ? 'rgba(120,80,40,' : 'rgba(60,38,20,';
  const light = kind === 'city' ? 'rgba(210,210,215,' : 'rgba(255,240,210,';
  // tyre ruts (two wavy lines in the lane)
  for (const dy of [-9, 9]) {
    g.beginPath();
    for (let x = 0; x <= W; x += 8) g.lineTo(x, laneY + dy + Math.sin(x * 0.011 + dy) * 3);
    g.strokeStyle = dark + (kind === 'city' ? '0.18)' : '0.28)');
    g.lineWidth = 7;
    g.stroke();
  }
  // tread marks in the ruts
  for (let x = 0; x < W; x += 6) {
    g.fillStyle = dark + '0.18)';
    g.fillRect(x, laneY - 12 + (x % 12 ? 0 : 1), 3, 5);
    g.fillRect(x + 2, laneY + 7, 3, 5);
  }
  if (kind === 'city') {
    // cracks, tar patches, a manhole
    for (let k = 0; k < 9; k++) {
      let x = rnd() * W;
      let y = rnd() * H;
      g.beginPath();
      g.moveTo(x, y);
      for (let q = 0; q < 6; q++) g.lineTo((x += (rnd() - 0.3) * 30), (y += (rnd() - 0.5) * 18));
      g.strokeStyle = 'rgba(15,15,18,0.45)';
      g.lineWidth = 1.6;
      g.stroke();
    }
    for (let k = 0; k < 4; k++) {
      g.fillStyle = 'rgba(25,25,30,0.35)';
      g.fillRect(rnd() * W, rnd() * H * 0.8, 60 + rnd() * 90, 20 + rnd() * 30);
    }
    g.fillStyle = 'rgba(40,40,46,0.8)';
    g.beginPath();
    g.ellipse(W * 0.62, H * 0.75, 26, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(150,150,155,0.5)';
    g.stroke();
  } else {
    // stones and gravel
    for (let k = 0; k < 260; k++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const r = rnd() < 0.08 ? 3 + rnd() * 4 : 0.8 + rnd() * 1.8;
      g.fillStyle = rnd() < 0.5 ? dark + (0.25 + rnd() * 0.3) + ')' : light + (0.25 + rnd() * 0.35) + ')';
      g.beginPath();
      g.ellipse(x, y, r * 1.3, r, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // tufts at the edges (green worlds), dry twigs elsewhere
    for (let k = 0; k < 40; k++) {
      const x = rnd() * W;
      const y = rnd() < 0.5 ? rnd() * 18 : H - rnd() * 18;
      g.strokeStyle = kind === 'green' ? `rgba(70,${120 + rnd() * 60},40,0.7)` : 'rgba(120,90,50,0.5)';
      g.lineWidth = 1.5;
      for (let q = 0; q < 5; q++) {
        g.beginPath();
        g.moveTo(x + q * 2, y);
        g.lineTo(x + q * 2 + (rnd() - 0.5) * 6, y - 6 - rnd() * 8);
        g.stroke();
      }
    }
    if (kind === 'green')
      for (let k = 0; k < 30; k++) {
        g.fillStyle = ['rgba(200,120,40,0.55)', 'rgba(220,180,60,0.5)', 'rgba(160,80,30,0.5)'][k % 3];
        g.beginPath();
        g.ellipse(rnd() * W, rnd() * H, 4, 2.2, rnd() * 3, 0, Math.PI * 2);
        g.fill();
      }
  }
  // wet worlds: shiny puddles
  if (wet === 1)
    for (let k = 0; k < 6; k++) {
      const x = rnd() * W;
      const y = laneY + (rnd() - 0.5) * 40;
      const gr = g.createRadialGradient(x, y, 2, x, y, 40);
      gr.addColorStop(0, 'rgba(180,200,220,0.55)');
      gr.addColorStop(1, 'rgba(180,200,220,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(x, y, 46, 12, 0, 0, Math.PI * 2);
      g.fill();
    }
  // seamless: copy the first 60 px faded onto the end
  const strip = g.getImageData(0, 0, 60, H);
  const end = g.getImageData(W - 60, 0, 60, H);
  for (let x = 0; x < 60; x++)
    for (let y = 0; y < H; y++) {
      const i = (y * 60 + x) * 4;
      const t = x / 60;
      for (let k = 0; k < 4; k++) end.data[i + k] = end.data[i + k] * (1 - t) + strip.data[i + k] * t;
    }
  g.putImageData(end, W - 60, 0);
  return c;
}
