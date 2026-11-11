import { approach, clamp, hash1 } from '../core/math';
import type { Game } from '../game';
import { Biome } from '../world/types';
import { Background } from './background';
import type { Assets } from '../assets';
import { BikeRenderer, tumblePose } from './bikeRenderer';
import { BikeSprite } from './bikeSprite';
import { BiomePalette, INK, mixPalette, PALETTES } from './palette';
import { drawBridges } from './bridges';
import { drawBackField, drawGround, drawTrack } from './terrain';
import { Textures, View } from './view';
import { cloudSprite, pickupSprite, propSprite, Sprite } from './sprites';

/**
 * Main 2.5D cel-shaded renderer (Canvas 2D). Works in device pixels.
 * Draw order: sky → clouds → parallax layers → back field + props → track (with depth band)
 * → bridges → pickups → bike shadow / bike → particles → foreground props → popups.
 */
export class Renderer implements View {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg = new Background();
  private bikeR = new BikeRenderer();
  private bikeSprite: BikeSprite | null = null;
  assets: Assets | null = null;
  W = 0;
  H = 0;
  dpr = 1;
  // camera (world metres)
  camX = 0;
  camY = 0;
  scale = 40; // px per metre
  private zoom = 1;
  private dip = 0;
  // biome crossfade
  private biome: Biome = Biome.Meadow;
  private prevBiome: Biome = Biome.Meadow;
  private fade = 1;
  time = 0;
  private tex: Textures | null = null;
  private backdropKey = '';
  private prevBackdropKey = '';
  private backdropFade = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
  }

  setAssets(a: Assets): void {
    this.assets = a;
    this.bikeSprite = new BikeSprite(a);
    this.tex = new Textures(this.ctx, a);
  }

  /** Resolution multiplier set by the adaptive quality controller (0.5..1). */
  resScale = 1;

  /** Called every frame with the real frame time: lowers the resolution when the device struggles. */
  private slowAcc = 0;
  private fastAcc = 0;
  adapt(frameDt: number): void {
    if (frameDt > 1 / 48) {
      this.slowAcc += frameDt;
      this.fastAcc = 0;
    } else if (frameDt < 1 / 58) {
      this.fastAcc += frameDt;
      this.slowAcc = Math.max(0, this.slowAcc - frameDt * 0.5);
    }
    if (this.slowAcc > 1.5 && this.resScale > 0.55) {
      this.resScale = Math.max(0.55, this.resScale - 0.15);
      this.slowAcc = 0;
      this.resize();
    } else if (this.fastAcc > 8 && this.resScale < 1) {
      this.resScale = Math.min(1, this.resScale + 0.1);
      this.fastAcc = 0;
      this.resize();
    }
  }

  resize(): void {
    // Cap the backing resolution for performance on high-DPI phones.
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.resScale;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const area = w * h * dpr * dpr;
    this.dpr = area > 2_600_000 ? Math.sqrt(2_600_000 / (w * h)) : dpr;
    this.W = Math.round(w * this.dpr);
    this.H = Math.round(h * this.dpr);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  sx(x: number): number {
    return (x - this.camX) * this.scale + this.W * 0.5;
  }
  sy(y: number): number {
    return this.H * 0.5 - (y - this.camY) * this.scale;
  }

  /** Camera follows the bike with speed-dependent look-ahead and zoom. */
  private updateCamera(game: Game, dt: number, snap: boolean): void {
    const b = game.bike;
    const target = game.ragdoll && game.crashTimer > 0 && !this.bikeSprite ? game.ragdoll : b;
    // Visible height ~10 m (a bit wider than the references), more when fast or flying.
    const speedZoom = clamp(b.speed / 30, 0, 1) * 0.15 + clamp(b.airTime / 1.2, 0, 1) * 0.15;
    this.zoom = snap ? 1 + speedZoom : approach(this.zoom, 1 + speedZoom, 1.5, dt);
    const visibleH = 10 * this.zoom;
    this.scale = this.H / visibleH;
    const visibleW = this.W / this.scale;
    const lookAhead = clamp(b.vx * 0.35, -2, 8) + visibleW * 0.12;
    const tx = target.x + lookAhead;
    const ground = game.world.heightAt(b.x + lookAhead * 0.8);
    // Over a bridge the camera dips a little to show the gorge, the river or the valley.
    const br = game.world.bridgeAt(b.x + lookAhead * 0.5);
    const dipTarget = br ? Math.min(3.2, (br.deckY0 - br.floorY) * 0.25) : 0;
    this.dip = snap ? dipTarget : approach(this.dip, dipTarget, 1.2, dt);
    const ty = Math.max(target.y, ground + 0.8) + visibleH * 0.08 + clamp(b.vy * 0.12, -1.5, 1.5) - this.dip;
    if (snap) {
      this.camX = tx;
      this.camY = ty;
    } else {
      this.camX = approach(this.camX, tx, 6, dt);
      this.camY = approach(this.camY, ty, 3.2, dt);
    }
  }

  private lastDt = 0;

  render(game: Game, dt: number, snap = false): void {
    this.time += dt;
    this.lastDt = dt;
    this.updateCamera(game, dt, snap);
    const c = this.ctx;
    const W = this.W;
    const H = this.H;
    const world = game.world;
    let shakeX = 0;
    let shakeY = 0;
    if (game.shake > 0) {
      const s = game.shake * game.shake * H * 0.012;
      shakeX = (Math.random() - 0.5) * s;
      shakeY = (Math.random() - 0.5) * s;
    }
    const savedX = this.camX;
    const savedY = this.camY;
    this.camX += shakeX / this.scale;
    this.camY += shakeY / this.scale;

    // biome crossfade
    const b = world.biomeAt(game.bike.x + 10);
    if (b !== this.biome) {
      this.prevBiome = this.biome;
      this.biome = b;
      this.fade = 0;
    }
    this.fade = Math.min(1, this.fade + dt / 2.5);
    const warm = world.region.id === 'canyon';
    const palOf = (bb: Biome) => (warm ? PALETTES[Biome.Canyon] : PALETTES[bb]);
    const pal = mixPalette(palOf(this.prevBiome), palOf(this.biome), this.fade);

    // ---- sky
    const sky = c.createLinearGradient(0, 0, 0, H * 0.7);
    sky.addColorStop(0, pal.skyTop);
    sky.addColorStop(1, pal.skyBottom);
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    // sun glow
    const sg = c.createRadialGradient(W * 0.82, H * 0.12, 0, W * 0.82, H * 0.12, H * 0.5);
    sg.addColorStop(0, 'rgba(255,250,220,0.55)');
    sg.addColorStop(1, 'rgba(255,250,220,0)');
    c.fillStyle = sg;
    c.fillRect(0, 0, W, H);

    // ---- backdrop: painted panorama for the region when available, procedural otherwise
    const bgBiome = warm ? Biome.Canyon : this.biome;
    const bgPrev = warm ? Biome.Canyon : this.prevBiome;
    const key = (this.assets && world.region.backdrop[this.biome]) || '';
    if (key !== this.backdropKey) {
      this.prevBackdropKey = this.backdropKey;
      this.backdropKey = key;
      this.backdropFade = 0;
    }
    if (snap) {
      this.prevBackdropKey = key;
      this.backdropFade = 1;
    }
    this.backdropFade = Math.min(1, this.backdropFade + dt / 3);
    if (this.backdropKey || this.prevBackdropKey) {
      if (this.backdropFade < 1 && this.prevBackdropKey) this.drawBackdrop(c, this.prevBackdropKey, 1);
      if (this.backdropKey) this.drawBackdrop(c, this.backdropKey, this.prevBackdropKey ? this.backdropFade : 1);
      else this.drawProceduralBg(c, bgBiome, bgPrev, this.backdropFade);
      this.bg.draw(c, bgBiome, this.camX, this.camY, this.scale, W, H, 1, ['forest']);
    } else {
      this.drawProceduralBg(c, bgBiome, bgPrev, 1);
      if (this.fade < 1) this.bg.draw(c, bgPrev, this.camX, this.camY, this.scale, W, H, 1, ['forest']);
      this.bg.draw(c, bgBiome, this.camX, this.camY, this.scale, W, H, this.fade < 1 ? this.fade : 1, ['forest']);
    }

    // ---- visible world range
    const x0 = this.camX - W / 2 / this.scale - 4;
    const x1 = this.camX + W / 2 / this.scale + 4;
    world.ensure(x1 + 10);

    drawBackField(c, this, world, x0, x1, pal, this.tex, warm);
    this.drawProps(c, game, x0, x1, true);
    this.drawMarksBack(c, game, x0, x1);
    drawGround(c, this, world, x0, x1, pal, this.tex, warm);
    drawBridges(c, this, world, x0, x1, this.tex, true);
    drawTrack(c, this, world, x0, x1, pal, this.tex, warm, (x) => world.biomeAt(x));
    drawBridges(c, this, world, x0, x1, this.tex, false);
    this.drawMarksFront(c, game, x0, x1, pal);
    this.drawProps(c, game, x0, x1, false, true);
    this.drawPickups(c, game, x0, x1);
    this.drawBike(c, game);
    this.drawParticles(c, game);
    this.drawProps(c, game, x0, x1, false);
    this.drawPopups(c, game);

    // vignette for depth
    const vg = c.createRadialGradient(W / 2, H * 0.55, H * 0.4, W / 2, H * 0.55, W * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,20,40,0.28)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);

    this.camX = savedX;
    this.camY = savedY;
  }

  // ---------------------------------------------------------------- sky

  /** Procedural sky, clouds and distant layers (used where no painted backdrop exists). */
  private drawProceduralBg(c: CanvasRenderingContext2D, biome: Biome, prev: Biome, alpha: number): void {
    if (alpha <= 0) return;
    c.globalAlpha = alpha;
    this.drawClouds(c);
    if (this.fade < 1) this.bg.draw(c, prev, this.camX, this.camY, this.scale, this.W, this.H, alpha, ['far', 'mid', 'near']);
    this.bg.draw(c, biome, this.camX, this.camY, this.scale, this.W, this.H, alpha * (this.fade < 1 ? this.fade : 1), ['far', 'mid', 'near']);
    c.globalAlpha = 1;
  }

  /** Painted panorama, mirrored-seamless, very slow parallax. */
  private drawBackdrop(c: CanvasRenderingContext2D, key: string, alpha: number): void {
    const bd = this.assets?.backdrops[key];
    if (!bd) return;
    const H = this.H;
    // Fit the painting so its far hills (below `horizon`) fill the band above the track.
    const hz = bd.meta.horizon;
    const k = (0.34 * H) / ((1 - hz) * bd.meta.h);
    const tw = bd.meta.w * k;
    const th = bd.meta.h * k;
    const yShift = Math.max(-H * 0.05, Math.min(H * 0.05, this.camY * this.scale * 0.012));
    const top = 0.27 * H - hz * th + yShift;
    const offset = this.camX * this.scale * 0.035;
    c.globalAlpha = alpha;
    c.fillStyle = bd.meta.skyTop;
    if (top > 0) c.fillRect(0, 0, this.W, top + 2);
    const first = Math.floor(offset / tw);
    for (let x = first * tw - offset; x < this.W; x += tw) c.drawImage(bd.img, Math.round(x), Math.round(top), Math.ceil(tw) + 1, Math.ceil(th));
    // below the painting: continue with its far-forest colour (visible when the camera is high)
    const bottom = Math.round(top + th) - 1;
    if (bottom < this.H) {
      const fadeH = H * 0.07;
      const g = c.createLinearGradient(0, bottom - fadeH, 0, bottom);
      g.addColorStop(0, bd.meta.ground + '00');
      g.addColorStop(1, bd.meta.ground);
      c.fillStyle = g;
      c.fillRect(0, bottom - fadeH, this.W, fadeH);
      c.fillStyle = bd.meta.ground;
      c.fillRect(0, bottom, this.W, this.H - bottom);
    }
    c.globalAlpha = 1;
  }

  private drawClouds(c: CanvasRenderingContext2D): void {
    const W = this.W;
    const H = this.H;
    const par = 0.03;
    const spacing = H * 0.9;
    const offset = this.camX * this.scale * par + this.time * H * 0.006;
    const first = Math.floor(offset / spacing) - 1;
    const last = Math.ceil((offset + W) / spacing) + 1;
    for (let k = first; k <= last; k++) {
      for (let row = 0; row < 2; row++) {
        const n = hash1(k, 11 + row);
        if (n > 0.75) continue;
        const spr = cloudSprite(Math.floor(hash1(k, 21 + row) * 4));
        const size = H * (row === 0 ? 0.32 : 0.2) * (0.7 + n * 0.6);
        const ppm = size / spr.w;
        const x = k * spacing + hash1(k, 31 + row) * spacing * 0.6 - offset - (row * spacing) / 2;
        const y = H * (row === 0 ? 0.08 : 0.24) + hash1(k, 41 + row) * H * 0.08 - Math.min(H * 0.05, this.camY * this.scale * 0.01);
        c.globalAlpha = row === 0 ? 1 : 0.85;
        c.drawImage(spr.canvas, x - spr.ax * ppm, y - spr.ay * ppm, spr.w * ppm, spr.h * ppm);
      }
    }
    c.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- marks

  private drawMarksBack(c: CanvasRenderingContext2D, game: Game, x0: number, x1: number): void {
    const w = game.world;
    for (const m of w.marks) {
      if (m.x1 < x0 - 5 || m.x0 > x1 + 5) continue;
      if (m.kind === 'checkpoint' || m.kind === 'start') {
        // finish-line style arch
        const xa = m.x0 - 1.5;
        const xb = m.x0 + 1.5;
        const ya = w.heightAt(xa) + 0.6;
        const yb = w.heightAt(xb) + 0.6;
        const top = Math.max(ya, yb) + 4.2;
        const lw = Math.max(1.5, this.scale * 0.05);
        for (const [x, y] of [
          [xa, ya],
          [xb, yb],
        ]) {
          c.fillStyle = '#f2f2f2';
          c.fillRect(this.sx(x) - this.scale * 0.1, this.sy(top), this.scale * 0.2, this.sy(y) - this.sy(top));
          c.strokeStyle = INK;
          c.lineWidth = lw;
          c.strokeRect(this.sx(x) - this.scale * 0.1, this.sy(top), this.scale * 0.2, this.sy(y) - this.sy(top));
        }
        // checkered banner
        const bx = this.sx(xa) - this.scale * 0.3;
        const bw = this.sx(xb) - this.sx(xa) + this.scale * 0.6;
        const by = this.sy(top + 0.2);
        const bh = this.scale * 0.8;
        const cells = 10;
        for (let i = 0; i < cells; i++)
          for (let j = 0; j < 2; j++) {
            c.fillStyle = (i + j) % 2 ? INK : '#ffffff';
            c.fillRect(bx + (bw / cells) * i, by + (bh / 2) * j, bw / cells + 0.5, bh / 2 + 0.5);
          }
        c.strokeStyle = INK;
        c.lineWidth = lw;
        c.strokeRect(bx, by, bw, bh);
      }
    }
  }

  private drawMarksFront(c: CanvasRenderingContext2D, game: Game, x0: number, x1: number, pal: BiomePalette): void {
    const w = game.world;
    for (const m of w.marks) {
      if (m.x1 < x0 - 5 || m.x0 > x1 + 5) continue;
      if (m.kind === 'berm') {
        // banked wall of dirt behind the track (as seen in a turn)
        c.beginPath();
        const steps = 24;
        for (let k = 0; k <= steps; k++) {
          const x = m.x0 + ((m.x1 - m.x0) * k) / steps;
          const u = k / steps;
          const y = w.heightAt(x) + 0.5 + Math.sin(Math.PI * u) * 1.6;
          if (k === 0) c.moveTo(this.sx(x), this.sy(w.heightAt(x) + 0.5));
          c.lineTo(this.sx(x), this.sy(y));
        }
        for (let k = steps; k >= 0; k--) {
          const x = m.x0 + ((m.x1 - m.x0) * k) / steps;
          c.lineTo(this.sx(x), this.sy(w.heightAt(x) + 0.5));
        }
        c.closePath();
        c.fillStyle = pal.dirtLight;
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = Math.max(1.5, this.scale * 0.04);
        c.stroke();
        // tyre marks on the berm
        c.beginPath();
        for (let k = 2; k <= 22; k++) {
          const x = m.x0 + ((m.x1 - m.x0) * k) / 24;
          const y = w.heightAt(x) + 0.5 + Math.sin((Math.PI * k) / 24) * 0.9;
          if (k === 2) c.moveTo(this.sx(x), this.sy(y));
          else c.lineTo(this.sx(x), this.sy(y));
        }
        c.strokeStyle = pal.dirtDark;
        c.lineWidth = Math.max(1, this.scale * 0.05);
        c.stroke();
      }
    }
  }

  // ---------------------------------------------------------------- props

  private drawSprite(c: CanvasRenderingContext2D, spr: Sprite, x: number, y: number, scaleM: number, flip: boolean): void {
    const ppm = this.scale * scaleM;
    const X = this.sx(x);
    const Y = this.sy(y);
    if (flip) {
      c.save();
      c.translate(X, Y);
      c.scale(-1, 1);
      c.drawImage(spr.canvas, -spr.ax * ppm, -spr.ay * ppm, spr.w * ppm, spr.h * ppm);
      c.restore();
    } else {
      c.drawImage(spr.canvas, X - spr.ax * ppm, Y - spr.ay * ppm, spr.w * ppm, spr.h * ppm);
    }
  }

  /**
   * back=true: props behind the track (depth > 0), drawn on the back field from far to near.
   * onTrack=true: track obstacles (depth 0, e.g. logs). Otherwise: foreground props (depth < 0).
   */
  private drawProps(c: CanvasRenderingContext2D, game: Game, x0: number, x1: number, back: boolean, onTrack = false): void {
    const w = game.world;
    const props = w.props;
    // binary search first visible prop
    let lo = 0;
    let hi = props.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (props[mid].x < x0 - 6) lo = mid + 1;
      else hi = mid;
    }
    if (back) {
      // two passes: far then near
      for (const pass of [0, 1]) {
        for (let i = lo; i < props.length && props[i].x < x1 + 6; i++) {
          const p = props[i];
          if (p.depth <= 0) continue;
          if (pass === 0 ? p.depth < 0.5 : p.depth >= 0.5) continue;
          const biome = w.biomeAt(p.x);
          const spr = propSprite(p.kind, p.variant, biome);
          const shrink = 1 - p.depth * 0.35;
          const base = Math.max(w.visualAt(p.x), w.heightAt(p.x)) + 0.4 + p.depth * 1.3;
          c.globalAlpha = 1;
          this.drawSprite(c, spr, p.x, base, p.scale * shrink, p.flip);
        }
      }
      return;
    }
    if (onTrack) {
      for (let i = lo; i < props.length && props[i].x < x1 + 6; i++) {
        const p = props[i];
        if (p.depth !== 0) continue;
        const spr = propSprite(p.kind, p.variant, w.biomeAt(p.x));
        this.drawSprite(c, spr, p.x, w.heightAt(p.x - 0.5) - 0.12, 0.62, false);
      }
      return;
    }
    // foreground: slightly larger and with extra parallax
    for (let i = lo; i < props.length && props[i].x < x1 + 6; i++) {
      const p = props[i];
      if (p.depth >= 0) continue;
      const k = -p.depth;
      const biome = w.biomeAt(p.x);
      const spr = propSprite(p.kind, p.variant, biome);
      const px = this.camX + (p.x - this.camX) * (1 + k * 0.15);
      const y = w.visualAt(p.x) - 0.9 - k * 1.3;
      this.drawSprite(c, spr, px, y, p.scale * (0.8 + k * 0.3), p.flip);
    }
  }

  private drawPickups(c: CanvasRenderingContext2D, game: Game, x0: number, x1: number): void {
    for (const p of game.world.pickups) {
      if (p.x < x0 - 2 || p.x > x1 + 2) continue;
      let scale = 1;
      let y = p.y + Math.sin(this.time * 3 + p.x) * 0.15;
      if (p.taken) {
        const t = game.time - p.takenAt;
        if (t > 0.4) continue;
        scale = 1 + t * 2;
        y += t * 3;
        c.globalAlpha = 1 - t / 0.4;
      }
      // glow
      const X = this.sx(p.x);
      const Y = this.sy(y + 0.45);
      const g = c.createRadialGradient(X, Y, 0, X, Y, this.scale * 1.1);
      g.addColorStop(0, p.kind === 'fuel' ? 'rgba(255,210,80,0.55)' : 'rgba(120,210,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(X - this.scale * 1.2, Y - this.scale * 1.2, this.scale * 2.4, this.scale * 2.4);
      this.drawSprite(c, pickupSprite(p.kind), p.x, y, scale, false);
      c.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- bike

  private drawBike(c: CanvasRenderingContext2D, game: Game): void {
    const b = game.bike;
    const w = game.world;
    // soft shadow on the ground
    const gy = w.heightAt(b.x);
    const height = Math.max(0, b.y - gy - 0.8);
    const sw = (1.1 / (1 + height * 0.25)) * this.scale;
    c.fillStyle = `rgba(30,20,10,${0.32 / (1 + height * 0.3)})`;
    c.beginPath();
    c.ellipse(this.sx(b.x), this.sy(gy) - this.scale * 0.15, sw, sw * 0.18, 0, 0, Math.PI * 2);
    c.fill();

    const [ox, oy] = b.pointWorld(0, 0);
    const riderOn = !(game.ragdoll && game.crashTimer > 0);
    c.save();
    c.translate(this.sx(ox), this.sy(oy));
    if (this.bikeSprite) {
      this.bikeSprite.update(b, this.lastDt);
      this.bikeSprite.draw(c, b, this.scale);
    } else this.bikeR.draw(c, b, this.scale, riderOn);
    c.restore();

    if (!riderOn && game.ragdoll && !this.bikeSprite) {
      const r = game.ragdoll;
      c.save();
      c.translate(this.sx(r.x), this.sy(r.y));
      c.rotate(-r.angle);
      c.scale(this.scale, -this.scale);
      this.bikeR.rider(c, tumblePose());
      c.restore();
    }
  }

  private drawParticles(c: CanvasRenderingContext2D, game: Game): void {
    for (const p of game.particles.list) {
      const t = p.life / p.maxLife;
      const X = this.sx(p.x);
      const Y = this.sy(p.y);
      const r = Math.max(1, p.size * this.scale);
      switch (p.kind) {
        case 'dust': {
          // pre-rendered soft puff, tinted per surface colour
          c.globalAlpha = Math.min(1, t * 1.4) * 0.55;
          const spr = this.puff(p.r, p.g, p.b);
          c.drawImage(spr, X - r * 1.25, Y - r * 1.25, r * 2.5, r * 2.5);
          c.globalAlpha = 1;
          break;
        }
        case 'clod':
          c.fillStyle = `rgb(${p.r | 0},${p.g | 0},${p.b | 0})`;
          c.save();
          c.translate(X, Y);
          c.rotate(p.rot);
          c.fillRect(-r, -r * 0.8, r * 2, r * 1.6);
          c.restore();
          break;
        case 'splash':
          c.fillStyle = `rgba(220,245,255,${Math.min(1, t * 2)})`;
          c.beginPath();
          c.arc(X, Y, r, 0, Math.PI * 2);
          c.fill();
          break;
        case 'spark':
        case 'leaf':
          c.fillStyle = `rgba(${p.r},${p.g},${p.b},${t})`;
          c.save();
          c.translate(X, Y);
          c.rotate(p.rot);
          c.fillRect(-r, -r * 0.3, r * 2, r * 0.6);
          c.fillRect(-r * 0.3, -r, r * 0.6, r * 2);
          c.restore();
          break;
      }
    }
  }

  private puffs = new Map<number, HTMLCanvasElement>();

  /** Soft painterly dust puff (lit from the upper left), cached per quantised colour. */
  private puff(r: number, g: number, b: number): HTMLCanvasElement {
    const q = (v: number) => Math.max(0, Math.min(15, Math.round(v / 17)));
    const key = (q(r) << 8) | (q(g) << 4) | q(b);
    let cv = this.puffs.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d')!;
    const R = q(r) * 17;
    const G = q(g) * 17;
    const B = q(b) * 17;
    const grad = c.createRadialGradient(26, 26, 2, 32, 32, 31);
    grad.addColorStop(0, `rgba(${Math.min(255, R + 50)},${Math.min(255, G + 45)},${Math.min(255, B + 40)},0.95)`);
    grad.addColorStop(0.55, `rgba(${R},${G},${B},0.8)`);
    grad.addColorStop(1, `rgba(${R},${G},${B},0)`);
    c.fillStyle = grad;
    c.fillRect(0, 0, 64, 64);
    this.puffs.set(key, cv);
    return cv;
  }

  private drawPopups(c: CanvasRenderingContext2D, game: Game): void {
    const size = Math.round(this.H * 0.05);
    c.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    for (const p of game.popups) {
      const a = Math.min(1, p.life * 2);
      c.globalAlpha = a;
      const X = this.sx(p.x);
      const Y = this.sy(p.y);
      c.strokeStyle = INK;
      c.lineWidth = size * 0.22;
      c.strokeText(p.text, X, Y);
      c.fillStyle = p.color;
      c.fillText(p.text, X, Y);
    }
    c.globalAlpha = 1;
  }
}
