import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Game } from '../game';
import type { Bike } from '../physics/bike';
import type { Bike3D } from '../gl/bike3d';
import { clamp } from '../core/math';
import { loopAt, MX_CIRCUITS, MX_ENTRY, MX_EXIT, MX_FEATURES, MX_FEATURES_CRUISE, MX_HALF_WIDTH, MX_LEN, MX_STRAIGHT, mxLatScale, mxPose } from './track';
import type { MxWorld } from './track';
import { KIT_MODULES } from './kitData';
import { assetsFor } from '../catalog';
import type { AssetDef, AssetGroup } from '../catalog';

/**
 * v2.26 — the motocross track in 3D: the loop (dirt ribbon with its jumps, whoops and banked
 * turns), the entry and exit lanes, the modules of the "Low-Poly Dirt Park Modular Kit"
 * (public/low-poly_dirt_park_modular_kit.glb, by FlunkedPunk) set around it, a third-person
 * chase camera and the dust of the rear wheel.
 *
 * The bikes are the game's own 3D bikes: each one is hung in a "carrier" whose local frame is
 * the 2D frame of the physics (x along the track, y up), so everything the 2D simulation does
 * (suspension, pitch, wheels, rider) shows as it is; the carrier is then placed on the track,
 * turned to the bike's heading, and the bike leaned in it.
 */

const KIT_URL = `${(import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'}low-poly_dirt_park_modular_kit.glb`;
const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

interface Module {
  group: THREE.Group;
  cx: number;
  cz: number;
}

/** Height of the banking on the outside of a turn (m) at lateral offset n. */
export function bankAt(k: number, n: number): number {
  const B = clamp((Math.abs(k) - 0.012) * 45, 0, 1) * 1.5;
  const out = (-Math.sign(k) * n) / MX_HALF_WIDTH; // > 0 on the outside of the turn
  return out > 0 ? B * Math.pow(Math.min(1.4, out), 1.6) : 0;
}

/**
 * v2.37: each circuit takes the look of one world: its ground and track textures, its painted
 * panorama, its decor sprites. San Francisco: asphalt all around, street furniture near the
 * track, houses only far away.
 */
interface Theme {
  pano: string;
  bg: number;
  fog: number;
  hemiGround: number;
  ground: { tex: string; tint: number; rep: number };
  track: { tex: string; tint: number };
  /** Groups of the sprites planted around (trees, bushes) and the far scenery (structures). */
  groups: AssetGroup[];
  far: AssetGroup[];
  /** Street furniture beside the track (city). */
  trackside: boolean;
  /** Share of the planting spots kept (1 = full forest). */
  density: number;
}
const THEMES: Record<MxWorld, Theme> = {
  foret: { pano: 'foret.0', bg: 0x8fc6f4, fog: 0xcfe6f6, hemiGround: 0x7a6a4a, ground: { tex: 'tex-dirt', tint: 0xd8c8b0, rep: 180 }, track: { tex: 'tex-dirt', tint: 0x9a7a62 }, groups: ['foret', 'green'], far: [], trackside: false, density: 1 },
  alpes: { pano: 'alpes.0', bg: 0x7fb4ee, fog: 0xd4e4f2, hemiGround: 0x6a7a58, ground: { tex: 'tex-grass', tint: 0xc4d4b0, rep: 150 }, track: { tex: 'tex-dirt', tint: 0x8a7664 }, groups: ['alpes', 'green'], far: ['alpes'], trackside: false, density: 0.8 },
  canyon: { pano: 'canyon.p2', bg: 0x6aa6ea, fog: 0xe8d2bc, hemiGround: 0x9a5a3a, ground: { tex: 'tex-rock-warm', tint: 0xe6b894, rep: 120 }, track: { tex: 'tex-sand', tint: 0xc0704a }, groups: ['canyon'], far: ['canyon'], trackside: false, density: 0.45 },
  desert: { pano: 'desert.p1', bg: 0x74aef0, fog: 0xf0dfc4, hemiGround: 0xb08a5a, ground: { tex: 'tex-sand', tint: 0xf0d6a4, rep: 140 }, track: { tex: 'tex-sand', tint: 0xb88a56 }, groups: ['desert'], far: ['desert'], trackside: false, density: 0.35 },
  sf: { pano: 'sf.p2', bg: 0x6aa6ea, fog: 0xdfe5ec, hemiGround: 0x6a6c70, ground: { tex: 'asphalt', tint: 0xffffff, rep: 130 }, track: { tex: 'tex-dirt', tint: 0x86705e }, groups: ['sf'], far: ['sf'], trackside: true, density: 0.22 },
};

