import * as THREE from 'three';
import { clamp } from '../core/math';
import { loopAt, mxBase, mxPose, MX_ENTRY, MX_EXIT, MX_FEATURES, MX_FEATURES_CRUISE, MX_HALF_WIDTH, MX_LEN, MX_RUNOFF, MX_STRAIGHT } from './track';

/**
 * v2.57 — what dresses the 3D circuit beyond the track itself: a sky dome that carries on above the
 * painted panorama (with the sun in it), rolling ground far from the track, tufts of grass that move
 * in the wind along the verges, a soft shadow under every tree, feather flags on the main straight
 * and a blob shadow under the bikes when the real shadows are off.
 */

export const hash2 = (a: number, b: number): number => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Direction towards the sun (also used to bake light and shade into the earth, shadows on or off). */
export const SUN = (() => {
  const v = [-0.62, 0.62, 0.48];
  const l = Math.hypot(v[0], v[1], v[2]);
  return v.map((x) => x / l) as [number, number, number];
})();

/** Width of the grass slope that brings the relief under the loop back down to the ground (m). */
export const skirtW = (b: number) => 3 + 4 * b;

/** Smooth value noise in [0, 1] on a grid of `cell` metres. */
export function vnoise(x: number, z: number, cell: number, salt: number): number {
  const fx = x / cell, fz = z / cell;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const ax = fx - ix, az = fz - iz;
  const sx = ax * ax * (3 - 2 * ax), sz = az * az * (3 - 2 * az);
  const h = (a: number, b: number) => hash2(a * 7 + salt, b * 13 - salt);
  return (h(ix, iz) * (1 - sx) + h(ix + 1, iz) * sx) * (1 - sz) + (h(ix, iz + 1) * (1 - sx) + h(ix + 1, iz + 1) * sx) * sz;
}

