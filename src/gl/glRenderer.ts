import { outfitById, type Outfit } from '../outfits';
import { Backdrop, paintPanorama, panoramaAt } from './panoramas';
import * as THREE from 'three';
import type { Assets } from '../assets';
import { approach, clamp } from '../core/math';
import type { Game } from '../game';
import { Background } from '../render/background';
import { pickupSprite } from '../render/sprites';
import type { Pickup } from '../world/types';
import { Biome, Bridge, CHUNK_SAMPLES, DX } from '../world/types';
import type { World } from '../world/world';
import { Bike3D, disposeObject } from './bike3d';
import { MxScene } from '../mx/scene';
import type { BikeModel } from '../bikes';
import type { Opponent } from '../ai';
import { BridgeBuilder } from './bridges';
import { ChunkVisual, TerrainBuilder } from './terrain';
import { spriteGeometry, TextureBank } from './textures';

export type Quality = 'haute' | 'moyenne' | 'basse';

interface QualityPreset {
  pixelRatio: number;
  antialias: boolean;
  shadows: number; // shadow map size, 0 = blob shadow only
  trees: number;
}
const PRESETS: Record<Quality, QualityPreset> = {
  haute: { pixelRatio: 2, antialias: true, shadows: 2048, trees: 1 },
  moyenne: { pixelRatio: 1.5, antialias: true, shadows: 1024, trees: 0.65 },
  basse: { pixelRatio: 1, antialias: false, shadows: 0, trees: 0.35 },
};

const CHUNK_M = CHUNK_SAMPLES * DX;
const FOV = 32;

/**
 * WebGL renderer (Three.js). The world is a real 3D scene seen through a perspective camera
 * from the side (2.5D): track band, field and hills in depth, painted backdrop far away,
 * billboard trees, 3D bridges, a 3D bike with its rider, dust particles.
 */
const RAIN_DROPS = 700;
const GREY_SKY = new THREE.Color(0x8e97a3);
const SNOW_SKY = new THREE.Color(0xd6dce6);
const SNOW_FLAKES = 900;
const skyTint = new THREE.Color();