/** A procedural asphalt (no photo needed): dark grey with grain, patches and the odd crack. */
function asphaltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4b4d52';
  g.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 70; i++) {
    const v = 60 + Math.floor(rnd() * 26);
    g.fillStyle = `rgba(${v},${v},${v + 4},0.28)`;
    g.fillRect(rnd() * 256, rnd() * 256, 20 + rnd() * 60, 14 + rnd() * 40);
  }
  for (let i = 0; i < 3200; i++) {
    const v = 40 + Math.floor(rnd() * 90);
    g.fillStyle = `rgba(${v},${v},${v},0.55)`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  g.strokeStyle = 'rgba(25,25,28,0.7)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    let x = rnd() * 256;
    let y = rnd() * 256;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) g.lineTo((x += (rnd() - 0.4) * 30), (y += (rnd() - 0.5) * 30));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class MxScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.3, 900);
  private sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
  private dirt = new THREE.MeshLambertMaterial({ color: 0x9a6a44, side: THREE.DoubleSide });
  private grass = new THREE.MeshLambertMaterial({ color: 0xb09070 });
  private carriers = new Map<Bike3D, THREE.Group>();
  private coins: THREE.InstancedMesh;
  private dust: THREE.Points;
  private dustN = 560;
  private dustP = new Float32Array(this.dustN * 3);
  private dustV = new Float32Array(this.dustN * 3);
  private dustL = new Float32Array(this.dustN); // life left (s)
  private dustA = new Float32Array(this.dustN);
  /** How thick each puff is (it grows with the scuffing of the tyre). */
  private dustS = new Float32Array(this.dustN);
  private dustI = 0;
  private dustAcc = 0;
  // camera state
  private camPos = new THREE.Vector3();
  private camYaw = 0;
  private camY = 0;
  private look = new THREE.Vector3();
  private fresh = true;
  private time = 0;

  private theme: Theme;
  /** Middle of the circuit (the ground and the panorama are centred on it). */
  private cx = 0;
  private cz = 80;

  constructor(readonly circuit = 0) {
    const s = this.scene;
    const th = (this.theme = THEMES[MX_CIRCUITS[circuit].world]);
    {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let i = 0; i < MX_LEN; i += 6) {
        const p = loopAt(i);
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
      }
      this.cx = (x0 + x1) / 2;
      this.cz = (z0 + z1) / 2;
    }
    s.background = new THREE.Color(th.bg);
    s.fog = new THREE.Fog(th.fog, 140, 520);
    s.add(new THREE.HemisphereLight(0xdcefff, th.hemiGround, 1.25));
    this.sun.position.set(-40, 70, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -34;
    sc.right = sc.top = 34;
    sc.near = 1;
    sc.far = 220;
    this.sun.shadow.bias = -0.0006;
    s.add(this.sun, this.sun.target);
    // ground: the world's own texture (asphalt in the city), the track in the world's earth
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500).rotateX(-Math.PI / 2), this.grass);
    ground.position.set(this.cx, -0.06, this.cz);
    ground.receiveShadow = true;
    s.add(ground);
    const loader = new THREE.TextureLoader();
    if (th.ground.tex === 'asphalt') {
      this.useMap(this.grass, asphaltTexture(), th.ground.rep);
      this.grass.color.set(th.ground.tint);
    } else
      loader.load(`${BASE}res/${th.ground.tex}.webp`, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        this.useMap(this.grass, t, th.ground.rep);
        this.grass.color.set(th.ground.tint);
      });
    loader.load(`${BASE}res/${th.track.tex}.webp`, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      this.useMap(this.dirt, t, 1);
      this.dirt.color.set(th.track.tint);
    });
    loader.load(`${BASE}res/pano/${th.pano}.webp`, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.MirroredRepeatWrapping;
      t.repeat.set(4, 1);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(600, 600, 300, 48, 1, true), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false }));
      ring.position.set(this.cx, 150 - 300 * 0.3, this.cz);
      s.add(ring);
    });
    this.plantDecor();
    this.buildTrack();
    this.buildMarkers();
    // coins
    this.coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 18).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 0.8, roughness: 0.3, emissive: 0x5a3a00 }), 60);
    this.coins.frustumCulled = false;
    s.add(this.coins);
    // dust
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dustP, 3));
    dg.setAttribute('alpha', new THREE.BufferAttribute(this.dustA, 1));
    this.dust = new THREE.Points(
      dg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { scale: { value: 600 } },
        vertexShader: 'attribute float alpha; varying float vA; uniform float scale; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min(scale * (0.35 + (1.0 - alpha) * 1.1) / -mv.z, 90.0); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA * 0.38; gl_FragColor = vec4(0.80, 0.63, 0.44, a); }',
      }),
    );
    this.dust.frustumCulled = false;
    s.add(this.dust);
    this.loadKit();
  }

  // ---------------------------------------------------------------- track

  private ribbon(samples: { x: number; z: number; th: number; k: number; h: number }[], closed: boolean): THREE.Mesh {
    const HW = MX_HALF_WIDTH;
    const lat = [-HW - 2.2, -HW - 0.4, -HW, -HW * 0.5, 0, HW * 0.5, HW, HW + 0.4, HW + 2.2];
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const m = samples.length;
    samples.forEach((p, i) => {
      const nx = -Math.sin(p.th);
      const nz = Math.cos(p.th);
      lat.forEach((n, j) => {
        const edge = j === 0 || j === lat.length - 1;
        const y = edge ? -0.05 : p.h + bankAt(p.k, clamp(n, -HW, HW)) + (j === 1 || j === lat.length - 2 ? -0.02 : 0.02);
        pos.push(p.x + nx * n, y, p.z + nz * n);
        uv.push(n / 5, i / 5);
      });
    });
    const L = lat.length;
    const rows = closed ? m : m - 1;
    for (let i = 0; i < rows; i++) {
      const a = i * L;
      const b = ((i + 1) % m) * L;
      for (let j = 0; j < L - 1; j++) idx.push(a + j, a + j + 1, b + j, a + j + 1, b + j + 1, b + j);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, this.dirt);
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildTrack(): void {
    const loop = [];
    for (let s = 0; s < MX_LEN; s++) loop.push({ ...loopAt(s), h: 0 }); // flat: the jumps are the kit's pieces
    this.scene.add(this.ribbon(loop, true));
    // entry and exit lanes (cruising): straight, flat, a hair above the grass
    const out = MX_ENTRY + MX_LEN + MX_STRAIGHT[1] - MX_STRAIGHT[0];
    for (const [from, to] of [[-40, MX_ENTRY + 2], [out - 2, out + MX_EXIT + 40]] as [number, number][]) {
      const lane = [];
      for (let u = from; u <= to; u += 2) {
        const p = mxPose(u, true);
        lane.push({ x: p.x, z: p.z, th: p.th, k: 0, h: 0 });
      }
      const mesh = this.ribbon(lane, false);
      mesh.position.y = -0.015;
      this.scene.add(mesh);
    }
  }

  /** Edge posts, start arch, a few banners: what makes it read as a race track. */
  private buildMarkers(): void {
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.ceil(MX_LEN / 8) * 2);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    let i = 0;
    for (let s = 0; s < MX_LEN; s += 8) {
      const p = loopAt(s);
      const h = 0;
      for (const side of [-1, 1]) {
        const n = side * (MX_HALF_WIDTH + 0.5);
        m.makeTranslation(p.x - Math.sin(p.th) * n, h + bankAt(p.k, side * MX_HALF_WIDTH) + 0.3, p.z + Math.cos(p.th) * n);
        posts.setMatrixAt(i, m);
        posts.setColorAt(i, col.set((s / 8) % 2 ? 0xe8392f : 0xf4f4f4));
        i++;
      }
    }
    posts.count = i;
    posts.castShadow = true;
    this.scene.add(posts);
    // start / finish arch across the main straight
    const p = loopAt(MX_STRAIGHT[0] + 5);
    const arch = new THREE.Group();
    const red = new THREE.MeshLambertMaterial({ color: 0xe8392f });
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.5), red);
      leg.position.set(0, 2.5, side * (MX_HALF_WIDTH + 1));
      arch.add(leg);
    }
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 64;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#14161c';
    c.fillRect(0, 0, 512, 64);
    c.fillStyle = '#ffffff';
    for (let x = 0; x < 512; x += 32) for (let y = 0; y < 64; y += 32) if ((x / 32 + y / 32) % 2) c.fillRect(x, y, 32, 32);
    c.font = 'italic 900 44px Arial Black, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 8;
    c.strokeStyle = '#14161c';
    c.strokeText('MOTOXPLOSION', 256, 34);
    c.fillStyle = '#ff7a1a';
    c.fillText('MOTOXPLOSION', 256, 34);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.3, MX_HALF_WIDTH * 2 + 2.5), [red, red, red, red, red, red].map((x, k) => (k < 2 ? new THREE.MeshLambertMaterial({ map: tex }) : x)));
    beam.position.y = 5.2;
    arch.add(beam);
    arch.position.set(p.x, 0, p.z);
    arch.rotation.y = -p.th;
    arch.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : null));
    this.scene.add(arch);
  }

  // ---------------------------------------------------------------- the kit

  /**
   * The kit is one sheet of pieces merged by material. Cut it back into modules (connected
   * pieces of each mesh, then pieces of all materials that touch), and stand every module
   * around the track: the closest free spot to the racing line for each, biggest first.
   */
  private loadKit(): void {
    new GLTFLoader().load(KIT_URL, (gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const mats = new Map<string, THREE.Material>();
      type Piece = { mat: string; pos: Float32Array; uv: Float32Array | null; box: THREE.Box3 };
      const pieces: Piece[] = [];
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const src = mesh.material as THREE.MeshStandardMaterial;
        const name = src.name;
        if (name === 'Grass') return;
        if (!mats.has(name)) {
          const lm = new THREE.MeshLambertMaterial({ map: src.map ?? null, color: src.map ? 0xffffff : 0xb0b0b0, side: THREE.DoubleSide });
          mats.set(name, lm);
        }
        const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        g.applyMatrix4(mesh.matrixWorld);
        const P = g.attributes.position.array as Float32Array;
        const U = g.attributes.uv ? (g.attributes.uv.array as Float32Array) : null;
        // connected components: triangles sharing a (welded) vertex
        const tri = P.length / 9;
        const parent = new Int32Array(tri).map((_, i) => i);
        const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
        const seen = new Map<string, number>();
        for (let t = 0; t < tri; t++)
          for (let v = 0; v < 3; v++) {
            const k = `${Math.round(P[t * 9 + v * 3] * 8)},${Math.round(P[t * 9 + v * 3 + 1] * 8)},${Math.round(P[t * 9 + v * 3 + 2] * 8)}`;
            const other = seen.get(k);
            if (other === undefined) seen.set(k, t);
            else parent[find(t)] = find(other);
          }
        const groups = new Map<number, number[]>();
        for (let t = 0; t < tri; t++) {
          const r = find(t);
          const list = groups.get(r) ?? [];
          list.push(t);
          groups.set(r, list);
        }
        for (const list of groups.values()) {
          const pos = new Float32Array(list.length * 9);
          const uv = U ? new Float32Array(list.length * 6) : null;
          const box = new THREE.Box3();
          const v3 = new THREE.Vector3();
          list.forEach((t, i) => {
            pos.set(P.subarray(t * 9, t * 9 + 9), i * 9);
            if (uv && U) uv.set(U.subarray(t * 6, t * 6 + 6), i * 6);
            for (let v = 0; v < 3; v++) box.expandByPoint(v3.fromArray(P, t * 9 + v * 3));
          });
          pieces.push({ mat: name, pos, uv, box });
        }
        g.dispose();
      });
      // modules: pieces whose footprints touch
      const par = pieces.map((_, i) => i);
      const find = (a: number): number => (par[a] === a ? a : (par[a] = find(par[a])));
      const gap = 0.35;
      for (let i = 0; i < pieces.length; i++)
        for (let j = i + 1; j < pieces.length; j++) {
          const a = pieces[i].box;
          const b = pieces[j].box;
          if (a.min.x - gap <= b.max.x && b.min.x - gap <= a.max.x && a.min.z - gap <= b.max.z && b.min.z - gap <= a.max.z) par[find(i)] = find(j);
        }
      const byRoot = new Map<number, Piece[]>();
      pieces.forEach((p, i) => {
        const r = find(i);
        const list = byRoot.get(r) ?? [];
        list.push(p);
        byRoot.set(r, list);
      });
      const modules: Module[] = [];
      for (const list of byRoot.values()) {
        const box = new THREE.Box3();
        for (const p of list) box.union(p.box);
        const size = box.getSize(new THREE.Vector3());
        if (size.x < 1 && size.z < 1) continue; // stray bits (texture swatches)
        const cx = (box.min.x + box.max.x) / 2;
        const cz = (box.min.z + box.max.z) / 2;
        const group = new THREE.Group();
        const perMat = new Map<string, Piece[]>();
        for (const p of list) perMat.set(p.mat, [...(perMat.get(p.mat) ?? []), p]);
        for (const [name, ps] of perMat) {
          const n = ps.reduce((a, p) => a + p.pos.length, 0);
          const pos = new Float32Array(n);
          const uv = new Float32Array((n / 3) * 2);
          let o = 0;
          for (const p of ps) {
            for (let k = 0; k < p.pos.length; k += 3) {
              pos[o + k] = p.pos[k] - cx;
              pos[o + k + 1] = p.pos[k + 1] - box.min.y;
              pos[o + k + 2] = p.pos[k + 2] - cz;
            }
            if (p.uv) uv.set(p.uv, (o / 3) * 2);
            o += p.pos.length;
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
          g.computeVertexNormals();
          const mesh = new THREE.Mesh(g, mats.get(name)!);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
        }
        modules.push({ group, cx, cz });
      }
      this.placeModules(modules);
    });
  }

  private useMap(mat: THREE.MeshLambertMaterial, map: THREE.Texture, repeat: number): void {
    const t = map.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    t.needsUpdate = true;
    mat.map = t;
    mat.color.set(0xffffff);
    mat.needsUpdate = true;
  }

  /**
   * The jumps of the track are the kit's dirt mounds: each feature shows the very piece whose
   * profile the physics rides, laid across the track and stretched the same way.
   */
  private gate: THREE.Group | null = null;
  private gateBeam: THREE.Mesh | null = null;
  private gateT = 0;

  /** Race start: a gate across the track in front of the grid, lowered at the start signal. */
  private updateGate(game: Game, zone: { cruise: boolean }, dt: number): void {
    if (game.mxKind !== 'race' || zone.cruise) {
      if (this.gate) this.gate.visible = false;
      return;
    }
    if (!this.gate) {
      const g = new THREE.Group();
      const white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
      const red = new THREE.MeshLambertMaterial({ color: 0xd8321f });
      const half = MX_HALF_WIDTH + 0.7;
      for (const z of [-half, half]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.4, 0.14), red);
        post.position.set(0, 0.7, z);
        g.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, half * 2), white);
      for (let i = 0; i < 6; i++) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, half / 3), red);
        band.position.z = -half + (half / 6) * (2 * i + 1);
        if (i % 2 === 0) beam.add(band);
      }
      g.add(beam);
      this.gate = g;
      this.gateBeam = beam;
      this.scene.add(g);
    }
    if (game.countdown > 0 || game.mxStartT <= 0) this.gateT = 0;
    else this.gateT += dt;
    const pose = mxPose(1.8, false);
    this.gate.position.set(pose.x, 0.01, pose.z);
    this.gate.rotation.y = -pose.th;
    const drop = clamp(this.gateT / 0.45, 0, 1);
    this.gateBeam!.position.y = 1.15 - drop * 1.1;
    this.gate.visible = this.gateT < 1;
  }

  /** The kit mounds of the cross circuit and the low rollers of the cruising version of the track. */
  private crossMeshes: THREE.Object3D[] = [];
  private cruiseMeshes: THREE.Object3D[] = [];
  private cruiseView = false;

  private placeModules(modules: Module[]): void {
    const find = (i: number) => {
      const k = KIT_MODULES[i];
      return modules.find((m) => Math.abs(m.cx - k.cx) < 0.6 && Math.abs(m.cz - k.cz) < 0.6);
    };
    for (const [list, cruise] of [[MX_FEATURES, false], [MX_FEATURES_CRUISE, true]] as const) for (const f of list) {
      const k = KIT_MODULES[f.mod];
      const src = find(f.mod);
      if (!src) continue;
      const g = src.group.clone();
      const p = loopAt(f.s0 + f.len / 2);
      const lat = mxLatScale(f.mod);
      g.position.set(p.x, 0.01, p.z);
      // the piece's long axis along the track
      g.rotation.y = k.alongX ? -p.th : Math.PI / 2 - p.th;
      g.scale.set(k.alongX ? f.sx : lat, f.sy, k.alongX ? lat : f.sx);
      g.visible = cruise === this.cruiseView;
      (cruise ? this.cruiseMeshes : this.crossMeshes).push(g);
      this.scene.add(g);
    }
  }

  /** The 2D sprites of the circuit's world (the game's own painted ones) all around the track. */
  private plantDecor(): void {
    const th = this.theme;
    const spread = (defs: AssetDef[], n: number) => {
      const out: AssetDef[] = [];
      if (!defs.length) return out;
      for (let i = 0; i < n; i++) out.push(defs[Math.floor((i * defs.length) / n) % defs.length]);
      return out;
    };
    const make = (defs: AssetDef[]) =>
      defs.map((d) => {
        const sp = d.draw();
        const tex = new THREE.CanvasTexture(sp.canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return { mat: new THREE.SpriteMaterial({ map: tex, alphaTest: 0.35 }), sp };
      });
    const trees = make(spread(assetsFor(th.groups, 'tree'), 9));
    const bushes = make(spread(assetsFor(th.groups, 'bush'), 6));
    const far = make(spread(th.far.length ? assetsFor(th.far, 'structure') : [], th.trackside ? 8 : 6));
    const side = th.trackside ? make(spread(assetsFor(['sf'], 'trackside'), 12)) : [];
    const line: [number, number][] = [];
    for (let s = 0; s < MX_LEN; s += 4) {
      const p = loopAt(s);
      line.push([p.x, p.z]);
    }
    const total = MX_ENTRY + (MX_LEN + MX_STRAIGHT[1] - MX_STRAIGHT[0]) + MX_EXIT;
    for (let u = -40; u < total + 60; u += 4) {
      if (u > MX_ENTRY && u < total - MX_EXIT) continue;
      const p = mxPose(u, true);
      line.push([p.x, p.z]);
    }
    let seed = 12345 + this.circuit * 977;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const dist = (x: number, z: number) => {
      let d = 1e9;
      for (const [lx, lz] of line) d = Math.min(d, (lx - x) ** 2 + (lz - z) ** 2);
      return Math.sqrt(d);
    };
    const put = (list: { mat: THREE.SpriteMaterial; sp: { w: number; h: number; ax: number; ay: number } }[], x: number, z: number, k: number) => {
      const { mat, sp } = list[Math.floor(rnd() * list.length)];
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(sp.w * k, sp.h * k, 1);
      sprite.center.set(sp.ax / sp.w, 1 - sp.ay / sp.h);
      sprite.position.set(x, 0, z);
      this.scene.add(sprite);
    };
    const R = 300;
    // trees and bushes: a clear strip along the track, then more and more of them
    let n = 0;
    for (let tries = 0; tries < 3600 && n < 420 * th.density; tries++) {
      const x = this.cx + (rnd() * 2 - 1) * (R + 60);
      const z = this.cz + (rnd() * 2 - 1) * (R - 20);
      const d = dist(x, z);
      if (d < 13 || rnd() > Math.min(1, (d - 8) / 45)) continue;
      const bush = bushes.length > 0 && (trees.length === 0 || rnd() < 0.3);
      const list = bush ? bushes : trees;
      if (!list.length) continue;
      put(list, x, z, (bush ? 0.9 : 1.1) + rnd() * 0.7);
      n++;
    }
    // far scenery (structures: mesas, farms, houses): never close to the track
    let f = 0;
    for (let tries = 0; far.length && tries < 1500 && f < (th.trackside ? 16 : 14); tries++) {
      const a = rnd() * Math.PI * 2;
      const r = 190 + rnd() * 120;
      const x = this.cx + Math.cos(a) * r * 1.15;
      const z = this.cz + Math.sin(a) * r;
      if (dist(x, z) < 150) continue;
      put(far, x, z, 1 + rnd() * 0.6);
      f++;
    }
    // city: street furniture along the track (barriers, lamps, signs)
    if (side.length) {
      let c = 0;
      for (let tries = 0; tries < 1200 && c < 90; tries++) {
        const p = loopAt(Math.floor(rnd() * MX_LEN));
        const o = (rnd() < 0.5 ? -1 : 1) * (MX_HALF_WIDTH + 4 + rnd() * 16);
        const x = p.x - Math.sin(p.th) * o;
        const z = p.z + Math.cos(p.th) * o;
        if (dist(x, z) < MX_HALF_WIDTH + 3.5) continue;
        put(side, x, z, 0.9 + rnd() * 0.5);
        c++;
      }
    }
  }

  // ---------------------------------------------------------------- bikes

  /** Hang a bike in this scene (leaves the 2.5D scene) and place it on the track. */
  private place(b3: Bike3D, bike: Bike, zone: { x0: number; h0: number; cruise: boolean }, n: number, psi: number, lean: number): THREE.Group {
    let car = this.carriers.get(b3);
    if (!car) {
      car = new THREE.Group();
      this.scene.add(car);
      this.carriers.set(b3, car);
    }
    if (b3.group.parent !== car) car.add(b3.group);
    const pose = mxPose(bike.x - zone.x0, zone.cruise);
    const [ox] = bike.pointWorld(0, 0);
    const yaw = pose.th + psi;
    const wx = pose.x - Math.sin(pose.th) * n;
    const wz = pose.z + Math.cos(pose.th) * n;
    car.rotation.y = -yaw;
    car.position.set(wx - Math.cos(yaw) * ox, -zone.h0 + bankAt(pose.k, n), wz - Math.sin(yaw) * ox);
    // lean about the tyres' contact line, not about the centre of mass
    b3.group.rotation.x = lean;
    b3.group.position.z = Math.sin(lean) * 0.75;
    b3.group.position.y -= (1 - Math.cos(lean)) * 0.75;
    return car;
  }

  /** Give the bikes back to the 2.5D scene. */
  release(main: THREE.Scene): void {
    for (const [b3, car] of this.carriers) {
      if (b3.group.parent === car) {
        b3.group.rotation.x = 0;
        b3.steer = 0;
        main.add(b3.group);
      }
      this.scene.remove(car);
    }
    this.carriers.clear();
    this.fresh = true;
  }

  // ---------------------------------------------------------------- frame

  /**
   * Draw the frame. `swing` (0..1): the camera is still coming round from the side (entering)
   * or already going back to it (leaving).
   */
  render(renderer: THREE.WebGLRenderer, game: Game, dt: number, player: Bike3D, rivals: Map<unknown, Bike3D>, aspect: number, swing: number): void {
    const w = game.world;
    const b = game.bike;
    const zone = w.mxAt(b.x) ?? w.mxZones[w.mxZones.length - 1];
    if (!zone) return;
    this.time += dt;
    if (zone.cruise !== this.cruiseView) {
      this.cruiseView = zone.cruise;
      for (const g of this.crossMeshes) g.visible = !zone.cruise;
      for (const g of this.cruiseMeshes) g.visible = zone.cruise;
    }
    this.updateGate(game, zone, dt);
    // ---- bikes
    const crashed = !!(game.ragdoll && game.crashTimer > 0);
    player.lane = 0;
    player.steer = crashed ? 0 : game.mxBar;
    player.update(b, dt, crashed);
    const car = this.place(player, b, zone, game.mxN, game.mxPsi, game.mxLean);
    if (crashed) player.setRiderDetached(true, game.ragdoll!.x, game.ragdoll!.y, game.ragdoll!.angle, car);
    else player.setRiderDetached(false);
    for (const o of game.opponents) {
      const b3 = rivals.get(o);
      if (!b3) continue;
      const near = Math.abs(o.bike.x - b.x) < 160;
      b3.group.visible = near;
      if (!near) continue;
      b3.lane = 0;
      const ov = Math.max(3, o.bike.forwardSpeed);
      b3.steer = o.crashTimer > 0 ? 0 : Math.atan((1.48 * 9.81 * 1.55 * Math.tan(o.mxLean ?? 0)) / (ov * ov));
      b3.update(o.bike, dt, o.crashTimer > 0);
      this.place(b3, o.bike, zone, o.mxN ?? 0, 0, o.mxLean ?? 0);
    }
    // ---- camera: third person, smooth; it does not take the bike's knocks
    const u = b.x - zone.x0;
    const pose = mxPose(u, zone.cruise);
    const ahead = mxPose(u + 7, zone.cruise);
    const far = mxPose(u + 16, zone.cruise);
    const wx = pose.x - Math.sin(pose.th) * game.mxN;
    const wz = pose.z + Math.cos(pose.th) * game.mxN;
    const groundY = pose.h + bankAt(pose.k, game.mxN);
    const [, oy] = b.pointWorld(0, 0);
    const bikeY = oy - zone.h0;
    const v = Math.max(0, b.forwardSpeed);
    // heading the camera settles behind: mostly the track just ahead, a little the bike itself
    let wantYaw = ahead.th + game.mxPsi * 0.35;
    let d = wantYaw - this.camYaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    wantYaw = this.camYaw + d;
    const targetY = groundY + 0.35 * Math.max(0, bikeY - groundY - 0.9); // follows the jumps, softly
    if (this.fresh) {
      this.camYaw = wantYaw;
      this.camY = targetY;
    } else {
      this.camYaw += (wantYaw - this.camYaw) * Math.min(1, dt * 3.2);
      this.camY += (targetY - this.camY) * Math.min(1, dt * 2.6);
    }
    const sw = swing * swing * (3 - 2 * swing);
    const yaw = this.camYaw - sw * 1.2; // swinging in from the side the 2.5D camera sits on
    const dist = 6.4 + v * 0.07 + sw * 2.5;
    const want = new THREE.Vector3(wx - Math.cos(yaw) * dist, this.camY + 2.7 + sw * 0.6, wz - Math.sin(yaw) * dist);
    if (this.fresh) this.camPos.copy(want);
    else {
      const k = Math.min(1, dt * 7);
      this.camPos.x += (want.x - this.camPos.x) * k;
      this.camPos.z += (want.z - this.camPos.z) * k;
      this.camPos.y += (want.y - this.camPos.y) * Math.min(1, dt * 4);
    }
    // look a few metres ahead of the bike, and a touch towards where the track goes next
    const lx = wx + Math.cos(this.camYaw) * 5 * 0.78 + (far.x - wx) * 0.22;
    const lz = wz + Math.sin(this.camYaw) * 5 * 0.78 + (far.z - wz) * 0.22;
    const lookWant = new THREE.Vector3(lx, this.camY + 1.25, lz);
    if (this.fresh) this.look.copy(lookWant);
    else this.look.lerp(lookWant, Math.min(1, dt * 6));
    this.fresh = false;
    this.camera.aspect = aspect;
    this.camera.fov = 60 + clamp(v / 25, 0, 1) * 9;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.camPos);
    if (game.shake > 0) this.camera.position.y += (Math.random() - 0.5) * game.shake * game.shake * 0.12;
    this.camera.lookAt(this.look);
    this.camera.updateMatrixWorld();
    // sun and its shadow follow the bike
    this.sun.position.set(wx - 30, 60, wz + 22);
    this.sun.target.position.set(wx, 0, wz);
    this.sun.castShadow = renderer.shadowMap.enabled;

    this.updateCoins(game, zone);
    this.updateDust(game, dt, car);
    renderer.render(this.scene, this.camera);
  }

  private updateCoins(game: Game, zone: { x0: number; h0: number; cruise: boolean }): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    let i = 0;
    for (const c of game.world.coins) {
      if (c.taken || Math.abs(c.x - game.bike.x) > 90 || i >= 60) continue;
      const p = mxPose(c.x - zone.x0, zone.cruise);
      q.setFromAxisAngle(yAxis, this.time * 3 + c.x);
      m.compose(new THREE.Vector3(p.x, c.y - zone.h0, p.z), q, one);
      this.coins.setMatrixAt(i++, m);
    }
    this.coins.count = i;
    this.coins.instanceMatrix.needsUpdate = true;
  }

  /** Dust thrown up by the rear wheel: more with speed, throttle and slides. */
  private updateDust(game: Game, dt: number, car: THREE.Group): void {
    const b = game.bike;
    // the rear tyre scuffs the dirt at `scuff` m/s (wheelspin, locked wheel, power slide): that is what
    // throws the dust, on top of the plain rolling dust that grows with speed
    const scuff = Math.abs(b.rear.slip) + game.mxSlide * 6;
    const rate = b.rear.contact && game.crashTimer <= 0 ? Math.min(260, Math.abs(b.forwardSpeed) * 0.9 + scuff * 26 + game.input.throttle * 8) : 0;
    const thick = Math.min(1.6, 0.35 + scuff / 5);
    this.dustAcc += rate * dt;
    const local = new THREE.Vector3();
    car.updateMatrixWorld(true);
    while (this.dustAcc >= 1) {
      this.dustAcc -= 1;
      const i = this.dustI++ % this.dustN;
      local.set(b.rear.x - 0.25, b.rear.y - 0.38, (Math.random() - 0.5) * 0.3);
      car.localToWorld(local);
      this.dustP.set([local.x, local.y, local.z], i * 3);
      const back = -1.2 - Math.random() * 1.6 - game.input.throttle * 1.5 - scuff * 0.5;
      const yaw = -car.rotation.y;
      const side = (Math.random() - 0.5) * 1.6 + Math.sign(game.mxLean) * game.mxSlide * 2.5;
      this.dustV.set([Math.cos(yaw) * back - Math.sin(yaw) * side, 0.8 + Math.random() * 1.4 + scuff * 0.25, Math.sin(yaw) * back + Math.cos(yaw) * side], i * 3);
      this.dustL[i] = 1;
      this.dustS[i] = thick;
    }
    for (let i = 0; i < this.dustN; i++) {
      if (this.dustL[i] <= 0) {
        this.dustA[i] = 0;
        continue;
      }
      this.dustL[i] -= dt / 1.3;
      this.dustP[i * 3] += this.dustV[i * 3] * dt;
      this.dustP[i * 3 + 1] += this.dustV[i * 3 + 1] * dt;
      this.dustP[i * 3 + 2] += this.dustV[i * 3 + 2] * dt;
      this.dustV[i * 3 + 1] -= 1.2 * dt;
      this.dustA[i] = Math.max(0, this.dustL[i]) * this.dustS[i];
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
    this.dust.geometry.attributes.alpha.needsUpdate = true;
    (this.dust.material as THREE.ShaderMaterial).uniforms.scale.value = 520;
  }

  /** Screen position (NDC) of a point given in the 2D frame of the physics (x along, y up). */
  project(game: Game, x: number, y: number, out: THREE.Vector3): THREE.Vector3 {
    const zone = game.world.mxAt(x) ?? game.world.mxZones[game.world.mxZones.length - 1];
    const p = mxPose(x - zone.x0, zone.cruise);
    const n = Math.abs(x - game.bike.x) < 6 ? game.mxN : 0;
    return out.set(p.x - Math.sin(p.th) * n, y - zone.h0, p.z + Math.cos(p.th) * n).project(this.camera);
  }
}