/** Height of the banking on the outside of a turn (m) at lateral offset n. */
export function bankAt(k: number, n: number): number {
  const B = clamp((Math.abs(k) - 0.012) * 45, 0, 1) * 1.5;
  const out = (-Math.sign(k) * n) / MX_HALF_WIDTH; // > 0 on the outside of the turn
  return out > 0 ? B * Math.pow(Math.min(1.4, out), 1.6) : 0;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Points of the loop (every 4 m, with their arc length) and of the cruising lanes. */
export interface TrackLine {
  loop: [number, number, number][];
  lanes: [number, number][];
}
export function trackLine(): TrackLine {
  const loop: [number, number, number][] = [];
  for (let s = 0; s < MX_LEN; s += 4) {
    const p = loopAt(s);
    loop.push([p.x, p.z, s]);
  }
  const lanes: [number, number][] = [];
  const out = MX_ENTRY + MX_LEN + MX_STRAIGHT[1] - MX_STRAIGHT[0];
  for (const [from, to] of [[-40, MX_ENTRY + 2], [out - 2, out + MX_EXIT + 60]] as [number, number][])
    for (let u = from; u <= to; u += 4) {
      const q = mxPose(u, true);
      lanes.push([q.x, q.z]);
    }
  return { loop, lanes };
}

/** Is (x, z) at least r from every other part of the loop (arc distance > 40 m) and laneR from the lanes? */
function clearOf(line: TrackLine, x: number, z: number, s: number, r: number, laneR: number): boolean {
  for (const [px, pz, ps] of line.loop) {
    let ds = Math.abs(ps - s);
    ds = Math.min(ds, MX_LEN - ds);
    if (ds > 40 && (px - x) ** 2 + (pz - z) ** 2 < r * r) return false;
  }
  for (const [lx, lz] of line.lanes) if ((lx - x) ** 2 + (lz - z) ** 2 < laneR * laneR) return false;
  return true;
}

// ---------------------------------------------------------------- ground

/**
 * The ground around the circuit: flat near the track, rolling further away (hills that hide the
 * foot of the painted panorama), with large lighter and darker patches so the texture does not
 * read as tiles.
 */
export class Terrain {
  readonly mesh: THREE.Mesh;
  private readonly N = 150;
  private readonly SIZE = 1500;
  private h: Float32Array;

  constructor(private cx: number, private cz: number, amp: number, line: TrackLine, material: THREE.Material) {
    const N = this.N;
    const g = new THREE.PlaneGeometry(this.SIZE, this.SIZE, N, N).rotateX(-Math.PI / 2);
    const P = g.attributes.position.array as Float32Array;
    const count = (N + 1) * (N + 1);
    const col = new Float32Array(count * 3);
    this.h = new Float32Array(count);
    const pts: [number, number][] = [...line.loop.map(([x, z]) => [x, z] as [number, number]), ...line.lanes];
    for (let i = 0; i < count; i++) {
      const x = P[i * 3] + cx;
      const z = P[i * 3 + 2] + cz;
      let d2 = 1e12;
      for (const [px, pz] of pts) {
        const q = (px - x) ** 2 + (pz - z) ** 2;
        if (q < d2) d2 = q;
      }
      const rise = smooth(45, 170, Math.sqrt(d2));
      const f = 0.62 * vnoise(x, z, 95, 41) + 0.38 * vnoise(x, z, 38, 57);
      const y = amp * rise * (0.12 + 0.88 * f);
      this.h[i] = y;
      P[i * 3 + 1] = y;
      const m = 0.84 + 0.3 * vnoise(x, z, 55, 23);
      const w = (vnoise(x, z, 24, 71) - 0.5) * 0.14;
      col[i * 3] = m * (1 + w);
      col[i * 3 + 1] = m;
      col[i * 3 + 2] = m * (1 - w);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.position.set(cx, -0.06, cz);
    this.mesh.receiveShadow = true;
  }

  /** Height of the ground at (x, z): the very triangles of the mesh, so nothing floats or sinks. */
  heightAt(x: number, z: number): number {
    const N = this.N;
    const cell = this.SIZE / N;
    const gx = clamp((x - this.cx + this.SIZE / 2) / cell, 0, N - 1e-6);
    const gz = clamp((z - this.cz + this.SIZE / 2) / cell, 0, N - 1e-6);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const a = this.h[iz * (N + 1) + ix];
    const b = this.h[(iz + 1) * (N + 1) + ix];
    const c = this.h[(iz + 1) * (N + 1) + ix + 1];
    const d = this.h[iz * (N + 1) + ix + 1];
    return fx + fz <= 1 ? a + (d - a) * fx + (b - a) * fz : c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
  }
}

// ---------------------------------------------------------------- sky

const rgb = (hex: number): THREE.Vector3 => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);

/**
 * A dome that follows the camera: the colour of the top of the panorama near it, a deeper blue
 * towards the zenith, and the sun with its halo where the light of the scene comes from.
 */
export class Sky {
  readonly dome: THREE.Mesh;
  private low: THREE.Vector3;
  private high = new THREE.Vector3();

  constructor(bg: number) {
    this.low = rgb(bg);
    this.setHorizon(this.low.x, this.low.y, this.low.z);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      uniforms: { uLow: { value: this.low }, uHigh: { value: this.high }, uSun: { value: new THREE.Vector3(SUN[0], SUN[1], SUN[2]) } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'uniform vec3 uLow; uniform vec3 uHigh; uniform vec3 uSun; varying vec3 vDir; void main(){ vec3 d = normalize(vDir); float t = smoothstep(0.3, 1.0, d.y); vec3 c = mix(uLow, uHigh, t); float s = max(dot(d, uSun), 0.0); c += vec3(1.0, 0.93, 0.78) * (pow(s, 900.0) * 1.2 + pow(s, 60.0) * 0.22 + pow(s, 8.0) * 0.07); gl_FragColor = vec4(c, 1.0); }',
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(700, 24, 12), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
  }

  /** Colour (display values, 0..1) the dome takes next to the panorama. */
  setHorizon(r: number, g: number, b: number): void {
    this.low.set(r, g, b);
    this.high.set(r * 0.5, g * 0.66, Math.min(1, b * 0.98));
  }
}

/** Average colour of the top edge of an image (0..1), or null if it cannot be read. */
export function topColor(img: unknown): [number, number, number] | null {
  try {
    const src = img as HTMLImageElement;
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 1;
    const g = c.getContext('2d')!;
    g.drawImage(src, 0, 0, src.width, Math.max(1, src.height * 0.03), 0, 0, 32, 1);
    const d = g.getImageData(0, 0, 32, 1).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < 32; i++) {
      r += d[i * 4];
      gg += d[i * 4 + 1];
      b += d[i * 4 + 2];
    }
    return [r / 32 / 255, gg / 32 / 255, b / 32 / 255];
  } catch {
    return null;
  }
}

/** Alpha of the panorama ring: opaque, fading out over its top seventh (into the sky dome). */
export function panoFade(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, '#000000');
  gr.addColorStop(0.14, '#ffffff');
  gr.addColorStop(1, '#ffffff');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------- soft shadows

let blobTex: THREE.CanvasTexture | null = null;
/** A soft round shadow (black, fading to nothing at the rim). */
function blobTexture(): THREE.CanvasTexture {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,1)');
  gr.addColorStop(0.45, 'rgba(0,0,0,0.75)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}
const blobMaterial = (opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

/**
 * The trees are flat sprites: they cast nothing. A soft shadow laid on the ground at the foot of
 * each one, stretched away from the sun and tilted with the slope, is what makes them stand on it.
 */
export function treeShadows(spots: { x: number; z: number; w: number }[], heightAt: (x: number, z: number) => number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), blobMaterial(0.5), Math.max(1, spots.length));
  const hl = Math.hypot(SUN[0], SUN[2]);
  const dx = -SUN[0] / hl;
  const dz = -SUN[2] / hl;
  const up = new THREE.Vector3(0, 1, 0);
  const qy = new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(-dz, dx));
  const qn = new THREE.Quaternion();
  const nrm = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const e = 1.5;
  spots.forEach((t, i) => {
    const len = t.w * 1.5;
    const x = t.x + dx * len * 0.3;
    const z = t.z + dz * len * 0.3;
    nrm.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
    qn.setFromUnitVectors(up, nrm).multiply(qy);
    m.compose(pos.set(x, heightAt(x, z) + 0.03, z), qn, sc.set(len, 1, t.w * 0.9));
    mesh.setMatrixAt(i, m);
  });
  mesh.count = spots.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.renderOrder = -2;
  mesh.frustumCulled = false;
  return mesh;
}

