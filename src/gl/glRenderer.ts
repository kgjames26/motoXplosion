import * as THREE from 'three';
import type { Assets } from '../assets';
import { approach, clamp } from '../core/math';
import type { Game } from '../game';
import { Background } from '../render/background';
import { pickupSprite } from '../render/sprites';
import type { Pickup } from '../world/types';
import { Biome, Bridge, CHUNK_SAMPLES, DX } from '../world/types';
import type { World } from '../world/world';
import { Bike3D } from './bike3d';
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
  readonly bike3d = new Bike3D();
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
    if (this.world) this.setWorld(this.world, true);
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
    this.bridgeBuilder?.dispose();
    this.terrain = new TerrainBuilder(this.bank, { warm: w.region.id === 'canyon', treeDensity: PRESETS[this.quality].trees });
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

  render(game: Game, dt: number, snap = false): void {
    this.time += dt;
    const w = game.world;
    if (w !== this.world) this.setWorld(w);
    const b = game.bike;

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
    this.camera.position.set(this.camX + sx, this.camY + D * 0.1 + sy, D);
    this.camera.lookAt(this.camX + sx, this.camY + sy, 0);
    this.camera.updateMatrixWorld();

    // ---- streaming visuals
    this.updateChunks(w);
    this.updateBridges(w);
    this.updateBackdrop(w, D, visH);
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

    this.updateParticles(game);
    this.renderer.render(this.scene, this.camera);
    this.updatePopups(game);
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
      const v = this.terrain.build(w, ci);
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
    const key = w.region.id === 'canyon' ? 'canyon' : w.region.backdrop[w.biomeAt(this.camX)] || 'alps-forest';
    const bd = this.backdropTex[key];
    if (!bd) {
      this.backdrop.visible = this.lower.visible = false;
      return;
    }
    this.backdrop.visible = this.lower.visible = true;
    if (key !== this.backdropKey) {
      this.backdropKey = key;
      this.backdrop.material.map = bd.tex;
      this.backdrop.material.needsUpdate = true;
      (this.scene.background as THREE.Color).set(bd.sky);
      this.lower.material.color.set(bd.ground);
      (this.scene.fog as THREE.Fog).color.set(key === 'canyon' ? 0xe8b88c : new THREE.Color(bd.ground).lerp(new THREE.Color(0xbfdcf5), 0.45));
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
    const bottomY = centerY + screenH * (0.5 - 0.42);
    this.backdrop.scale.set(planeW, imgH, 1);
    this.backdrop.position.set(this.camX, bottomY + imgH / 2, -dist);
    bd.tex.repeat.set(planeW / imgW, 1);
    bd.tex.offset.x = (this.camX * 0.6) / imgW - planeW / imgW / 2;
    // below the painting: its ground colour down to the bottom of the screen
    this.lower.scale.set(planeW, screenH, 1);
    this.lower.position.set(this.camX, bottomY - screenH / 2 + 0.5, -dist - 1);
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
      v.set(p.x, p.y, 0).project(this.camera);
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
    if (m.geometry && !(o as THREE.InstancedMesh).isInstancedMesh) m.geometry.dispose();
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