/** Soft grey cloud deck (tileable horizontally), opaque at the top, fading downwards. */
function cloudTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(150,158,170,1)');
  grad.addColorStop(0.7, 'rgba(170,178,190,0.9)');
  grad.addColorStop(1, 'rgba(190,198,208,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 160; i++) {
    const x = rnd() * 1024;
    const y = 40 + rnd() * 150;
    const r = 30 + rnd() * 70;
    const shade = 120 + Math.floor(rnd() * 70);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.35 * (1 - y / 230);
    rg.addColorStop(0, `rgba(${shade},${shade + 8},${shade + 18},${a})`);
    rg.addColorStop(1, `rgba(${shade},${shade + 8},${shade + 18},0)`);
    for (const dx of [-1024, 0, 1024]) {
      g.save();
      g.translate(dx, 0);
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class GLRenderer {
  renderer!: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 1500);
  private host: HTMLElement;
  private quality: Quality;
  private bank: TextureBank | null = null;
  private terrain: TerrainBuilder | null = null;
  private bridgeBuilder: BridgeBuilder | null = null;
  private world: World | null = null;
  private chunks = new Map<number, ChunkVisual>();
  private bridges = new Map<Bridge, THREE.Group>();
  private pickups = new Map<Pickup, THREE.Group>();
  private sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
  private hemi = new THREE.HemisphereLight(0xd6ecff, 0x6b5a3c, 1.35);
  private backdrop: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private backdropTex: Record<string, { tex: THREE.Texture; aspect: number; horizon: number; sky: string; ground: string }> = {};
  private backdropKey = '';
  private lower: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private fade!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private fadeBd: Backdrop | undefined;
  private prevBd: Backdrop | undefined;
  private fadeT = 0;
  private frameDt = 0;
  bike3d = new Bike3D();
  private rivals = new Map<Opponent, Bike3D>();
  private coinMesh: THREE.InstancedMesh;
  private tagLayer: HTMLElement;
  private tags = new Map<Opponent, HTMLElement>();
  private blob: THREE.Mesh;
  private particles: THREE.Points;
  private pGeo = new THREE.BufferGeometry();
  private pPos = new Float32Array(300 * 3);
  private pCol = new Float32Array(300 * 4);
  private pSize = new Float32Array(300);
  private popupLayer: HTMLElement;
  private popupEls: HTMLElement[] = [];
  private zoom = 1;
  /** Dev: force the visible height (model inspection). */
  debugZoom = 0;
  private dip = 0;
  private sunset = 0;
  // ---- weather (0 sec → 1 nuageux → 2 pluie, smoothed)
  private rainL = 0;
  private snowL = 0;
  private snow!: THREE.Points;
  private snowPos = new Float32Array(SNOW_FLAKES * 3);
  private clouds: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private rain: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private rainPos = new Float32Array(RAIN_DROPS * 6);
  private lowerBase = new THREE.Color();
  private fogBase = new THREE.Color();
  private skyBase = new THREE.Color();
  camX = 0;
  camY = 0;
  private time = 0;
  private W = 1;
  private H = 1;

  constructor(host: HTMLElement, quality: Quality) {
    this.host = host;
    this.quality = quality;
    this.createRenderer();
    this.scene.background = new THREE.Color(0x2a7be4);
    this.scene.fog = new THREE.Fog(0xbfdcf5, 30, 150);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.position.set(-6, 14, 9);
    this.sun.shadow.camera.left = -6;
    this.sun.shadow.camera.right = 6;
    this.sun.shadow.camera.top = 5;
    this.sun.shadow.camera.bottom = -3;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 40;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;

    // painted backdrop (screen-locked plane far away, scrolls slowly = parallax)
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ fog: false, depthWrite: false, toneMapped: false }));
    this.backdrop.renderOrder = -2;
    this.backdrop.frustumCulled = false;
    this.lower = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ fog: false, depthWrite: false, toneMapped: false }));
    this.lower.renderOrder = -2;
    this.lower.frustumCulled = false;
    this.scene.add(this.backdrop, this.lower);
    this.fade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ fog: false, depthWrite: false, toneMapped: false, transparent: true }));
    this.fade.renderOrder = -2;
    this.fade.frustumCulled = false;
    this.fade.visible = false;
    this.scene.add(this.fade);

    // overcast sky: a soft grey cloud deck drawn over the painted sky
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: cloudTexture(), transparent: true, opacity: 0, fog: false, depthWrite: false, toneMapped: false }));
    this.clouds.renderOrder = -1;
    this.clouds.frustumCulled = false;
    this.clouds.visible = false;
    this.scene.add(this.clouds);
    // rain streaks around the camera
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    for (let i = 0; i < RAIN_DROPS; i++) {
      const x = (Math.random() - 0.5) * 60;
      const y = (Math.random() - 0.5) * 30;
      const z = -8 + Math.random() * 13;
      this.rainPos.set([x, y, z, x, y, z], i * 6);
    }
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xd4e2f2, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
    // snowflakes
    for (let i = 0; i < SNOW_FLAKES; i++) this.snowPos.set([(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 30, -9 + Math.random() * 14], i * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.11, map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), transparent: true, depthWrite: false, fog: false, opacity: 0 }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    this.scene.add(this.snow);

    this.scene.add(this.bike3d.group);
    // soft blob shadow (always, under the real shadow)
    const blobTex = radialTexture('rgba(30,20,10,0.55)', 'rgba(30,20,10,0)');
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, toneMapped: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.scene.add(this.blob);

    // dust particles
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('pcolor', new THREE.BufferAttribute(this.pCol, 4));
    this.pGeo.setAttribute('psize', new THREE.BufferAttribute(this.pSize, 1));
    this.particles = new THREE.Points(
      this.pGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { scale: { value: 500 } },
        vertexShader: `
          attribute vec4 pcolor; attribute float psize; uniform float scale; varying vec4 vColor;
          void main() { vColor = pcolor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = psize * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `
          varying vec4 vColor;
          void main() { vec2 d = gl_PointCoord - vec2(0.5); float r = length(d) * 2.0;
            float a = smoothstep(1.0, 0.35, r); vec3 lit = vColor.rgb * (1.12 - 0.25 * (d.y + 0.5) - 0.1 * d.x);
            gl_FragColor = vec4(lit, vColor.a * a); if (gl_FragColor.a < 0.01) discard; }`,
      }),
    );
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);

    // coins: one instanced mesh, spinning gold discs
    const coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.06, 20).rotateX(Math.PI / 2);
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xf6c23a, metalness: 0.85, roughness: 0.25, emissive: 0x5a3a00, emissiveIntensity: 0.4 });
    this.coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, 256);
    this.coinMesh.count = 0;
    this.coinMesh.frustumCulled = false;
    this.scene.add(this.coinMesh);
    this.tagLayer = document.createElement('div');
    this.tagLayer.className = 'rider-tags';
    host.appendChild(this.tagLayer);

    this.popupLayer = document.createElement('div');
    this.popupLayer.className = 'popups';
    host.appendChild(this.popupLayer);
    this.resize();
  }

  private createRenderer(): void {
    const p = PRESETS[this.quality];
    const old = this.renderer;
    this.renderer = new THREE.WebGLRenderer({ antialias: p.antialias, powerPreference: 'high-performance', alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = p.shadows > 0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.id = 'game';
    if (old) {
      old.domElement.replaceWith(this.renderer.domElement);
      old.dispose();
    } else {
      const existing = this.host.querySelector('#game');
      if (existing) existing.replaceWith(this.renderer.domElement);
      else this.host.prepend(this.renderer.domElement);
    }
    this.sun.castShadow = p.shadows > 0;
    if (p.shadows > 0) {
      this.sun.shadow.mapSize.set(p.shadows, p.shadows);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.bike3d.setEnvironment(this.renderer, true);
  }

  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.prScale = 1;
    const rebuildAA = PRESETS[q].antialias !== PRESETS[this.quality].antialias;
    this.quality = q;
    if (rebuildAA) this.createRenderer();
    else {
      const p = PRESETS[q];
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pixelRatio));
      this.renderer.shadowMap.enabled = p.shadows > 0;
      this.sun.castShadow = p.shadows > 0;
      if (p.shadows > 0) {
        this.sun.shadow.mapSize.set(p.shadows, p.shadows);
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
      }
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
      });
    }
    this.resize();
    // tree density changes: rebuild the terrain visuals
    if (this.world) this.setWorld(this.world, true);
  }

  setAssets(a: Assets): void {
    this.bank = new TextureBank(a, this.renderer.capabilities.getMaxAnisotropy());
    for (const [key, bd] of Object.entries(a.backdrops)) {
      const t = new THREE.Texture(bd.img);
      t.wrapS = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      this.backdropTex[key] = { tex: t, aspect: bd.meta.w / bd.meta.h, horizon: bd.meta.horizon, sky: bd.meta.skyTop, ground: bd.meta.ground };
    }
    this.backdropTex.canyon = canyonBackdrop();
    this.backdropTex.desert = desertBackdrop();
    if (this.world) this.setWorld(this.world, true);
  }

  /** The player's bike (garage choice). */
  setPlayerModel(model: BikeModel, outfit?: Outfit): void {
    if (this.bike3d.model.id === model.id && this.bike3d.outfit === (outfit?.id ?? 'moto')) return;
    this.mx?.release(this.scene);
    this.mxOn = false;
    this.bike3d.group.removeFromParent();
    disposeObject(this.bike3d.group);
    this.bike3d = new Bike3D(model, undefined, outfit);
    this.bike3d.setEnvironment(this.renderer);
    this.scene.add(this.bike3d.group);
  }

  /** Race opponents: one 3D bike each, on its own lane. */
  private syncRivals(game: Game, dt: number, createOnly = false, tagsOnly = false): void {
    for (const [o, b3] of this.rivals) {
      if (!game.opponents.includes(o)) {
        b3.group.removeFromParent();
        disposeObject(b3.group);
        this.rivals.delete(o);
        this.tags.get(o)?.remove();
        this.tags.delete(o);
      }
    }
    const v = new THREE.Vector3();
    for (const o of game.opponents) {
      let b3 = this.rivals.get(o);
      if (!b3) {
        // other players wear the outfit they bought in solo
        b3 = new Bike3D(o.model, o.look, o.outfit && o.outfit !== 'moto' ? outfitById(o.outfit) : undefined, true);
        b3.lane = -0.25 + o.lane;
        b3.setEnvironment(this.renderer);
        this.scene.add(b3.group);
        this.rivals.set(o, b3);
        const tag = document.createElement('div');
        tag.className = 'rider-tag';
        tag.style.setProperty('--c', o.look.jersey);
        tag.style.setProperty('--lvl', o.level >= 8 ? '#ff6a5a' : o.level >= 5 ? '#ffd23f' : '#7dff7a');
        tag.innerHTML = o.remote ? `${o.name}` : `${o.name} <b>Niv.${o.level}</b>`;
        this.tagLayer.appendChild(tag);
        this.tags.set(o, tag);
      }
      if (createOnly) continue;
      const near = tagsOnly ? Math.abs(o.bike.x - game.bike.x) < 60 : Math.abs(o.bike.x - this.camX) < 40;
      if (!tagsOnly) {
        b3.group.visible = near;
        if (near) b3.update(o.bike, dt, o.crashTimer > 0);
      }
      const tag = this.tags.get(o)!;
      if (near && game.state === 'playing') {
        const [ox, oy] = o.bike.pointWorld(0, 0);
        this.toScreen(game, ox, oy + 1.7, b3.lane, v);
        if (v.z > 1) v.set(9, 9, 0);
        tag.style.display = 'block';
        tag.style.transform = `translate(${((v.x + 1) / 2) * this.W}px, ${((1 - v.y) / 2) * this.H}px) translate(-50%, -50%)`;
      } else tag.style.display = 'none';
    }
    // the player's own name tag in races
    if (!this.youTag) {
      this.youTag = document.createElement('div');
      this.youTag.className = 'rider-tag you';
      this.tagLayer.appendChild(this.youTag);
    }
    const showYou = game.mode === 'course' && game.state === 'playing' && !!game.pseudo;
    this.youTag.style.display = showYou ? 'block' : 'none';
    if (showYou) {
      if (this.youTag.textContent !== game.pseudo) this.youTag.textContent = game.pseudo;
      const [px, py] = game.bike.pointWorld(0, 0);
      this.toScreen(game, px, py + 1.7, -0.25, v);
      this.youTag.style.transform = `translate(${((v.x + 1) / 2) * this.W}px, ${((1 - v.y) / 2) * this.H}px) translate(-50%, -50%)`;
    }
  }
  private youTag: HTMLElement | null = null;

  private coinMatrix = new THREE.Matrix4();
  private updateCoins(game: Game): void {
    let n = 0;
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    for (const c of game.world.coins) {
      if (c.x < this.camX - 30 || c.x > this.camX + 40) continue;
      let s = 1;
      let y = c.y;
      if (c.taken) {
        const t = game.time - c.takenAt;
        if (t > 0.3) continue;
        s = 1 - t / 0.3;
        y += t * 4;
      }
      e.set(0, this.time * 3 + c.x, 0);
      q.setFromEuler(e);
      p.set(c.x, y + Math.sin(this.time * 2.5 + c.x) * 0.08, -0.25);
      sc.setScalar(s);
      this.coinMatrix.compose(p, q, sc);
      this.coinMesh.setMatrixAt(n++, this.coinMatrix);
      if (n >= 256) break;
    }
    this.coinMesh.count = n;
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  /** New run (or new settings): drop every visual built for the previous world. */
  setWorld(w: World, force = false): void {
    if (this.world === w && !force) return;
    this.world = w;
    for (const c of this.chunks.values()) disposeGroup(c.group, this.scene);
    this.chunks.clear();
    for (const g of this.bridges.values()) disposeGroup(g, this.scene);
    this.bridges.clear();
    for (const g of this.pickups.values()) this.scene.remove(g);
    this.pickups.clear();
    if (!this.bank) return;
    this.terrain?.dispose();
    for (const t of this.terrains.values()) if (t !== this.terrain) t.dispose();
    this.terrains.clear();
    this.bridgeBuilder?.dispose();
    this.terrain = this.terrainFor(w, 0);
    this.bridgeBuilder = new BridgeBuilder(this.bank, this.terrain.waterMaterial);
  }

  resize(): void {
    this.W = Math.max(1, window.innerWidth);
    this.H = Math.max(1, window.innerHeight);
    this.renderer.setSize(this.W, this.H);
    this.camera.aspect = this.W / this.H;
    this.camera.updateProjectionMatrix();
    (this.particles.material as THREE.ShaderMaterial).uniforms.scale.value = this.H * this.renderer.getPixelRatio() * 0.9;
  }

  /**
   * Automatic safety net: if frames stay slow (< ~45 fps for 2 s), lower the pixel ratio a
   * notch; raise it back slowly when there is headroom. Never goes above the quality preset.
   */
  private slow = 0;
  private fast = 0;
  private prScale = 1;
  adapt(frameDt: number): void {
    if (frameDt > 1 / 45) {
      this.slow += frameDt;
      this.fast = 0;
    } else if (frameDt < 1 / 57) {
      this.fast += frameDt;
      this.slow = Math.max(0, this.slow - frameDt);
    }
    const apply = () => {
      const base = Math.min(window.devicePixelRatio || 1, PRESETS[this.quality].pixelRatio);
      this.renderer.setPixelRatio(Math.max(0.75, base * this.prScale));
      this.resize();
    };
    if (this.slow > 2 && this.prScale > 0.55) {
      this.prScale -= 0.15;
      this.slow = 0;
      apply();
    } else if (this.fast > 10 && this.prScale < 1) {
      this.prScale = Math.min(1, this.prScale + 0.15);
      this.fast = 0;
      apply();
    }
  }

  // ---------------------------------------------------------------- frame

  /** v2.26: the motocross track, drawn in 3D with its own scene and chase camera. */
  private mx: MxScene | null = null;
  private mxOn = false;
  private mxFade: HTMLElement | null = null;
  /** Projects a point of the 2D world to the screen (the 3D track has its own camera). */
  private toScreen(game: Game, x: number, y: number, z: number, v: THREE.Vector3): THREE.Vector3 {
    return this.mxOn && this.mx ? this.mx.project(game, x, y, v) : v.set(x, y, z).project(this.camera);
  }

  render(game: Game, dt: number, snap = false): void {
    this.time += dt;
    this.frameDt = dt;
    const w = game.world;
    if (w !== this.world) this.setWorld(w);
    const b = game.bike;
    // ---- motocross track: 3D view once the camera has swung half-way round
    const mxT = game.state === 'title' ? 0 : game.mxT;
    const use3d = mxT >= 0.5;
    if (!this.mxFade) {
      this.mxFade = document.createElement('div');
      this.mxFade.className = 'mx-fade';
      document.body.appendChild(this.mxFade);
    }
    this.mxFade.style.opacity = String(clamp(1 - Math.abs(mxT - 0.5) * 4.5, 0, 1) * (mxT > 0 && mxT < 1 ? 1 : 0));
    if (use3d) {
      if (!this.mx) this.mx = new MxScene(this.backdropTex['alps-forest']?.tex);
      this.mxOn = true;
      this.syncRivals(game, 0, true);
      this.mx.render(this.renderer, game, dt, this.bike3d, this.rivals, this.W / this.H, (1 - mxT) * 2);
      this.syncRivals(game, dt, false, true);
      this.updatePopups(game);
      return;
    }
    if (this.mxOn) {
      this.mxOn = false;
      this.mx?.release(this.scene);
      this.bike3d.lane = -0.25;
      for (const [o, b3] of this.rivals) b3.lane = -0.25 + o.lane;
      snap = true;
    }

    // ---- camera: follows the bike with look-ahead, zooms out with speed and air time
    const speedZoom = clamp(b.speed / 25, 0, 1) * 0.15 + clamp(b.airTime / 1.0, 0, 1) * 0.12;
    this.zoom = snap ? 1 + speedZoom : approach(this.zoom, 1 + speedZoom, 1.5, dt);
    const aspect = this.W / this.H;
    // home screen: closer hero framing and warm sunset light
    const title = game.state === 'title';
    this.sunset = snap ? (title ? 1 : 0) : approach(this.sunset, title ? 1 : 0, 2.5, dt);
    const heroZoom = 1 - this.sunset * 0.3;
    let visH = Math.max(9.5 * this.zoom, (15 * this.zoom) / aspect) * heroZoom; // portrait keeps ~15 m of width
    if (this.debugZoom) visH = this.debugZoom;
    const visW = visH * aspect;
    const lookAhead = (clamp(b.vx * 0.3, -2, 6) + visW * 0.12) * (1 - this.sunset);
    const tx = b.x + lookAhead;
    const ground = w.heightAt(b.x + lookAhead * 0.8);
    const br = w.bridgeAt(b.x + lookAhead * 0.5);
    const dipT = br ? Math.min(3, (br.deckY0 - br.floorY) * 0.22) : 0;
    this.dip = snap ? dipT : approach(this.dip, dipT, 1.2, dt);
    const ty = Math.max(b.y, ground + 0.8) + visH * (0.06 - this.sunset * 0.2) + clamp(b.vy * 0.1, -1.2, 1.2) - this.dip;
    // light grading: day ↔ golden hour
    const k = this.sunset;
    this.sun.color.setRGB(1, 0.94 - 0.26 * k, 0.85 - 0.45 * k);
    this.sun.intensity = 2.2 + 0.4 * k;
    this.hemi.color.setRGB(0.84 + 0.14 * k, 0.92 - 0.2 * k, 1 - 0.3 * k);
    this.hemi.intensity = 1.35 - 0.35 * k;
    // weather: dimmer, greyer light under rain clouds; soft white light with snow
    // sky: fixed weather, or (cruising) what is falling where the camera is
    const sky = game.state === 'title' ? { rain: 0, snow: 0 } : w.weatherAt(this.camX);
    this.rainL = snap ? sky.rain : approach(this.rainL, sky.rain, 1.5, dt);
    this.snowL = snap ? sky.snow : approach(this.snowL, sky.snow, 1.5, dt);
    const ov = Math.max(this.rainL, this.snowL * 0.7);
    skyTint.copy(GREY_SKY).lerp(SNOW_SKY, this.snowL / Math.max(0.01, this.rainL + this.snowL));
    this.sun.intensity *= 1 - ov * 0.62;
    this.hemi.intensity *= 1 - this.rainL * 0.15 + this.snowL * 0.12;
    this.hemi.color.lerp(skyTint, ov * 0.7);
    if (snap) {
      this.camX = tx;
      this.camY = ty;
    } else {
      this.camX = approach(this.camX, tx, 5, dt);
      this.camY = approach(this.camY, ty, 3, dt);
    }
    const D = visH / (2 * Math.tan(((FOV / 2) * Math.PI) / 180));
    let sx = 0;
    let sy = 0;
    if (game.shake > 0) {
      sx = (Math.random() - 0.5) * game.shake * game.shake * 0.25;
      sy = (Math.random() - 0.5) * game.shake * game.shake * 0.25;
    }
    // entering / leaving the motocross track: the side camera swings towards the rear
    const al = mxT > 0 ? (mxT * 2) ** 2 * (3 - 4 * mxT) * 0.55 : 0;
    this.camera.position.set(this.camX + sx - Math.sin(al) * D, this.camY + D * 0.1 + sy, Math.cos(al) * D);
    this.camera.lookAt(this.camX + sx, this.camY + sy, 0);
    this.camera.updateMatrixWorld();

    // ---- streaming visuals
    this.updateChunks(w);
    // cheering supporters: little jumps and side-to-side sway
    for (const c of this.chunks.values())
      for (const m of c.anims) {
        const ph = this.time * 7 + m.userData.p;
        m.position.y = m.userData.y + Math.max(0, Math.sin(ph)) * 0.22;
        m.rotation.z = Math.sin(ph * 0.5) * 0.06;
      }
    this.updateBridges(w);
    this.updateBackdrop(w, D, visH);
    this.updateWeather(dt, D, visH);
    this.updatePickups(game);

    // ---- bike, lights, shadow (the rider is thrown off during a crash)
    const crashed = !!(game.ragdoll && game.crashTimer > 0);
    this.bike3d.update(b, dt, crashed);
    if (crashed) this.bike3d.setRiderDetached(true, game.ragdoll!.x, game.ragdoll!.y, game.ragdoll!.angle, this.scene);
    else this.bike3d.setRiderDetached(false);
    const [ox, oy] = b.pointWorld(0, 0);
    this.sun.position.set(ox - 6, oy + 14, 9);
    this.sun.target.position.set(ox, oy - 0.5, -0.25);
    const gy = w.heightAt(b.x);
    const h = Math.max(0, b.y - gy - 0.9);
    this.blob.position.set(b.x, gy + 0.03, -0.25);
    const s = 1 / (1 + h * 0.3);
    this.blob.scale.set(s, s, 1);
    (this.blob.material as THREE.MeshBasicMaterial).opacity = s;

    this.syncRivals(game, dt);
    this.updateCoins(game);
    this.updateParticles(game);
    this.renderer.render(this.scene, this.camera);
    this.updatePopups(game);
  }

  /** v2.25: cruising crosses several worlds: one ground builder per kind of world. */
  private terrains = new Map<string, TerrainBuilder>();
  private terrainFor(w: World, x: number): TerrainBuilder {
    const id = w.regionAt(x).id;
    const kind = id === 'canyon' ? 'canyon' : id === 'desert' ? 'desert' : id === 'sf' ? 'city' : 'green';
    let t = this.terrains.get(kind);
    if (!t) {
      t = new TerrainBuilder(this.bank!, { kind, treeDensity: PRESETS[this.quality].trees, wet: w.weather });
      this.terrains.set(kind, t);
    }
    return t;
  }

  private updateChunks(w: World): void {
    if (!this.terrain) return;
    const first = Math.floor((this.camX - 70) / CHUNK_M);
    const last = Math.floor((this.camX + 110) / CHUNK_M);
    for (const [ci, c] of this.chunks) {
      if (ci < first - 1) {
        disposeGroup(c.group, this.scene);
        this.chunks.delete(ci);
      }
    }
    let built = 0;
    for (let ci = Math.max(-1, first); ci <= last; ci++) {
      if (this.chunks.has(ci)) continue;
      if (built > 0 && ci > Math.floor(this.camX / CHUNK_M)) break; // spread the work over frames
      w.ensure((ci + 1) * CHUNK_M + 90);
      const v = this.terrainFor(w, (ci + 0.5) * CHUNK_M).build(w, ci);
      this.scene.add(v.group);
      this.chunks.set(ci, v);
      built++;
    }
  }

  private updateBridges(w: World): void {
    if (!this.bridgeBuilder) return;
    for (const [br, g] of this.bridges) {
      if (!w.bridges.includes(br) || br.x1 < this.camX - 80) {
        disposeGroup(g, this.scene);
        this.bridges.delete(br);
      }
    }
    for (const br of w.bridges) {
      if (this.bridges.has(br) || br.x0 > this.camX + 140 || br.x1 < this.camX - 80) continue;
      const g = this.bridgeBuilder.build(w, br);
      this.scene.add(g);
      this.bridges.set(br, g);
    }
  }

  private updateBackdrop(w: World, D: number, visH: number): void {
    const base = w.regionAt(this.camX).id === 'canyon' ? 'canyon' : w.regionAt(this.camX).id === 'desert' ? (w.biomeAt(this.camX) === Biome.Canyon ? 'canyon' : 'desert') : w.regionAt(this.camX).id === 'sf' ? 'sf.0' : w.regionAt(this.camX).backdrop[w.biomeAt(this.camX)] || 'alps-forest';
    // v2.8: painted panoramas take turns while riding (not behind the home screen)
    const pano = this.sunset < 0.5 || w.regionAt(this.camX).id === 'sf' ? panoramaAt(w.regionAt(this.camX).id, w.seed, Math.max(this.camX, w.regionAt(this.camX).id === 'sf' ? 250 : 0), w.mode === 'cruising') : null;
    let key = pano ? pano.id : base;
    // paint (or load) the next panorama a little before it is needed (no hitch at the switch)
    if (pano) {
      const ahead = panoramaAt(w.regionAt(this.camX).id, w.seed, this.camX + 250, w.mode === 'cruising');
      if (ahead && ahead.id !== pano.id) paintPanorama(ahead);
    }
    let bd: Backdrop | undefined = pano ? paintPanorama(pano) : this.backdropTex[key];
    // a painted panorama still loading: keep showing the current one meanwhile
    if (bd && bd.ready === false) {
      if (this.prevBd && this.backdropKey) {
        bd = this.prevBd;
        key = this.backdropKey;
      } else {
        bd = this.backdropTex[base];
        key = base;
      }
    }
    if (!bd) {
      this.backdrop.visible = this.lower.visible = false;
      return;
    }
    this.backdrop.visible = this.lower.visible = true;
    if (key !== this.backdropKey) {
      // cross-fade: the old painting stays on top and fades out
      if (this.backdropKey && this.backdrop.material.map && this.prevBd !== bd) {
        this.fade.material.map = this.backdrop.material.map;
        this.fade.material.needsUpdate = true;
        this.fadeBd = this.prevBd;
        this.fadeT = 1;
      }
      this.prevBd = bd;
      this.backdropKey = key;
      this.backdrop.material.map = bd.tex;
      this.backdrop.material.needsUpdate = true;
      this.skyBase.set(bd.sky);
      // band under the painting: halfway between its foot and the hills, so no seam shows
      this.lowerBase.set(new THREE.Color(bd.ground).lerp(new THREE.Color(key === 'alps-forest' ? 0x86b45a : bd.ground), 0.55));
      this.fogBase.set(key === 'canyon' ? 0xe8b88c : key === 'desert' ? 0xf3d9b0 : new THREE.Color(bd.ground).lerp(new THREE.Color(0xbfdcf5), 0.45));
    }
    // place a plane far behind, sized in screen terms: the painting's lower band (below its
    // horizon) covers the band just above the hills.
    const dist = 420;
    const d = D + dist;
    const scale = d / D; // world units per "screen unit at z = 0"
    const screenH = visH * scale;
    const aspect = this.W / this.H;
    const imgH = (0.2 * screenH) / (1 - bd.horizon);
    const imgW = imgH * bd.aspect;
    const planeW = screenH * aspect * 1.25;
    const centerY = this.camera.position.y + (this.camY - this.camera.position.y) * scale; // line of sight
    const bottomY = centerY + screenH * (0.5 - 0.37);
    this.backdrop.scale.set(planeW, imgH, 1);
    this.backdrop.position.set(this.camX, bottomY + imgH / 2, -dist);
    bd.tex.repeat.set(planeW / imgW, 1);
    bd.tex.offset.x = (this.camX * 0.6) / imgW - planeW / imgW / 2;
    // slow, gentle cross-fade (longer in cruising, where the scenery is the show)
    this.fadeT = Math.max(0, this.fadeT - this.frameDt / (w.mode === 'cruising' ? 5 : 3));
    this.fade.visible = this.fadeT > 0 && !!this.fadeBd;
    if (this.fade.visible && this.fadeBd) {
      const fb = this.fadeBd;
      const fH = (0.2 * screenH) / (1 - fb.horizon);
      const fW = fH * fb.aspect;
      this.fade.scale.set(planeW, fH, 1);
      this.fade.position.set(this.camX, bottomY + fH / 2, -dist + 2);
      fb.tex.repeat.set(planeW / fW, 1);
      fb.tex.offset.x = (this.camX * 0.6) / fW - planeW / fW / 2;
      this.fade.material.opacity = this.fadeT * this.fadeT * (3 - 2 * this.fadeT);
      this.fade.material.color.copy(this.backdrop.material.color);
    }
    // below the painting: its ground colour down to the bottom of the screen
    this.lower.scale.set(planeW, screenH, 1);
    this.lower.position.set(this.camX, bottomY - screenH / 2 + 0.5, -dist - 1);
    // cloud deck over the upper part of the sky (in front of the painting)
    const cd = dist - 10;
    const cs = (D + cd) / D;
    const cH = visH * cs;
    const cTop = this.camera.position.y + (this.camY - this.camera.position.y) * cs + cH / 2;
    this.clouds.scale.set(cH * aspect * 1.25, cH * 0.78, 1);
    this.clouds.position.set(this.camX, cTop - cH * 0.39 + cH * 0.02, -cd);
    this.clouds.material.map!.offset.x = this.camX * 0.004 + this.time * 0.004;
  }

  /** Overcast colours, cloud deck, rain streaks and snowflakes for the current weather. */
  private updateWeather(dt: number, D: number, visH: number): void {
    const ov = Math.max(this.rainL, this.snowL * 0.7);
    const rain = this.rainL;
    const snow = this.snowL;
    const tint = (c: THREE.Color, base: THREE.Color, k: number) => c.copy(base).lerp(skyTint, k).multiplyScalar(1 - this.rainL * 0.25);
    this.backdrop.material.color.setRGB(1 - rain * 0.42 - snow * 0.12, 1 - rain * 0.38 - snow * 0.1, 1 - rain * 0.3 - snow * 0.04);
    tint(this.lower.material.color, this.lowerBase, rain * 0.35 + snow * 0.6);
    tint((this.scene.fog as THREE.Fog).color, this.fogBase, ov * 0.7);
    (this.scene.fog as THREE.Fog).far = 150 - rain * 55 - snow * 45;
    tint(this.scene.background as THREE.Color, this.skyBase, ov * 0.75);
    this.clouds.visible = ov > 0.01;
    this.clouds.material.opacity = Math.min(1, ov * 1.45);
    this.clouds.material.color.setScalar(1 - rain * 0.3 + snow * 0.15);
    const aspect = this.W / this.H;
    const bw = visH * aspect * 1.9 + 10;
    const bh = visH * 1.9 + 6;
    const wrap = (P: Float32Array, o: number) => {
      const rx = P[o] - this.camX;
      const ry = P[o + 1] - this.camY;
      if (rx < -bw / 2) P[o] += bw;
      else if (rx > bw / 2) P[o] -= bw;
      if (ry < -bh / 2) P[o + 1] += bh;
      else if (ry > bh / 2) P[o + 1] -= bh;
    };
    // snowflakes: slow, swaying
    this.snow.visible = snow > 0.01;
    if (this.snow.visible) {
      (this.snow.material as THREE.PointsMaterial).opacity = 0.95 * snow;
      const S = this.snowPos;
      for (let i = 0; i < SNOW_FLAKES; i++) {
        const o = i * 3;
        S[o] += (-0.8 + Math.sin(this.time * 0.9 + i * 1.7) * 0.7) * dt;
        S[o + 1] -= (1.2 + (i % 7) * 0.12) * dt;
        wrap(S, o);
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }
    this.rain.visible = rain > 0.01;
    if (!this.rain.visible) return;
    this.rain.material.opacity = 0.55 * rain;
    const vy = -17;
    const vx = -3.5;
    const len = 0.55;
    const P = this.rainPos;
    for (let i = 0; i < RAIN_DROPS; i++) {
      const o = i * 6;
      P[o] += vx * dt;
      P[o + 1] += vy * dt;
      wrap(P, o);
      P[o + 3] = P[o] - vx * (len / 17);
      P[o + 4] = P[o + 1] - vy * (len / 17);
      P[o + 5] = P[o + 2];
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
    void D;
  }

  /** Shared geometry/materials per pickup kind (never recreated → no GPU leak). */
  private pickupCache = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; glowGeo: THREE.BufferGeometry; glowMat: THREE.Material }>();
  private pickupParts(kind: 'fuel' | 'water') {
    let c = this.pickupCache.get(kind);
    if (!c) {
      const spr = pickupSprite(kind);
      c = {
        geo: spriteGeometry(spr),
        mat: new THREE.MeshBasicMaterial({ map: this.bank!.spriteTex(spr), transparent: true, alphaTest: 0.3, toneMapped: false }),
        glowGeo: new THREE.PlaneGeometry(2.2, 2.2),
        glowMat: new THREE.MeshBasicMaterial({
          map: radialTexture(kind === 'fuel' ? 'rgba(255,210,80,0.8)' : 'rgba(120,210,255,0.8)', 'rgba(255,255,255,0)'),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      };
      this.pickupCache.set(kind, c);
    }
    return c;
  }

  private updatePickups(game: Game): void {
    if (!this.bank) return;
    const w = game.world;
    for (const [p, g] of this.pickups) {
      if (!w.pickups.includes(p) || (p.taken && game.time - p.takenAt > 0.5)) {
        this.scene.remove(g);
        this.pickups.delete(p);
      }
    }
    for (const p of w.pickups) {
      if (p.x > this.camX + 60 || p.x < this.camX - 40) continue;
      let g = this.pickups.get(p);
      if (!g) {
        if (p.taken) continue;
        const parts = this.pickupParts(p.kind);
        g = new THREE.Group();
        const m = new THREE.Mesh(parts.geo, parts.mat);
        const glow = new THREE.Mesh(parts.glowGeo, parts.glowMat);
        glow.position.set(0, 0.5, -0.05);
        g.add(glow, m);
        this.scene.add(g);
        this.pickups.set(p, g);
      }
      let y = p.y + Math.sin(this.time * 3 + p.x) * 0.15;
      let sc = 1;
      if (p.taken) {
        const t = game.time - p.takenAt;
        y += t * 3;
        sc = 1 + t * 2;
      }
      g.position.set(p.x, y, 0.1);
      g.scale.setScalar(sc);
      g.rotation.y = Math.sin(this.time * 2 + p.x) * 0.5;
    }
  }

  private updateParticles(game: Game): void {
    const list = game.particles.list;
    const n = Math.min(list.length, 300);
    for (let i = 0; i < n; i++) {
      const p = list[i];
      const t = p.life / p.maxLife;
      const zj = ((i * 7919) % 100) / 100;
      this.pPos[i * 3] = p.x;
      this.pPos[i * 3 + 1] = p.y;
      this.pPos[i * 3 + 2] = -0.3 + (zj - 0.5) * 1.4;
      let a = 1;
      let size = p.size * 2;
      switch (p.kind) {
        case 'dust':
          a = Math.min(1, t * 1.4) * 0.5;
          size = p.size * 2.6;
          break;
        case 'clod':
          size = Math.max(0.05, p.size * 1.6);
          break;
        case 'splash':
          a = Math.min(1, t * 2);
          size = p.size * 2.5;
          break;
        default:
          a = t;
          size = p.size * 2.5;
      }
      this.pCol[i * 4] = p.r / 255;
      this.pCol[i * 4 + 1] = p.g / 255;
      this.pCol[i * 4 + 2] = p.b / 255;
      this.pCol[i * 4 + 3] = a;
      this.pSize[i] = size;
    }
    this.pGeo.setDrawRange(0, n);
    (this.pGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.pGeo.attributes.pcolor as THREE.BufferAttribute).needsUpdate = true;
    (this.pGeo.attributes.psize as THREE.BufferAttribute).needsUpdate = true;
  }

  private updatePopups(game: Game): void {
    const v = new THREE.Vector3();
    while (this.popupEls.length < game.popups.length) {
      const el = document.createElement('div');
      el.className = 'popup';
      this.popupLayer.appendChild(el);
      this.popupEls.push(el);
    }
    this.popupEls.forEach((el, i) => {
      const p = game.popups[i];
      if (!p) {
        el.style.display = 'none';
        return;
      }
      this.toScreen(game, p.x, p.y, 0, v);
      if (v.z > 1) v.set(9, 9, 0);
      el.style.display = 'block';
      el.textContent = p.text;
      el.style.color = p.color;
      el.style.opacity = String(Math.min(1, p.life * 2));
      el.style.transform = `translate(${((v.x + 1) / 2) * this.W}px, ${((1 - v.y) / 2) * this.H}px) translate(-50%, -50%)`;
    });
  }
}

// ---------------------------------------------------------------- helpers

function disposeGroup(g: THREE.Object3D, scene: THREE.Scene): void {
  scene.remove(g);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !o.userData.shared && !(o as THREE.InstancedMesh).isInstancedMesh) m.geometry.dispose();
    else if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
}

function radialTexture(inner: string, outer: string): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Procedural painted canyon panorama (mesas, strata), mirrored to tile seamlessly. */
function canyonBackdrop(): { tex: THREE.Texture; aspect: number; horizon: number; sky: string; ground: string } {
  const W = 1024;
  const H = 640;
  const cv = document.createElement('canvas');
  cv.width = W * 2;
  cv.height = H;
  const c = cv.getContext('2d')!;
  const sky = c.createLinearGradient(0, 0, 0, H * 0.7);
  sky.addColorStop(0, '#2a78e4');
  sky.addColorStop(1, '#ffe0b0');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);
  const bg = new Background();
  bg.draw(c, Biome.Canyon, 0, 0, 40, W, H, 1, ['far', 'mid', 'near']);
  c.save();
  c.translate(W * 2, 0);
  c.scale(-1, 1);
  c.drawImage(cv, 0, 0, W, H, 0, 0, W, H);
  c.restore();
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, aspect: (W * 2) / H, horizon: 0.55, sky: '#2a78e4', ground: '#bb6f3a' };
}

/**
 * Procedural painted desert panorama: pale hot sky, veiled sun, faint mesas in the heat haze,
 * then layers of wind-sculpted dunes (sharp lit crest, shaded lee side), mirrored to tile.
 */
function desertBackdrop(): { tex: THREE.Texture; aspect: number; horizon: number; sky: string; ground: string } {
  const W = 1024;
  const H = 640;
  const cv = document.createElement('canvas');
  cv.width = W * 2;
  cv.height = H;
  const c = cv.getContext('2d')!;
  const sky = c.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, '#3d86e0');
  sky.addColorStop(0.55, '#9cc8ee');
  sky.addColorStop(1, '#fbe6c2');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);
  const sun = c.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, H * 0.45);
  sun.addColorStop(0, 'rgba(255,252,235,0.95)');
  sun.addColorStop(0.08, 'rgba(255,245,210,0.7)');
  sun.addColorStop(1, 'rgba(255,240,200,0)');
  c.fillStyle = sun;
  c.fillRect(0, 0, W, H);
  // thin high clouds
  c.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 9; i++) {
    const x = (i * 157) % W;
    const y = H * (0.08 + ((i * 37) % 23) / 100);
    c.beginPath();
    c.ellipse(x, y, 90 + (i % 3) * 40, 6 + (i % 2) * 4, 0, 0, Math.PI * 2);
    c.fill();
  }
  // distant mesas in the haze
  const ridge = (y0: number, amp: number, freq: number, seed: number, flat: boolean) => {
    const pts: number[] = [];
    for (let x = 0; x <= W; x += 4) {
      let v = Math.sin(x * freq + seed) * 0.5 + Math.sin(x * freq * 2.3 + seed * 3) * 0.3 + Math.sin(x * freq * 5.1 + seed * 7) * 0.2;
      if (flat) v = Math.round(v * 2.2) / 2.2;
      pts.push(y0 - v * amp);
    }
    return pts;
  };
  const fillRidge = (pts: number[], fill: string | CanvasGradient) => {
    c.beginPath();
    c.moveTo(0, H);
    pts.forEach((y, i) => c.lineTo(i * 4, y));
    c.lineTo(W, H);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  };
  fillRidge(ridge(H * 0.6, 40, 0.006, 1, true), 'rgba(214,170,140,0.65)');
  fillRidge(ridge(H * 0.64, 28, 0.009, 4, true), 'rgba(222,168,124,0.8)');
  // dune layers, far → near
  const layers = [
    { y: 0.68, amp: 22, f: 0.011, lit: '#f6d6a2', shade: '#dcae78', s: 2 },
    { y: 0.74, amp: 30, f: 0.008, lit: '#f9d9a0', shade: '#d9a46a', s: 5 },
    { y: 0.82, amp: 38, f: 0.006, lit: '#fbdc9e', shade: '#d39a5c', s: 9 },
    { y: 0.92, amp: 44, f: 0.005, lit: '#fcdd9a', shade: '#cc8f52', s: 13 },
  ];
  for (const L of layers) {
    // dune crest: sawtooth-like (gentle windward, steep lee) using a skewed sine
    const pts: number[] = [];
    for (let x = 0; x <= W; x += 4) {
      const ph = x * L.f + L.s;
      const saw = Math.sin(ph + 0.6 * Math.sin(ph));
      pts.push(H * L.y - (saw * 0.5 + 0.5) * L.amp - Math.sin(x * L.f * 0.37 + L.s) * L.amp * 0.4);
    }
    fillRidge(pts, L.lit);
    // lee shadows: where the crest goes down to the right
    c.save();
    c.beginPath();
    c.moveTo(0, H);
    pts.forEach((y, i) => c.lineTo(i * 4, y));
    c.lineTo(W, H);
    c.closePath();
    c.clip();
    c.fillStyle = L.shade;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i] > pts[i - 1] + 0.25) {
        const x = i * 4;
        c.beginPath();
        c.moveTo(x - 4, pts[i - 1]);
        c.lineTo(x, pts[i]);
        c.lineTo(x + 10, H);
        c.lineTo(x - 30, H);
        c.closePath();
        c.fill();
      }
    }
    // ripples
    c.strokeStyle = 'rgba(160,100,50,0.18)';
    c.lineWidth = 1.2;
    for (let k = 0; k < 6; k++) {
      c.beginPath();
      pts.forEach((y, i) => (i === 0 ? c.moveTo(0, y + 6 + k * 7) : c.lineTo(i * 4, y + 6 + k * 7 + Math.sin(i * 0.3 + k) * 1.5)));
      c.stroke();
    }
    c.restore();
    // haze between layers
    c.fillStyle = 'rgba(255,236,205,0.18)';
    c.fillRect(0, 0, W, H);
  }
  c.save();
  c.translate(W * 2, 0);
  c.scale(-1, 1);
  c.drawImage(cv, 0, 0, W, H, 0, 0, W, H);
  c.restore();
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, aspect: (W * 2) / H, horizon: 0.6, sky: '#3d86e0', ground: '#d9a868' };
}