/** Shadows under the bikes when the real ones are off (low quality): one soft ellipse each, laid on the slope. */
export class BlobShadows {
  readonly mesh: THREE.InstancedMesh;
  private i = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, 'YZX');
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(private max = 9) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), blobMaterial(0.55), max);
    this.mesh.count = 0;
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
  }

  begin(): void {
    this.i = 0;
  }

  /** A shadow at (x, y, z) on ground heading `yaw` and climbing `slope` (rise over run); `air`: height of the bike above it (m). */
  add(x: number, y: number, z: number, yaw: number, slope: number, air: number): void {
    if (this.i >= this.max) return;
    const k = 1 - 0.45 * clamp(air / 5, 0, 1);
    this.e.set(0, -yaw, Math.atan(slope));
    this.q.setFromEuler(this.e);
    this.m.compose(this.p.set(x, y + 0.04, z), this.q, this.s.set(2.1 * k, 1, 0.95 * k));
    this.mesh.setMatrixAt(this.i++, this.m);
  }

  end(visible: boolean): void {
    this.mesh.count = this.i;
    this.mesh.visible = visible && this.i > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- wind

/** Makes a material sway: `code` moves `transformed` (the local position) using the `uTime` uniform. */
function sway(mat: THREE.Material, time: { value: number }, code: string, key: string): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${code}`);
  };
  mat.customProgramCacheKey = () => key;
}

// ---------------------------------------------------------------- grass

export interface TuftLook {
  /** Colour at the foot and at the tip of the blades. */
  base: string;
  tip: string;
  /** Share of the full count (1 = lush meadow, 0.3 = a few dry tufts). */
  n: number;
}

/** A tuft: a dozen blades fanning out from the ground, on a transparent sheet. */
function tuftTexture(look: TuftLook): THREE.CanvasTexture {
  const W = 128, H = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  let seed = 991;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 22; i++) {
    const x0 = 22 + rnd() * (W - 44);
    const h = H * (0.45 + 0.5 * rnd());
    const lean = (x0 - W / 2) * 0.35 + (rnd() - 0.5) * 22;
    const w = 3.5 + rnd() * 3;
    const gr = g.createLinearGradient(0, H, 0, H - h);
    gr.addColorStop(0, look.base);
    gr.addColorStop(1, look.tip);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x0 - w, H);
    g.quadraticCurveTo(x0 - w * 0.4 + lean * 0.35, H - h * 0.6, x0 + lean, H - h);
    g.quadraticCurveTo(x0 + w * 0.6 + lean * 0.35, H - h * 0.6, x0 + w, H);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Tufts of grass along the track: on the run-off beside it and on the ground behind the earth
 * bank, thinning out with the distance. Two crossed sheets per tuft, lit like the ground (their
 * normals point up) and moved by the wind.
 */
export function grassTufts(look: TuftLook, line: TrackLine, detail: number, salt: number, time: { value: number }): THREE.InstancedMesh | null {
  const total = Math.round(8000 * look.n * clamp(detail, 0.3, 1));
  if (total < 1) return null;
  // two crossed sheets, each drawn on both faces, every normal pointing up
  const pos: number[] = [];
  const uv: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (const a of [0.4, 0.4 + Math.PI / 2]) {
    const cx = Math.cos(a) * 0.5;
    const cz = Math.sin(a) * 0.5;
    const o = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let k = 0; k < 4; k++) nrm.push(0, 1, 0);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3, o, o + 2, o + 1, o, o + 3, o + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshLambertMaterial({ map: tuftTexture(look), alphaTest: 0.5 });
  sway(mat, time, '#ifdef USE_INSTANCING\n  transformed.x += sin(uTime * 1.8 + instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.29) * 0.1 * uv.y;\n  transformed.z += sin(uTime * 1.3 + instanceMatrix[3].z * 0.41) * 0.06 * uv.y;\n#endif', 'mx-tuft');
  const mesh = new THREE.InstancedMesh(geo, mat, total);

  const HW = MX_HALF_WIDTH;
  const OUT = HW + MX_RUNOFF;
  let seed = 7331 + salt * 131;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const onFeature = (s: number): boolean => {
    for (const list of [MX_FEATURES, MX_FEATURES_CRUISE]) for (const f of list) if (s > f.s0 - 1.5 && s < f.s0 + f.len + 1.5) return true;
    return false;
  };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p3 = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tint = new THREE.Color();
  let n = 0;
  for (let tries = 0; tries < total * 4 && n < total; tries++) {
    const s = rnd() * MX_LEN;
    const side = rnd() < 0.5 ? -1 : 1;
    const near = rnd() < 0.3;
    const r = rnd();
    const an = near ? HW + 1.1 + (OUT - 0.5 - HW - 1.1) * rnd() : OUT + 2.7 + (26 - OUT - 2.7) * r * r;
    if (near && onFeature(s)) continue; // the feet of the jumps spread over the run-off
    const p = loopAt(s);
    const x = p.x - Math.sin(p.th) * side * an;
    const z = p.z + Math.cos(p.th) * side * an;
    if (!clearOf(line, x, z, s, OUT + 3, 13)) continue;
    const base = mxBase(s);
    let y: number;
    if (near) y = base + bankAt(p.k, side * HW);
    else {
      const fall = smooth(OUT + 2.2, OUT + 2.2 + skirtW(base), an);
      y = base * (1 - fall) - 0.12 * (base < 0.05 ? 1 : fall);
    }
    const w = 0.5 + rnd() * 0.45;
    const h = (near ? 0.2 : 0.26) + rnd() * 0.22 + (near ? 0 : 0.22 * r);
    q.setFromAxisAngle(up, rnd() * Math.PI);
    m.compose(p3.set(x, y - 0.03, z), q, sc.set(w, h, w));
    mesh.setMatrixAt(n, m);
    const v = 0.78 + rnd() * 0.3;
    mesh.setColorAt(n, tint.setRGB(v, v, v * (0.9 + rnd() * 0.1)));
    n++;
  }
  if (n === 0) return null;
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------- flags

/** Feather flags behind the tape on both sides of the main straight, flapping in the wind. */
export function featherFlags(line: TrackLine, time: { value: number }): THREE.Group {
  const group = new THREE.Group();
  const OUT = MX_HALF_WIDTH + MX_RUNOFF;
  const looks: [string, string][] = [['#ff7a1a', '#14161c'], ['#e8392f', '#ffffff'], ['#1b4fd8', '#ffffff'], ['#ffd400', '#111111']];
  const spots: { x: number; y: number; z: number; rot: number }[][] = looks.map(() => []);
  let k = 0;
  for (let s = MX_STRAIGHT[0] + 14; s < MX_STRAIGHT[1] - 8; s += 13) {
    const p = loopAt(s);
    for (const side of [-1, 1]) {
      const n = side * (OUT + 4.7);
      const x = p.x - Math.sin(p.th) * n;
      const z = p.z + Math.cos(p.th) * n;
      if (!clearOf(line, x, z, s, OUT + 6, 0)) continue;
      // the cloth faces the riders and hangs on the track side of its pole
      spots[k++ % looks.length].push({ x, y: mxBase(s), z, rot: Math.PI / 2 - p.th + (side < 0 ? Math.PI : 0) });
    }
  }
  const all = spots.flat();
  if (!all.length) return group;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 4.5, 6).translate(0, 2.25, 0), new THREE.MeshLambertMaterial({ color: 0xd8dade }), all.length);
  all.forEach((f, i) => poles.setMatrixAt(i, m.compose(pos.set(f.x, f.y, f.z), q.identity(), one)));
  poles.castShadow = true;
  group.add(poles);
  const cloth = new THREE.PlaneGeometry(0.85, 3.3, 3, 10).translate(0.445, 2.8, 0);
  looks.forEach(([bg, fg], i) => {
    if (!spots[i].length) return;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = bg;
    g.fillRect(0, 0, 64, 256);
    g.fillStyle = fg;
    g.fillRect(0, 196, 64, 14);
    g.fillRect(0, 216, 64, 6);
    g.font = '900 44px Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    ['M', 'X'].forEach((ch, j) => g.fillText(ch, 32, 60 + j * 62));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    sway(mat, time, '#ifdef USE_INSTANCING\n  transformed.z += sin(uTime * 4.2 + position.y * 2.3 + instanceMatrix[3].x * 0.7) * 0.16 * position.x;\n#endif', 'mx-flag');
    const flags = new THREE.InstancedMesh(cloth, mat, spots[i].length);
    spots[i].forEach((f, j) => flags.setMatrixAt(j, m.compose(pos.set(f.x, f.y, f.z), q.setFromAxisAngle(up, f.rot), one)));
    flags.castShadow = true;
    flags.frustumCulled = false;
    group.add(flags);
  });
  return group;
}

// ---------------------------------------------------------------- earth relief

/**
 * A normal map drawn from a painted canvas (its brightness read as height), so the clods and the
 * pebbles of the earth catch the sun instead of lying flat.
 */
export function normalFromCanvas(src: HTMLCanvasElement, strength: number): THREE.CanvasTexture | null {
  try {
    const S = src.width;
    const data = src.getContext('2d')!.getImageData(0, 0, S, S).data;
    const hgt = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) hgt[i] = (data[i * 4] * 0.3 + data[i * 4 + 1] * 0.6 + data[i * 4 + 2] * 0.1) / 255;
    const at = (x: number, y: number) => hgt[((y + S) % S) * S + ((x + S) % S)];
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const out = g.createImageData(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        // a wide stencil: the single-pixel grain must not turn into glitter
        const dx = (at(x + 2, y) + at(x + 1, y) - at(x - 1, y) - at(x - 2, y)) * strength;
        const dy = (at(x, y + 2) + at(x, y + 1) - at(x, y - 1) - at(x, y - 2)) * strength;
        const l = Math.hypot(dx, dy, 1);
        const o = (y * S + x) * 4;
        out.data[o] = (-dx / l * 0.5 + 0.5) * 255;
        out.data[o + 1] = (dy / l * 0.5 + 0.5) * 255;
        out.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
        out.data[o + 3] = 255;
      }
    g.putImageData(out, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  } catch {
    return null;
  }
}
