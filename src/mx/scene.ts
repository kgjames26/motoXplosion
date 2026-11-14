import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Game } from '../game';
import type { Bike } from '../physics/bike';
import type { Bike3D } from '../gl/bike3d';
import { clamp } from '../core/math';
import { JUMP_FLAT, JUMP_HALF_W, JUMP_SKIRT, jumpHeight } from './jumps';
import { loopAt, mxCircuit, MX_CIRCUITS, MX_RUNOFF, MX_ENTRY, MX_EXIT, MX_FEATURES, MX_FEATURES_CRUISE, MX_HALF_WIDTH, MX_LEN, MX_STRAIGHT, loopHeightN, mxBase, mxLatScale, mxPose } from './track';
import type { MxWorld } from './track';
import { KIT_MODULES } from './kitData';
import { assetsFor } from '../catalog';
import { smokeRate } from '../render/particles';
import type { AssetDef, AssetGroup } from '../catalog';
import { bankAt, BlobShadows, featherFlags, grassTufts, hash2, normalFromCanvas, panoFade, skirtW, Sky, SUN, Terrain, topColor, trackLine, treeShadows, vnoise } from './scenery';
import type { TuftLook } from './scenery';

export { bankAt };

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
  /** Colour multiplier of the ground beside the track (run-off, banks): grass in the green worlds. */
  verge: [number, number, number];
  track: { tex: string; tint: number };
  /** Groups of the sprites planted around (trees, bushes) and the far scenery (structures). */
  groups: AssetGroup[];
  far: AssetGroup[];
  /** Street furniture beside the track (city). */
  trackside: boolean;
  /** Share of the planting spots kept (1 = full forest). */
  density: number;
  /** Height of the hills far from the track (m; 0 = flat). */
  hills: number;
  /** Tufts of grass along the track (none in the city). */
  tuft: TuftLook | null;
}
const THEMES: Record<MxWorld, Theme> = {
  foret: { pano: 'foret.0', bg: 0x8fc6f4, fog: 0xcfe6f6, hemiGround: 0x5a7a3a, ground: { tex: 'tex-grass', tint: 0xa8c888, rep: 150 }, verge: [0.5, 0.95, 0.36], track: { tex: 'tex-dirt', tint: 0x9a7a62 }, groups: ['foret', 'green'], far: [], trackside: false, density: 1, hills: 10, tuft: { base: '#2c6e1e', tip: '#8fcf4c', n: 1 } },
  alpes: { pano: 'alpes.0', bg: 0x7fb4ee, fog: 0xd4e4f2, hemiGround: 0x6a7a58, ground: { tex: 'tex-grass', tint: 0xb4d098, rep: 150 }, verge: [0.52, 0.95, 0.4], track: { tex: 'tex-dirt', tint: 0x8a7664 }, groups: ['alpes', 'green'], far: ['alpes'], trackside: false, density: 0.8, hills: 16, tuft: { base: '#33752a', tip: '#a5d95e', n: 0.9 } },
  canyon: { pano: 'canyon.p2', bg: 0x6aa6ea, fog: 0xe8d2bc, hemiGround: 0x9a5a3a, ground: { tex: 'tex-rock-warm', tint: 0xe6b894, rep: 120 }, verge: [1.2, 0.95, 0.78], track: { tex: 'tex-sand', tint: 0xc0704a }, groups: ['canyon'], far: ['canyon'], trackside: false, density: 0.45, hills: 9, tuft: { base: '#7a6a34', tip: '#c9b46a', n: 0.3 } },
  desert: { pano: 'desert.p1', bg: 0x74aef0, fog: 0xf0dfc4, hemiGround: 0xb08a5a, ground: { tex: 'tex-sand', tint: 0xf0d6a4, rep: 140 }, verge: [1.3, 1.15, 0.9], track: { tex: 'tex-sand', tint: 0xb88a56 }, groups: ['desert'], far: ['desert'], trackside: false, density: 0.35, hills: 7, tuft: { base: '#8a7a40', tip: '#d8c680', n: 0.2 } },
  sf: { pano: 'sf.p2', bg: 0x6aa6ea, fog: 0xdfe5ec, hemiGround: 0x6a6c70, ground: { tex: 'asphalt', tint: 0xffffff, rep: 130 }, verge: [0.75, 0.76, 0.78], track: { tex: 'tex-dirt', tint: 0x86705e }, groups: ['sf'], far: ['sf'], trackside: true, density: 0.22, hills: 0, tuft: null },
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

/** A tileable earth texture, dark and wet: packed loam, glossy clods, wet streaks, a few pebbles. */
function earthTexture(): { map: THREE.CanvasTexture; canvas: HTMLCanvasElement } {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9a7a5c';
  g.fillRect(0, 0, S, S);
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const wrapped = (x: number, y: number, r: number, draw: (px: number, py: number) => void) => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) if (x + ox > -r && x + ox < S + r && y + oy > -r && y + oy < S + r) draw(x + ox, y + oy);
  };
  const blob = (x: number, y: number, r: number, rgba: string) =>
    wrapped(x, y, r, (px, py) => {
      const gr = g.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, rgba);
      gr.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'));
      g.fillStyle = gr;
      g.fillRect(px - r, py - r, r * 2, r * 2);
    });
  // large wet and drier patches
  for (let i = 0; i < 120; i++) blob(rnd() * S, rnd() * S, 30 + rnd() * 80, rnd() < 0.5 ? 'rgba(60,44,30,0.14)' : 'rgba(200,175,145,0.12)');
  // wet streaks (smeared, along the ride direction)
  for (let i = 0; i < 90; i++) {
    const x = rnd() * S, y = rnd() * S, l = 30 + rnd() * 90;
    wrapped(x, y, l, (px, py) => {
      g.strokeStyle = 'rgba(50,36,24,0.18)';
      g.lineWidth = 2 + rnd() * 5;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + l, py + (rnd() - 0.5) * 8); g.stroke();
    });
  }
  // clods: dark body, a wet glint on the lit side
  for (let i = 0; i < 800; i++) {
    const x = rnd() * S, y = rnd() * S, r = 1.5 + rnd() * 5.5;
    blob(x, y, r * 1.6, 'rgba(50,36,24,0.32)');
    blob(x - r * 0.3, y - r * 0.3, r * 0.7, 'rgba(225,200,170,0.25)');
  }
  // pebbles
  for (let i = 0; i < 160; i++) {
    const x = rnd() * S, y = rnd() * S, r = 0.8 + rnd() * 1.6;
    wrapped(x, y, r + 2, (px, py) => {
      g.fillStyle = 'rgba(30,22,16,0.4)';
      g.beginPath(); g.arc(px + 0.8, py + 0.8, r, 0, 6.3); g.fill();
      g.fillStyle = `rgba(${150 + rnd() * 40},${135 + rnd() * 30},${115 + rnd() * 25},0.7)`;
      g.beginPath(); g.arc(px, py, r, 0, 6.3); g.fill();
    });
  }
  for (let i = 0; i < 16000; i++) {
    const v = 80 + Math.floor(rnd() * 130);
    g.fillStyle = `rgba(${v},${Math.floor(v * 0.85)},${Math.floor(v * 0.7)},0.35)`;
    g.fillRect(Math.floor(rnd() * S), Math.floor(rnd() * S), 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return { map: t, canvas: c };
}

/** Where the bikes ride (tools/sim_ruts.ts): per circuit, bytes of wheel traffic and of sliding on a ds × dn grid. */
interface RutData {
  ds: number;
  dn: number;
  n0: number;
  cols: number;
  rows: number;
  d: Uint8Array;
  s: Uint8Array;
}
let rutsPromise: Promise<{ ds: number; dn: number; n0: number; cols: number; circuits: { id: string; rows: number; d: string; s: string }[] } | null> | null = null;
function loadRuts(): Promise<{ ds: number; dn: number; n0: number; cols: number; circuits: { id: string; rows: number; d: string; s: string }[] } | null> {
  rutsPromise ??= fetch(`${BASE}res/mx-ruts.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return rutsPromise;
}
const b64 = (t: string): Uint8Array => Uint8Array.from(atob(t), (ch) => ch.charCodeAt(0));
/**
 * v2.50: light baked into the vertex colours, so the relief reads even with shadows off (phones):
 * faces turned to the sun lighter, faces turned away clearly darker, a soft dark band at the foot
 * of the shaded faces.
 */
function bakeLight(g: THREE.BufferGeometry, k = 1): void {
  const N = g.attributes.normal.array as Float32Array;
  const C = g.attributes.color.array as Float32Array;
  for (let i = 0; i < N.length / 3; i++) {
    const d = N[i * 3] * SUN[0] + N[i * 3 + 1] * SUN[1] + N[i * 3 + 2] * SUN[2];
    const f = Math.min(1.3, Math.max(0.5, 1 + 1.6 * k * (d - SUN[1])));
    for (let q = 0; q < 3; q++) C[i * 3 + q] *= f;
  }
  g.attributes.color.needsUpdate = true;
}

/**
 * v2.48: everything inclined on the circuit (jump faces, berms, banks, steep skirts) takes a darker,
 * redder earth colour. The edge between flat and inclined is ragged: the slope threshold is shifted
 * by noise of 15 to 55 cm cells, so the colour changes over an irregular 15–55 cm band.
 */
function tintSlopes(g: THREE.BufferGeometry, k = 1): void {
  const P = g.attributes.position.array as Float32Array;
  const N = g.attributes.normal.array as Float32Array;
  const C = g.attributes.color.array as Float32Array;
  for (let i = 0; i < P.length / 3; i++) {
    const x = P[i * 3], z = P[i * 3 + 2];
    const ang = Math.acos(Math.min(1, Math.abs(N[i * 3 + 1]))); // rad from flat
    const cell = 0.15 + 0.4 * vnoise(x, z, 3, 5); // 15..55 cm, varying over the circuit
    const jit = (vnoise(x, z, cell, 11) - 0.5) * 0.16 + (vnoise(x, z, 0.15, 17) - 0.5) * 0.06;
    const f = Math.min(1, Math.max(0, (ang - (0.2 + jit)) / 0.05)) * k; // ~11° ± 5°
    C[i * 3] *= 1 - 0.2 * f;
    C[i * 3 + 1] *= 1 - 0.34 * f;
    C[i * 3 + 2] *= 1 - 0.48 * f;
  }
  g.attributes.color.needsUpdate = true;
}

export class MxScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.3, 900);
  private sun = new THREE.DirectionalLight(0xfff2dc, 2.8);
  private dirt = new THREE.MeshLambertMaterial({ color: 0x9a6a44, side: THREE.DoubleSide });
  private grass = new THREE.MeshLambertMaterial({ color: 0xb09070 });
  private carriers = new Map<Bike3D, THREE.Group>();
  private coins: THREE.InstancedMesh;
  private dust: THREE.Points;
  private dustN = 2400;
  private dustP = new Float32Array(this.dustN * 3);
  private dustV = new Float32Array(this.dustN * 3);
  private dustL = new Float32Array(this.dustN); // life left (s)
  private dustA = new Float32Array(this.dustN);
  /** How thick each puff is (it grows with the scuffing of the tyre). */
  private dustS = new Float32Array(this.dustN);
  private dustI = 0;
  // exhaust smoke (the 3D track has its own point sprites)
  private smokeN = 160;
  private smokeP = new Float32Array(this.smokeN * 3);
  private smokeV = new Float32Array(this.smokeN * 3);
  private smokeL = new Float32Array(this.smokeN);
  private smokeA = new Float32Array(this.smokeN);
  private smokeS = new Float32Array(this.smokeN);
  private smokeI = 0;
  private smokeAcc = 0;
  private smoke!: THREE.Points;
  private dustAcc = 0;
  // camera state
  private camPos = new THREE.Vector3();
  private camYaw = 0;
  private camY = 0;
  private look = new THREE.Vector3();
  private fresh = true;
  private time = 0;

  private theme: Theme;
  /** The loop's earth: a coarse ribbon at first, replaced by the detailed one once the ruts are loaded. */
  private loopRibbon: THREE.Mesh | null = null;
  private earth = new THREE.MeshPhongMaterial({ vertexColors: true, specular: new THREE.Color(0x1a1612), shininess: 12 });
  /** Middle of the circuit (the ground and the panorama are centred on it). */
  private cx = 0;
  private cz = 80;
  /** v2.57: rolling ground, sky dome, wind (grass, flags), soft shadows. */
  private terrain!: Terrain;
  private sky: Sky | null = null;
  private wind = { value: 0 };
  private blobs: BlobShadows | null = null;
  /** A piece of decor must never keep the circuit from loading. */
  private safe(what: string, build: () => void): void {
    try {
      build();
    } catch (err) {
      console.warn(`mx decor: ${what}`, err);
    }
  }

  constructor(readonly circuit = 0, private detail = 1) {
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
    s.add(new THREE.HemisphereLight(0xdcefff, th.hemiGround, 0.95)); // less flat fill: the relief reads by the sun
    this.sun.position.set(-40, 70, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -45;
    sc.right = sc.top = 45;
    sc.near = 1;
    sc.far = 220;
    this.sun.shadow.bias = -0.0006;
    s.add(this.sun, this.sun.target);
    // ground: the world's own texture (asphalt in the city), the track in the world's earth
    const line = trackLine();
    this.grass.vertexColors = true;
    this.terrain = new Terrain(this.cx, this.cz, th.hills, line, this.grass);
    s.add(this.terrain.mesh);
    this.safe('sky', () => {
      this.sky = new Sky(th.bg);
      s.add(this.sky.dome);
    });
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
      // its top edge melts into the sky dome, which takes the colour the painting has up there
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(600, 600, 300, 48, 1, true), new THREE.MeshBasicMaterial({ map: t, alphaMap: this.sky ? panoFade() : null, transparent: !!this.sky, depthWrite: false, side: THREE.BackSide, fog: false }));
      ring.position.set(this.cx, 150 - 300 * 0.3, this.cz);
      ring.renderOrder = -5;
      const top = this.sky ? topColor(t.image) : null;
      if (top && this.sky) this.sky.setHorizon(top[0], top[1], top[2]);
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
        vertexShader: 'attribute float alpha; varying float vA; uniform float scale; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min(scale * (0.5 + (1.0 - alpha) * 1.6) / -mv.z, 150.0); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA * 0.42; gl_FragColor = vec4(0.80, 0.63, 0.44, a); }',
      }),
    );
    this.dust.frustumCulled = false;
    s.add(this.dust);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.smokeP, 3));
    sg.setAttribute('alpha', new THREE.BufferAttribute(this.smokeA, 1));
    sg.setAttribute('psize', new THREE.BufferAttribute(this.smokeS, 1));
    this.smoke = new THREE.Points(
      sg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { scale: { value: 600 } },
        vertexShader: 'attribute float alpha; attribute float psize; varying float vA; uniform float scale; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min(scale * psize / -mv.z, 60.0); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA; gl_FragColor = vec4(0.82, 0.83, 0.86, a); }',
      }),
    );
    this.smoke.frustumCulled = false;
    s.add(this.smoke);
    this.loadKit();
    this.buildJumps();
    this.buildTrackside();
    const earth = earthTexture();
    this.earth.map = earth.map;
    this.safe('earth relief', () => {
      const nm = normalFromCanvas(earth.canvas, 2.2);
      if (!nm) return;
      this.earth.normalMap = nm;
      this.earth.normalScale.set(0.8, 0.8);
      this.earth.specular.set(0x2a241c);
      this.earth.shininess = 18;
    });
    this.safe('grass', () => {
      const tufts = th.tuft ? grassTufts(th.tuft, line, this.detail, this.circuit, this.wind) : null;
      if (!tufts) return;
      (tufts.material as THREE.MeshLambertMaterial).color.set(th.ground.tint).lerp(new THREE.Color(0xffffff), 0.35);
      s.add(tufts);
    });
    this.safe('flags', () => s.add(featherFlags(line, this.wind)));
    this.safe('blob shadows', () => {
      this.blobs = new BlobShadows();
      s.add(this.blobs.mesh);
    });
    this.earth.color.set(th.track.tint).lerp(new THREE.Color(0xffffff), 0.6);
    void loadRuts().then((d) => {
      const c = d?.circuits.find((x) => x.id === MX_CIRCUITS[this.circuit].id);
      if (!d || !c || mxCircuit !== this.circuit || c.rows !== Math.ceil(MX_LEN / d.ds)) return;
      this.buildEarth({ ds: d.ds, dn: d.dn, n0: d.n0, cols: d.cols, rows: c.rows, d: b64(c.d), s: b64(c.s) });
    });
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

  /**
   * The earth of the circuit, finer than the first ribbon: a cell every 0.25 m across the track
   * and every 0.6 m along it. The ground is shaped by the bikes that rode it (simulated laps): the
   * lines of the wheels are sunk into the dirt (up to 5 cm) and polished darker, the spots where
   * the rear spun and slid are loose and pale, and a 40 cm bank of earth closes the track where
   * the run-off ends.
   */
  private buildEarth(R: RutData): void {
    const HW = MX_HALF_WIDTH;
    const OUT = HW + MX_RUNOFF; // end of the rideable ground (9 m)
    const lat: number[] = [];
    for (const n of [-27, -24, -21, -18.5, -16, -14, -12.6, -11.2, -10.6, -10, -9.6, -9.2, -8.5, -7.6, -6.7, -6]) lat.push(n);
    for (let n = -5.5; n <= 5.5001; n += 0.2) lat.push(Math.round(n * 100) / 100);
    for (const n of [6, 6.7, 7.6, 8.5, 9.2, 9.6, 10, 10.6, 11.2, 12.6, 14, 16, 18.5, 21, 24, 27]) lat.push(n);
    const L = lat.length;
    const STEP = 0.5;
    const m = Math.ceil(MX_LEN / STEP);
    const pos = new Float32Array(m * L * 3);
    const uv = new Float32Array(m * L * 2);
    const col = new Float32Array(m * L * 3);
    const sample = (A: Uint8Array, s: number, n: number): number => {
      const fr = s / R.ds;
      const r0 = Math.floor(fr);
      const a = fr - r0;
      const fc = (n - R.n0) / R.dn;
      const c0 = Math.floor(fc);
      const b = fc - c0;
      let v = 0;
      for (let dr = 0; dr < 2; dr++)
        for (let dc = 0; dc < 2; dc++) {
          const c = c0 + dc;
          if (c < 0 || c >= R.cols) continue;
          v += A[(((r0 + dr) % R.rows) + R.rows) % R.rows * R.cols + c] * (dr ? a : 1 - a) * (dc ? b : 1 - b);
        }
      return v / 255;
    };
    // the cruising entry / exit lanes run straight on: no bank of earth where they come near the loop
    const laneAt: [number, number][] = [];
    const out = MX_ENTRY + MX_LEN + MX_STRAIGHT[1] - MX_STRAIGHT[0];
    for (const [from, to] of [[-40, MX_ENTRY + 2], [out - 2, out + MX_EXIT + 40]] as [number, number][])
      for (let u = from; u <= to; u += 4) {
        const q = mxPose(u, true);
        laneAt.push([q.x, q.z]);
      }
    const smooth = (a: number, b: number, x: number) => {
      const t = clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };
    for (let i = 0; i < m; i++) {
      const sm = (i * STEP) % MX_LEN;
      const p = loopAt(sm);
      const nx = -Math.sin(p.th);
      const nz = Math.cos(p.th);
      let nearLane = 1e9;
      for (const [lx, lz] of laneAt) nearLane = Math.min(nearLane, Math.hypot(lx - p.x, lz - p.z));
      const bankOn = nearLane > 24 ? 1 : smooth(14, 24, nearLane);
      const base = mxBase(sm);
      const turn = clamp((Math.abs(p.k) - 0.02) * 30, 0, 1); // tight turns: deep ruts in the berm
      for (let j = 0; j < L; j++) {
        const n = lat[j];
        const an = Math.abs(n);
        const k = i * L + j;
        let y = bankAt(p.k, clamp(n, -HW, HW)) + 0.02;
        let shade = 1;
        let warm = 0;
        let grassy = 0;
        if (an <= OUT) {
          const dens = (q: number): number => {
            let e = 0;
            for (let w = 0; w < 5; w++) {
              const c = (w - 2) * 1.9 + 0.9 * Math.sin(sm / (17 + 6 * w) + w * 2.1);
              e = Math.max(e, Math.exp(-(((q - c) / 0.22) ** 2)) * (0.45 + 0.55 * hash2(Math.floor(sm / 22), w + 3)));
            }
            return Math.min(1, sample(R.d, sm, q) * 1.7 + e * 0.75 * (Math.abs(q) < HW ? 1 : 0));
          };
          const d = dens(n);
          const sl = sample(R.s, sm, n);
          const noise = hash2(Math.floor(sm * 2.2), Math.floor((n + 20) * 4));
          // the tyre lines are grooves (3 cm) with a small berm of pushed earth on each side
          const dl = dens(n - 0.2);
          const dr = dens(n + 0.2);
          const berm = clamp(Math.abs(dr - dl) * 2.2, 0, 1) * (1 - d);
          y += -0.05 * smooth(0.08, 0.6, d) + 0.02 * berm - 0.012 * noise * (1 - d) - 0.01 * sl * noise;
          // berms: the outside of a tight turn is dug by every lap, 3 deep ruts around the arc and a lip on top
          const outN = -Math.sign(p.k) * n;
          let rutShade = 0;
          if (turn > 0 && outN > 1.5) {
            let rut = 0;
            for (const c of [2.4, 3.3, 4.2]) rut = Math.max(rut, Math.exp(-(((outN - c - 0.15 * Math.sin(sm / 7 + c)) / 0.28) ** 2)));
            y -= 0.09 * rut * turn;
            y += 0.28 * turn * Math.exp(-(((outN - HW - 0.5) / 0.45) ** 2));
            rutShade = 0.12 * rut * turn;
          }
          y += base;
          // light packed dirt on the track, darker on the wheel lines; beside it the run-off turns to verge
          shade = 1.02 - 0.3 * smooth(0.05, 0.6, d) + 0.1 * (noise - 0.5) - rutShade;
          warm = 0.1 * smooth(0.15, 0.8, sl) * (1 - d);
          grassy = smooth(HW + 0.2, HW + 1.6, an) * (0.75 + 0.25 * noise);
        } else {
          // the bank of earth that closes the circuit: 40 cm high, a little irregular
          const rise = smooth(OUT, OUT + 0.8, an) * (1 - smooth(OUT + 1.2, OUT + 2.2, an)) * bankOn;
          const wob = 0.8 + 0.2 * hash2(Math.floor(sm / 1.5), 7) + 0.1 * Math.sin(sm / 5.3);
          // beyond the bank: a grass slope brings the relief back down to the world's ground
          const fall = smooth(OUT + 2.2, OUT + 2.2 + skirtW(base), an);
          if (an <= OUT + 2.4) y = base + rise * 0.4 * wob - (1 - rise) * 0.05;
          else y = base * (1 - fall) - 0.12 * (base < 0.05 ? 1 : fall);
          shade = 0.95 + 0.1 * hash2(Math.floor(sm), Math.floor(an * 3));
          grassy = 1;
        }
        pos[k * 3] = p.x + nx * n;
        pos[k * 3 + 1] = y;
        pos[k * 3 + 2] = p.z + nz * n;
        uv[k * 2] = n / 1.6;
        uv[k * 2 + 1] = sm / 1.6;
        const vg = this.theme.verge;
        col[k * 3] = clamp((shade + warm) * (1 + (vg[0] - 1) * grassy), 0, 1.3);
        col[k * 3 + 1] = clamp((shade + warm * 0.7) * (1 + (vg[1] - 1) * grassy), 0, 1.3);
        col[k * 3 + 2] = clamp((shade + warm * 0.2) * (1 + (vg[2] - 1) * grassy), 0, 1.3);
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < m; i++) {
      const a = i * L;
      const b = ((i + 1) % m) * L;
      for (let j = 0; j < L - 1; j++) idx.push(a + j, a + j + 1, b + j, a + j + 1, b + j + 1, b + j);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    tintSlopes(g);
    bakeLight(g);
    const mesh = new THREE.Mesh(g, this.earth);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    if (this.loopRibbon) {
      this.scene.remove(this.loopRibbon);
      this.loopRibbon.geometry.dispose();
    }
    this.loopRibbon = mesh;
    this.scene.add(mesh);
  }

  /** An entry / exit lane in the same dark wet earth as the loop: two faint wheel lines, grooves included. */
  private earthLane(samples: { x: number; z: number; th: number }[]): THREE.Mesh {
    const HW = MX_HALF_WIDTH;
    const lat = [-16, -12.6, -10, -8, -6.5, -5.5];
    for (let n = -5; n <= 5.001; n += 0.25) lat.push(Math.round(n * 100) / 100);
    lat.push(5.5, 6.5, 8, 10, 12.6, 16);
    const L = lat.length;
    const m = samples.length;
    const pos = new Float32Array(m * L * 3);
    const uv = new Float32Array(m * L * 2);
    const col = new Float32Array(m * L * 3);
    const smooth = (a: number, b: number, x: number) => {
      const t = clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };
    samples.forEach((p, i) => {
      const nx = -Math.sin(p.th);
      const nz = Math.cos(p.th);
      lat.forEach((n, j) => {
        const an = Math.abs(n);
        const k = i * L + j;
        const line = Math.max(Math.exp(-(((an - 1.3) / 0.35) ** 2)) * 0.7, Math.exp(-((an / 0.5) ** 2)) * 0.25);
        const noise = hash2(Math.floor(i * 0.8), Math.floor((n + 20) * 4));
        const grassy = smooth(HW + 0.2, HW + 1.6, an);
        const y = an > HW + 4 ? -0.12 : 0.02 - 0.03 * line + 0.01 * (noise - 0.5) * (1 - line);
        const shade = 1.02 - 0.3 * line * (1 - grassy) + 0.1 * (noise - 0.5);
        const vg = this.theme.verge;
        pos[k * 3] = p.x + nx * n;
        pos[k * 3 + 1] = y;
        pos[k * 3 + 2] = p.z + nz * n;
        uv[k * 2] = n / 1.6;
        uv[k * 2 + 1] = (i * 2) / 1.6;
        for (let q = 0; q < 3; q++) col[k * 3 + q] = clamp(shade * (1 + (vg[q] - 1) * grassy), 0, 1.3);
      });
    });
    const idx: number[] = [];
    for (let i = 0; i < m - 1; i++)
      for (let j = 0; j < L - 1; j++) {
        const a = i * L + j;
        const b = (i + 1) * L + j;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, this.earth);
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * The parametric jumps of the circuit (jumps.ts): the mesh is sampled from the very function the
   * physics rides, in world coordinates, in the same dark wet earth. Edit a circuit's `jumps` list
   * in track.ts and both the shape and the collision follow.
   */
  private buildJumps(): void {
    for (const [list, cruise] of [[MX_FEATURES, false], [MX_FEATURES_CRUISE, true]] as const) for (const f of list) {
      if (!f.spec) continue;
      const spec = f.spec;
      const nu = Math.ceil(f.len / 0.3) + 1;
      const lat: number[] = [];
      for (let n = -JUMP_HALF_W; n <= JUMP_HALF_W + 0.001; n += n < -JUMP_FLAT || n >= JUMP_FLAT ? 0.4 : 0.5) lat.push(Math.round(n * 100) / 100);
      const L = lat.length;
      const pos = new Float32Array(nu * L * 3);
      const uv = new Float32Array(nu * L * 2);
      const col = new Float32Array(nu * L * 3);
      const c = Math.cos(f.pth);
      const sn = Math.sin(f.pth);
      for (let i = 0; i < nu; i++) {
        const t = Math.min(f.len, (i * f.len) / (nu - 1));
        for (let j = 0; j < L; j++) {
          const n = lat[j];
          const h = jumpHeight(spec, t, n) + mxBase(f.s0 + t);
          const k = i * L + j;
          const a = t - f.len / 2;
          const noise = hash2(Math.floor(t * 1.7) + 31 * this.circuit, Math.floor((n + 20) * 3));
          pos[k * 3] = f.px + a * c - n * sn;
          pos[k * 3 + 1] = h + (Math.abs(n) > JUMP_FLAT + JUMP_SKIRT - 0.01 ? -0.03 : 0.03) + 0.008 * noise;
          pos[k * 3 + 2] = f.pz + a * sn + n * c;
          uv[k * 2] = n / 1.6;
          uv[k * 2 + 1] = (f.s0 + t) / 1.6;
          // packed, wet earth: darker on the flat top and the faces, a bit paler at the foot
          const v = 1.18 + 0.08 * noise + 0.1 * Math.min(1, (h - mxBase(f.s0 + t)) / 2); // packed dirt, clearly lighter than the flat track, lightest on top
          col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = v;
        }
      }
      const idx: number[] = [];
      for (let i = 0; i < nu - 1; i++)
        for (let j = 0; j < L - 1; j++) {
          const a = i * L + j;
          const b = (i + 1) * L + j;
          idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      tintSlopes(g, 1.2);
      bakeLight(g, 1.2);
      const mesh = new THREE.Mesh(g, this.earth);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = cruise === this.cruiseView;
      (cruise ? this.cruiseMeshes : this.crossMeshes).push(mesh);
      this.scene.add(mesh);
    }
  }

  private buildTrack(): void {
    const loop = [];
    for (let s = 0; s < MX_LEN; s++) loop.push({ ...loopAt(s), h: 0 }); // flat: the jumps are the kit's pieces
    this.loopRibbon = this.ribbon(loop, true);
    this.scene.add(this.loopRibbon);
    // entry and exit lanes (cruising): straight, flat, a hair above the grass
    const out = MX_ENTRY + MX_LEN + MX_STRAIGHT[1] - MX_STRAIGHT[0];
    for (const [from, to] of [[-40, MX_ENTRY + 2], [out - 2, out + MX_EXIT + 40]] as [number, number][]) {
      const lane = [];
      for (let u = from; u <= to; u += 2) {
        const p = mxPose(u, true);
        lane.push({ x: p.x, z: p.z, th: p.th, k: 0, h: 0 });
      }
      const mesh = this.earthLane(lane);
      mesh.position.y = -0.015;
      this.scene.add(mesh);
    }
  }

  /** Edge posts, start arch, a few banners: what makes it read as a race track. */
  /**
   * v2.48: what lines a real MX track: advertising boards on the outside of the straights and
   * turns, and a tape fence (posts and two red and white tapes) behind the earth bank. They follow
   * the relief and stay clear of the other parts of the loop and of the cruising lanes.
   */
  private buildTrackside(): void {
    const OUT = MX_HALF_WIDTH + MX_RUNOFF;
    const pts: [number, number, number][] = [];
    for (let s = 0; s < MX_LEN; s += 2) {
      const p = loopAt(s);
      pts.push([p.x, p.z, s]);
    }
    const lane: [number, number][] = [];
    const outL = MX_ENTRY + MX_LEN + MX_STRAIGHT[1] - MX_STRAIGHT[0];
    for (const [from, to] of [[-40, MX_ENTRY + 2], [outL - 2, outL + MX_EXIT + 40]] as [number, number][])
      for (let u = from; u <= to; u += 3) {
        const q = mxPose(u, true);
        lane.push([q.x, q.z]);
      }
    // is (x, z) far enough from every other part of the loop (arc distance > 40 m) and from the lanes?
    const clear = (x: number, z: number, s: number, r: number): boolean => {
      for (const [px, pz, ps] of pts) {
        let ds = Math.abs(ps - s);
        ds = Math.min(ds, MX_LEN - ds);
        if (ds > 40 && (px - x) ** 2 + (pz - z) ** 2 < r * r) return false;
      }
      for (const [lx, lz] of lane) if ((lx - x) ** 2 + (lz - z) ** 2 < 11 * 11) return false;
      return true;
    };
    // ---- the tape fence: one strip per side, cut where it would cross something
    const tapeCv = document.createElement('canvas');
    tapeCv.width = 128;
    tapeCv.height = 64;
    const tc = tapeCv.getContext('2d')!;
    tc.fillStyle = '#3a3a3a';
    tc.fillRect(0, 0, 6, 64); // post
    for (const y of [10, 34]) for (let x = 0; x < 128; x += 16) {
      tc.fillStyle = (x / 16) % 2 ? '#f4f4f4' : '#e0322a';
      tc.fillRect(x, y, 16, 7);
    }
    const tapeTex = new THREE.CanvasTexture(tapeCv);
    tapeTex.colorSpace = THREE.SRGBColorSpace;
    tapeTex.wrapS = THREE.RepeatWrapping;
    const tapeMat = new THREE.MeshLambertMaterial({ map: tapeTex, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide });
    const FN = OUT + 3.4;
    for (const side of [-1, 1]) {
      let pos: number[] = [];
      let uv: number[] = [];
      const flush = () => {
        if (pos.length >= 12) {
          const idx: number[] = [];
          for (let i = 0; i < pos.length / 6 - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
          g.setIndex(idx);
          g.computeVertexNormals();
          this.scene.add(new THREE.Mesh(g, tapeMat));
        }
        pos = [];
        uv = [];
      };
      for (let s = 0; s <= MX_LEN; s += 1.5) {
        const p = loopAt(s % MX_LEN);
        const n = side * FN;
        const x = p.x - Math.sin(p.th) * n;
        const z = p.z + Math.cos(p.th) * n;
        if (!clear(x, z, s % MX_LEN, FN + 1.5)) {
          flush();
          continue;
        }
        const y = mxBase(s);
        pos.push(x, y, z, x, y + 1.05, z);
        uv.push(s / 3, 0, s / 3, 1);
      }
      flush();
    }
    // ---- advertising boards (invented brands), 6 m x 1.1 m, on the outside
    const brands: [string, string, string][] = [
      ['TERRAX', '#ffd400', '#111111'], ['KROSS OIL', '#e8392f', '#ffffff'], ['VELOXA', '#1b4fd8', '#ffffff'], ['MUDKING', '#111111', '#7cd63a'],
      ['GRIPTEK', '#ffffff', '#e8392f'], ['BRAAP', '#ff7a1a', '#111111'], ['DUNEWAX', '#0f8a6a', '#ffffff'], ['MOTOXPLOSION', '#14161c', '#ff7a1a'],
    ];
    const boardMats = brands.map(([name, bg, fg]) => {
      const cv = document.createElement('canvas');
      cv.width = 512;
      cv.height = 96;
      const c = cv.getContext('2d')!;
      c.fillStyle = bg;
      c.fillRect(0, 0, 512, 96);
      c.fillStyle = fg;
      c.fillRect(0, 84, 512, 12);
      c.font = `italic 900 ${name.length > 9 ? 54 : 64}px Arial Black, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(name, 256, 44);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return new THREE.MeshLambertMaterial({ map: t });
    });
    const back = new THREE.MeshLambertMaterial({ color: 0x3a3d44 });
    const boardGeo = new THREE.BoxGeometry(6, 1.1, 0.08);
    let b = 0;
    for (let s = 8; s < MX_LEN - 6; s += 9) {
      const p = loopAt(s);
      // outside of the turn, or alternate sides on the straights
      const side = Math.abs(p.k) > 0.01 ? -Math.sign(p.k) : (Math.floor(s / 27) % 2 ? 1 : -1);
      if (Math.abs(p.k) < 0.01 && hash2(Math.floor(s), 3) < 0.35) continue;
      const n = side * (OUT + 2.6);
      const x = p.x - Math.sin(p.th) * n;
      const z = p.z + Math.cos(p.th) * n;
      if (!clear(x, z, s, OUT + 5)) continue;
      const board = new THREE.Mesh(boardGeo, [back, back, back, back, side > 0 ? back : boardMats[b % boardMats.length], side > 0 ? boardMats[b % boardMats.length] : back]);
      board.position.set(x, mxBase(s) + 0.7, z);
      board.rotation.y = -p.th;
      board.castShadow = true;
      this.scene.add(board);
      b++;
    }
  }

  private buildMarkers(): void {
    // v2.55: yellow stakes 30 % bigger and a white string tied along the edge of the playable zone.
    // Race view and cruising view each get their own set (their jumps are not the same).
    const STAKE = 1.3;
    const stakeGeo = new THREE.BoxGeometry(0.07 * STAKE, 0.8 * STAKE, 0.07 * STAKE);
    const stakeMat = new THREE.MeshLambertMaterial({ color: 0xf2d21b });
    const stringGeo = new THREE.BoxGeometry(1, 1, 1);
    const stringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const STRING_H = 0.8 * STAKE * 0.88; // a little under the top of the stakes
    const STRING_W = 0.08;
    // where the cruising lanes meet the loop, the string leaves the way open
    const laneGap: [number, number][] = [];
    for (const [from, to] of [[-40, MX_ENTRY + 2], [MX_ENTRY + MX_LEN + MX_STRAIGHT[1] - MX_STRAIGHT[0] - 2, MX_ENTRY + MX_LEN + MX_STRAIGHT[1] - MX_STRAIGHT[0] + MX_EXIT + 40]] as [number, number][])
      for (let u = from; u <= to; u += 2) {
        const lp = mxPose(u, true);
        laneGap.push([lp.x, lp.z]);
      }
    const GAP = MX_HALF_WIDTH + 1.5;
    const inGap = (x: number, z: number): boolean => {
      for (const [lx, lz] of laneGap) if ((lx - x) ** 2 + (lz - z) ** 2 < GAP * GAP) return true;
      return false;
    };
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const X = new THREE.Vector3(1, 0, 0);
    for (const cruise of [false, true]) {
      const edge = (s: number, side: number): THREE.Vector3 => {
        const p = loopAt(s);
        const n = side * (MX_HALF_WIDTH + 0.5);
        return new THREE.Vector3(p.x - Math.sin(p.th) * n, bankAt(p.k, side * MX_HALF_WIDTH) + loopHeightN(s, n, cruise), p.z + Math.cos(p.th) * n);
      };
      const group = new THREE.Group();
      const posts = new THREE.InstancedMesh(stakeGeo, stakeMat, Math.ceil(MX_LEN / 8) * 2);
      let i = 0;
      for (let s = 0; s < MX_LEN; s += 8) {
        for (const side of [-1, 1]) {
          const e = edge(s, side);
          if (cruise && inGap(e.x, e.z)) continue;
          m.makeTranslation(e.x, e.y + 0.4 * STAKE, e.z);
          posts.setMatrixAt(i++, m);
        }
      }
      posts.count = i;
      posts.castShadow = true;
      group.add(posts);
      const STEP = 1.5;
      const segs: [THREE.Vector3, THREE.Vector3][] = [];
      for (const side of [-1, 1]) {
        let prev: THREE.Vector3 | null = null;
        for (let s = 0; s <= MX_LEN + 1e-6; s += STEP) {
          const e = edge(s, side);
          e.y += STRING_H;
          const open = cruise && inGap(e.x, e.z);
          if (prev && !open) segs.push([prev, e]);
          prev = open ? null : e;
        }
      }
      const strings = new THREE.InstancedMesh(stringGeo, stringMat, segs.length);
      segs.forEach(([a, b], k) => {
        dir.subVectors(b, a);
        const len = dir.length();
        q.setFromUnitVectors(X, dir.multiplyScalar(1 / len));
        sc.set(len + 0.04, STRING_W, STRING_W);
        m.compose(a.clone().add(b).multiplyScalar(0.5), q, sc);
        strings.setMatrixAt(k, m);
      });
      group.add(strings);
      group.visible = cruise === this.cruiseView;
      (cruise ? this.cruiseMeshes : this.crossMeshes).push(group);
      this.scene.add(group);
    }
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
      if (f.mod < 0) continue; // parametric jumps have their own mesh (buildJumps)
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
    const hills: [number, number, number][] = [];
    for (let s = 0; s < MX_LEN; s += 4) {
      const p = loopAt(s);
      line.push([p.x, p.z]);
      const b = mxBase(s);
      if (b > 0.05) hills.push([p.x, p.z, b]);
    }
    // height of the grass slopes around the relief of the loop (a tree there stands on it, not in it)
    const groundAt = (x: number, z: number): number => {
      let h = 0;
      const OUT = MX_HALF_WIDTH + MX_RUNOFF;
      for (const [hx, hz, b] of hills) {
        const d = Math.hypot(hx - x, hz - z);
        const t = clamp((d - OUT - 2.2) / skirtW(b), 0, 1);
        h = Math.max(h, b * (1 - t * t * (3 - 2 * t)));
      }
      return h;
    };
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
    // the slopes around the loop, then the hills of the world's ground further away
    const groundY = (x: number, z: number): number => groundAt(x, z) + this.terrain.heightAt(x, z);
    const shaded: { x: number; z: number; w: number }[] = [];
    const put = (list: { mat: THREE.SpriteMaterial; sp: { w: number; h: number; ax: number; ay: number } }[], x: number, z: number, k: number, shadow = false) => {
      const { mat, sp } = list[Math.floor(rnd() * list.length)];
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(sp.w * k, sp.h * k, 1);
      sprite.center.set(sp.ax / sp.w, 1 - sp.ay / sp.h);
      sprite.position.set(x, groundY(x, z) - 0.05, z);
      this.scene.add(sprite);
      if (shadow) shaded.push({ x, z, w: Math.min(9, sp.w * k * 0.7) });
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
      put(list, x, z, (bush ? 0.9 : 1.1) + rnd() * 0.7, true);
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
    this.safe('tree shadows', () => this.scene.add(treeShadows(shaded, groundY)));
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

  /** Low quality (no shadow map): a soft shadow on the ground under a bike, lying on the slope it is over. */
  private blob(bike: Bike, zone: { x0: number; h0: number; cruise: boolean }, n: number): void {
    if (!this.blobs) return;
    const u = bike.x - zone.x0;
    const pose = mxPose(u, zone.cruise);
    const at = (du: number): number => {
      const q = mxPose(u + du, zone.cruise);
      return (Number.isNaN(q.s) ? 0 : loopHeightN(q.s, n, zone.cruise)) + bankAt(q.k, n);
    };
    const y = at(0);
    const [, oy] = bike.pointWorld(0, 0);
    this.blobs.add(pose.x - Math.sin(pose.th) * n, y, pose.z + Math.cos(pose.th) * n, pose.th, (at(0.7) - at(-0.7)) / 1.4, oy - zone.h0 - y - 0.5);
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
    this.wind.value = this.time;
    this.blobs?.begin();
    // ---- bikes
    const crashed = !!(game.ragdoll && game.crashTimer > 0);
    player.lane = 0;
    player.steer = crashed ? 0 : game.mxBar;
    player.update(b, dt, crashed);
    const car = this.place(player, b, zone, game.mxN, game.mxPsi + game.mxDrift, game.mxLean);
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
      if (!renderer.shadowMap.enabled) this.blob(o.bike, zone, o.mxN ?? 0);
    }
    if (!renderer.shadowMap.enabled && !crashed) this.blob(b, zone, game.mxN);
    this.blobs?.end(!renderer.shadowMap.enabled);
    // ---- camera: third person, smooth; it does not take the bike's knocks
    const u = b.x - zone.x0;
    const pose = mxPose(u, zone.cruise);
    const ahead = mxPose(u + 7, zone.cruise);
    const far = mxPose(u + 16, zone.cruise);
    const wx = pose.x - Math.sin(pose.th) * game.mxN;
    const wz = pose.z + Math.cos(pose.th) * game.mxN;
    const [, oy] = b.pointWorld(0, 0);
    const bikeY = oy - zone.h0;
    // heading the camera settles behind: mostly the track just ahead, a little the bike itself
    let wantYaw = ahead.th + game.mxPsi * 0.35;
    let d = wantYaw - this.camYaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    wantYaw = this.camYaw + d;
    const targetY = bikeY + clamp(b.vy, -12, 12) * 0.05; // the rider's height, a hair ahead of where it is going
    if (this.fresh) {
      this.camYaw = wantYaw;
      this.camY = targetY;
    } else {
      this.camYaw += (wantYaw - this.camYaw) * Math.min(1, dt * 2.2); // turns into the bends a bit slower
      // height: quick, and never left behind (a jump or a drop must not run away from the lens)
      this.camY += (targetY - this.camY) * Math.min(1, dt * 12);
      this.camY = clamp(this.camY, targetY - 0.4, targetY + 0.4);
    }
    const sw = swing * swing * (3 - 2 * swing);
    const yaw = this.camYaw - sw * 1.2; // swinging in from the side the 2.5D camera sits on
    const dist = 3.3 + clamp((b.forwardSpeed - 20.8) / 25, -1, 1) * 0.15 + sw * 2.5; // MXGP-like chase view: 3.6 m behind, give or take 15 cm
    const want = new THREE.Vector3(wx - Math.cos(yaw) * dist, this.camY + 1.55 + sw * 0.6 /* just above the helmet: bike and wheels well in view */, wz - Math.sin(yaw) * dist);
    if (this.fresh) this.camPos.copy(want);
    else {
      const k = Math.min(1, dt * 30); // a tight follow: a lag would let the bike run into / away from the lens when it brakes or accelerates
      this.camPos.x += (want.x - this.camPos.x) * k;
      this.camPos.z += (want.z - this.camPos.z) * k;
      this.camPos.y += (want.y - this.camPos.y) * Math.min(1, dt * 12);
    }
    // look a few metres ahead of the bike, and a touch towards where the track goes next
    const lx = wx + Math.cos(this.camYaw) * 2.6 * 0.85 + (far.x - wx) * 0.15;
    const lz = wz + Math.sin(this.camYaw) * 2.6 * 0.85 + (far.z - wz) * 0.15;
    const lookWant = new THREE.Vector3(lx, this.camY + 0.6, lz); // the bike sits near the middle of the screen
    if (this.fresh) this.look.copy(lookWant);
    else {
      this.look.x += (lookWant.x - this.look.x) * Math.min(1, dt * 8);
      this.look.z += (lookWant.z - this.look.z) * Math.min(1, dt * 8);
      this.look.y += (lookWant.y - this.look.y) * Math.min(1, dt * 14);
    }
    this.fresh = false;
    this.camera.aspect = aspect;
    this.camera.fov = 70; // wide, like the reference chase cameras
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.camPos);
    if (game.shake > 0) this.camera.position.y += (Math.random() - 0.5) * game.shake * game.shake * 0.12;
    this.camera.lookAt(this.look);
    this.camera.updateMatrixWorld();
    this.sky?.dome.position.copy(this.camera.position);
    // sun and its shadow follow the bike
    this.sun.position.set(wx + SUN[0] * 70, SUN[1] * 70, wz + SUN[2] * 70); // a lower sun: long shadows behind the jumps
    this.sun.target.position.set(wx, 0, wz);
    this.sun.castShadow = renderer.shadowMap.enabled;

    this.updateCoins(game, zone);
    this.updateDust(game, dt, car);
    this.updateSmoke(game, dt, car);
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

  /** Exhaust smoke at the silencer: it drifts 20 cm (idle) to 1 m (full power) behind the pipe and vanishes; none for the electric bike. */
  private updateSmoke(game: Game, dt: number, car: THREE.Group): void {
    const thr = game.input.throttle;
    if (!game.model.electric && game.crashTimer <= 0) this.smokeAcc += smokeRate(thr) * dt;
    else this.smokeAcc = 0;
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1;
      const i = this.smokeI++ % this.smokeN;
      this.smokeL[i] = 1;
      this.smokeV[i * 3] = 0.2 + 0.8 * thr * (0.7 + 0.3 * Math.random()); // drift distance (m)
      this.smokeV[i * 3 + 1] = 0.35 + thr * 0.3 + Math.random() * 0.1; // lifetime (s)
      this.smokeV[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
      this.smokeS[i] = 0.1 + thr * 0.3;
    }
    const [tx, ty] = game.exhaustTip();
    const [dx, dy] = game.exhaustDir();
    const local = new THREE.Vector3();
    car.updateMatrixWorld(true);
    for (let i = 0; i < this.smokeN; i++) {
      if (this.smokeL[i] <= 0) {
        this.smokeA[i] = 0;
        continue;
      }
      const life = this.smokeV[i * 3 + 1];
      this.smokeL[i] -= dt / life;
      const age = 1 - Math.max(0, this.smokeL[i]);
      const sdist = 0.04 + this.smokeV[i * 3] * (1 - (1 - age) * (1 - age));
      local.set(tx + dx * sdist, ty + dy * sdist + 0.1 * age, 0.22 + this.smokeV[i * 3 + 2]);
      car.localToWorld(local);
      this.smokeP.set([local.x, local.y, local.z], i * 3);
      this.smokeS[i] = Math.max(this.smokeS[i], 0.1) * (1 + 2.2 * dt);
      this.smokeA[i] = Math.max(0, this.smokeL[i]) * Math.min(0.4, 0.07 + this.smokeS[i] * 0.4);
    }
    this.smoke.geometry.attributes.position.needsUpdate = true;
    this.smoke.geometry.attributes.alpha.needsUpdate = true;
    this.smoke.geometry.attributes.psize.needsUpdate = true;
  }

  /** Dust thrown up by the rear wheel: more with speed, throttle and slides. */
  private updateDust(game: Game, dt: number, car: THREE.Group): void {
    const b = game.bike;
    // the rear tyre scuffs the dirt at `scuff` m/s (wheelspin, locked wheel, power slide): that is what
    // throws the dust, on top of the plain rolling dust that grows with speed
    const scuff = Math.abs(b.rear.slip) + game.mxSlide * 6 + game.mxSlideR * 6;
    const rate = b.rear.contact && game.crashTimer <= 0 ? Math.min(1100, Math.abs(b.forwardSpeed) * 2.6 + scuff * 75 + game.input.throttle * 30 + (game.mxSlideR + game.mxSlideF) * 160) : 0;
    const thick = Math.min(2.4, 0.6 + scuff / 3.2);
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
      this.dustL[i] -= dt / 1.8;
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
