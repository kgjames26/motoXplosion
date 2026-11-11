import { approach, clamp, hash1 } from '../core/math';
import type { Game } from '../game';
import { Biome, DX, Surface } from '../world/types';
import { Background } from './background';
import { BikeRenderer, tumblePose } from './bikeRenderer';
import { BiomePalette, INK, mixPalette, PALETTES } from './palette';
import { cloudSprite, pickupSprite, propSprite, Sprite } from './sprites';

/**
 * Main 2.5D cel-shaded renderer (Canvas 2D). Works in device pixels.
 * Draw order: sky → clouds → parallax layers → back field + props → track (with depth band)
 * → bridges → pickups → bike shadow / bike → particles → foreground props → popups.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg = new Background();
  private bikeR = new BikeRenderer();
  W = 0;
  H = 0;
  dpr = 1;
  // camera (world metres)
  camX = 0;
  camY = 0;
  scale = 40; // px per metre
  private zoom = 1;
  // biome crossfade
  private biome: Biome = Biome.Meadow;
  private prevBiome: Biome = Biome.Meadow;
  private fade = 1;
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
  }

  resize(): void {
    // Cap the backing resolution for performance on high-DPI phones.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

  private sx(x: number): number {
    return (x - this.camX) * this.scale + this.W * 0.5;
  }
  private sy(y: number): number {
    return this.H * 0.5 - (y - this.camY) * this.scale;
  }

  /** Camera follows the bike with speed-dependent look-ahead and zoom. */
  private updateCamera(game: Game, dt: number, snap: boolean): void {
    const b = game.bike;
    const target = game.ragdoll && game.crashTimer > 0 ? game.ragdoll : b;
    // Visible height ~11 m (a bit wider than the references), more when fast or flying.
    const speedZoom = clamp(b.speed / 30, 0, 1) * 0.15 + clamp(b.airTime / 1.2, 0, 1) * 0.15;
    this.zoom = snap ? 1 + speedZoom : approach(this.zoom, 1 + speedZoom, 1.5, dt);
    const visibleH = 11 * this.zoom;
    this.scale = this.H / visibleH;
    const visibleW = this.W / this.scale;
    const lookAhead = clamp(b.vx * 0.35, -2, 8) + visibleW * 0.12;
    const tx = target.x + lookAhead;
    const ground = game.world.heightAt(b.x + lookAhead * 0.8);
    const ty = Math.max(target.y, ground + 0.8) + visibleH * 0.08 + clamp(b.vy * 0.12, -1.5, 1.5);
    if (snap) {
      this.camX = tx;
      this.camY = ty;
    } else {
      this.camX = approach(this.camX, tx, 6, dt);
      this.camY = approach(this.camY, ty, 3.2, dt);
    }
  }

  render(game: Game, dt: number, snap = false): void {
    this.time += dt;
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
    const pal = mixPalette(PALETTES[this.prevBiome], PALETTES[this.biome], this.fade);

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

    this.drawClouds(c);

    // ---- parallax layers (crossfaded)
    if (this.fade < 1) this.bg.draw(c, this.prevBiome, this.camX, this.camY, this.scale, W, H, 1);
    this.bg.draw(c, this.biome, this.camX, this.camY, this.scale, W, H, this.fade < 1 ? this.fade : 1);

    // ---- visible world range
    const x0 = this.camX - W / 2 / this.scale - 4;
    const x1 = this.camX + W / 2 / this.scale + 4;
    world.ensure(x1 + 10);

    this.drawBackField(c, game, x0, x1, pal);
    this.drawProps(c, game, x0, x1, true);
    this.drawMarksBack(c, game, x0, x1);
    this.drawTrack(c, game, x0, x1, pal);
    this.drawBridges(c, game, x0, x1);
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

  // ---------------------------------------------------------------- ground

  /** Grass field behind the track, rising a bit (fake depth). */
  private drawBackField(c: CanvasRenderingContext2D, game: Game, x0: number, x1: number, pal: BiomePalette): void {
    const w = game.world;
    const step = DX * 2;
    const lift = 1.6; // metres of back field above the track line
    c.beginPath();
    c.moveTo(this.sx(x0), this.H);
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
      const y = w.visualAt(x) + lift + Math.sin(x * 0.21) * 0.25;
      c.lineTo(this.sx(x), this.sy(y));
    }
    c.lineTo(this.sx(x1), this.H);
    c.closePath();
    const g = c.createLinearGradient(0, this.sy(this.camY + 4), 0, this.sy(this.camY - 4));
    g.addColorStop(0, pal.grassDark);
    g.addColorStop(1, pal.grass);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(28,26,43,0.35)';
    c.lineWidth = Math.max(1, this.scale * 0.03);
    c.stroke();
  }

  private drawTrack(c: CanvasRenderingContext2D, game: Game, x0: number, x1: number, pal: BiomePalette): void {
    const w = game.world;
    const i0 = Math.floor(x0 / DX);
    const i1 = Math.ceil(x1 / DX);
    const band = 0.75; // track surface depth (m) seen from slightly above
    const lw = Math.max(1.5, this.scale * 0.05);

    // 1. Ground body (front face) using the visual profile (ravines under bridges).
    c.beginPath();
    c.moveTo(this.sx(i0 * DX), this.H + 10);
    for (let i = i0; i <= i1; i++) c.lineTo(this.sx(i * DX), this.sy(w.sampleVisual(i)));
    c.lineTo(this.sx(i1 * DX), this.H + 10);
    c.closePath();
    const body = c.createLinearGradient(0, this.sy(this.camY), 0, this.H);
    body.addColorStop(0, pal.grass);
    body.addColorStop(0.5, pal.grassDark);
    body.addColorStop(1, pal.mesas ? pal.soil : pal.forestShade);
    c.fillStyle = body;
    c.fill();

    // ravine / cliff walls under bridges and deep pits: rock faces
    c.save();
    c.clip();
    for (const br of w.bridges) {
      if (br.x1 < x0 || br.x0 > x1) continue;
      const left = this.sx(br.x0 - 0.5);
      const right = this.sx(br.x1 + 0.5);
      const top = this.sy(br.deckY0 + 0.2);
      const bottom = this.sy(br.floorY - 2);
      const g = c.createLinearGradient(0, top, 0, bottom);
      g.addColorStop(0, pal.rock);
      g.addColorStop(1, pal.rockShade);
      c.fillStyle = g;
      c.fillRect(left, top, right - left, bottom - top + this.H);
      // rock strata
      c.strokeStyle = 'rgba(28,26,43,0.25)';
      c.lineWidth = lw * 0.6;
      for (let k = 1; k < 8; k++) {
        const y = top + ((bottom - top) * k) / 8;
        c.beginPath();
        c.moveTo(left, y);
        c.lineTo(right, y + Math.sin(k) * this.scale * 0.3);
        c.stroke();
      }
      if (br.water) {
        // river with highlights
        const wy = this.sy(br.floorY + 0.8);
        c.fillStyle = pal.water;
        c.fillRect(left, wy, right - left, this.H);
        c.fillStyle = pal.waterLight;
        for (let k = 0; k < 12; k++) {
          const fx = left + ((k * 97 + this.time * 60 * this.dpr) % Math.max(1, right - left));
          c.fillRect(fx, wy + this.scale * (0.2 + (k % 3) * 0.35), this.scale * 0.8, Math.max(2, this.scale * 0.06));
        }
        c.fillStyle = 'rgba(255,255,255,0.8)';
        c.fillRect(left, wy - 1, right - left, Math.max(2, this.scale * 0.08));
      }
    }
    c.restore();

    // 2. Track band: physical surface with a depth band (2.5D top face)
    const topPts: [number, number][] = [];
    for (let i = i0; i <= i1; i++) {
      const surf = w.sampleSurface(i);
      const h = w.sampleHeight(i);
      if (surf === Surface.Wood) {
        topPts.push([NaN, NaN]);
        continue;
      }
      topPts.push([this.sx(i * DX), this.sy(h)]);
    }
    const bandPx = band * this.scale;
    // draw contiguous runs (bridges break the band)
    let run: [number, number][] = [];
    const flush = () => {
      if (run.length < 2) {
        run = [];
        return;
      }
      // dirt top face
      c.beginPath();
      c.moveTo(run[0][0], run[0][1] - bandPx);
      for (const [x, y] of run) c.lineTo(x, y - bandPx);
      for (let k = run.length - 1; k >= 0; k--) c.lineTo(run[k][0], run[k][1] + bandPx * 0.25);
      c.closePath();
      c.fillStyle = pal.dirt;
      c.fill();
      // front lip (darker soil strip)
      c.beginPath();
      c.moveTo(run[0][0], run[0][1] + bandPx * 0.25);
      for (const [x, y] of run) c.lineTo(x, y + bandPx * 0.25);
      for (let k = run.length - 1; k >= 0; k--) c.lineTo(run[k][0], run[k][1] + bandPx * 0.6);
      c.closePath();
      c.fillStyle = pal.dirtDark;
      c.fill();
      // ruts (follow the curve)
      c.lineWidth = Math.max(1, this.scale * 0.035);
      for (const [off, col] of [
        [-0.75, pal.dirtLight],
        [-0.45, pal.dirtDark],
        [-0.15, pal.dirtLight],
      ] as [number, string][]) {
        c.beginPath();
        for (let k = 0; k < run.length; k++) {
          const [x, y] = run[k];
          if (k === 0) c.moveTo(x, y + off * bandPx);
          else c.lineTo(x, y + off * bandPx);
        }
        c.strokeStyle = col;
        c.globalAlpha = 0.55;
        c.stroke();
      }
      c.globalAlpha = 1;
      // grass fringe on the back edge
      c.beginPath();
      c.moveTo(run[0][0], run[0][1] - bandPx);
      for (const [x, y] of run) c.lineTo(x, y - bandPx);
      c.strokeStyle = pal.grassDark;
      c.lineWidth = Math.max(2, this.scale * 0.12);
      c.stroke();
      c.strokeStyle = INK;
      c.lineWidth = lw * 0.6;
      c.stroke();
      // contour on the front edge
      c.beginPath();
      c.moveTo(run[0][0], run[0][1] + bandPx * 0.6);
      for (const [x, y] of run) c.lineTo(x, y + bandPx * 0.6);
      c.strokeStyle = INK;
      c.lineWidth = lw;
      c.stroke();
      run = [];
    };
    for (const p of topPts) {
      if (isNaN(p[0])) flush();
      else run.push(p);
    }
    flush();

    // 3. Surface patches: water fords, rock, grass, mud tints along the band
    for (let i = i0; i < i1; i++) {
      const s = w.sampleSurface(i);
      if (s === Surface.Dirt || s === Surface.Wood) continue;
      const xa = this.sx(i * DX);
      const xb = this.sx((i + 1) * DX);
      const ya = this.sy(w.sampleHeight(i));
      const yb = this.sy(w.sampleHeight(i + 1));
      let col = '';
      let alpha = 0.55;
      switch (s) {
        case Surface.Water:
          col = pal.water;
          alpha = 0.85;
          break;
        case Surface.Mud:
          col = '#6a4527';
          break;
        case Surface.Rock:
          col = pal.rock;
          alpha = 0.6;
          break;
        case Surface.Grass:
          col = pal.grass;
          break;
        case Surface.Sand:
          col = '#f0c48a';
          alpha = 0.35;
          break;
      }
      c.globalAlpha = alpha;
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(xa, ya - bandPx);
      c.lineTo(xb + 0.5, yb - bandPx);
      c.lineTo(xb + 0.5, yb + bandPx * 0.25);
      c.lineTo(xa, ya + bandPx * 0.25);
      c.fill();
      if (s === Surface.Water && hash1(i, 5) > 0.6) {
        c.globalAlpha = 0.9;
        c.fillStyle = pal.waterLight;
        c.fillRect(xa, ya - bandPx * (0.2 + hash1(i, 6) * 0.6), (xb - xa) * 1.5, Math.max(1.5, this.scale * 0.04));
      }
    }
    c.globalAlpha = 1;
  }

  private drawBridges(c: CanvasRenderingContext2D, game: Game, x0: number, x1: number): void {
    const w = game.world;
    const lw = Math.max(1.5, this.scale * 0.045);
    for (const br of w.bridges) {
      if (br.x1 < x0 - 2 || br.x0 > x1 + 2) continue;
      const deck = (x: number) => w.heightAt(x);
      // support beams (diagonal struts into the cliffs)
      for (const [bx, dir] of [
        [br.x0, 1],
        [br.x1, -1],
      ] as [number, number][]) {
        c.beginPath();
        c.moveTo(this.sx(bx - dir * 1.5), this.sy(deck(bx) - 3.5));
        c.lineTo(this.sx(bx + dir * 3), this.sy(deck(bx + dir * 3) - 0.3));
        c.strokeStyle = INK;
        c.lineWidth = this.scale * 0.28 + lw * 2;
        c.stroke();
        c.strokeStyle = '#8a5a33';
        c.lineWidth = this.scale * 0.28;
        c.stroke();
      }
      // planks
      const plank = 0.55;
      const bandPx = 0.75 * this.scale;
      for (let x = br.x0; x < br.x1; x += plank) {
        const xa = this.sx(x);
        const xb = this.sx(x + plank * 0.92);
        const ya = this.sy(deck(x));
        const yb = this.sy(deck(x + plank));
        const shade = hash1(Math.round(x * 10), 3);
        c.beginPath();
        c.moveTo(xa, ya - bandPx);
        c.lineTo(xb, yb - bandPx);
        c.lineTo(xb, yb + bandPx * 0.45);
        c.lineTo(xa, ya + bandPx * 0.45);
        c.closePath();
        c.fillStyle = shade > 0.5 ? '#b07a45' : '#c28a52';
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = lw * 0.7;
        c.stroke();
        c.fillStyle = 'rgba(255,230,190,0.35)';
        c.fillRect(xa + 1, ya - bandPx + 1, (xb - xa) * 0.3, bandPx * 0.9);
      }
      // stringer beam under the deck
      c.beginPath();
      for (let x = br.x0; x <= br.x1; x += 0.5) {
        const X = this.sx(x);
        const Y = this.sy(deck(x)) + bandPx * 0.45;
        if (x === br.x0) c.moveTo(X, Y);
        else c.lineTo(X, Y);
      }
      c.strokeStyle = INK;
      c.lineWidth = this.scale * 0.16 + lw * 2;
      c.stroke();
      c.strokeStyle = '#7a4c2a';
      c.lineWidth = this.scale * 0.16;
      c.stroke();
      // posts and ropes (front side)
      const postH = 1.3;
      const posts: number[] = [];
      for (let x = br.x0; x <= br.x1 + 0.01; x += (br.x1 - br.x0) / Math.max(2, Math.round((br.x1 - br.x0) / 3))) posts.push(x);
      for (const px of posts) {
        const big = px === posts[0] || px === posts[posts.length - 1];
        const ph = big ? postH + 0.6 : postH;
        const X = this.sx(px);
        const Y = this.sy(deck(px));
        const pw = this.scale * (big ? 0.22 : 0.08);
        c.fillStyle = big ? '#8a5a33' : '#c8a070';
        c.fillRect(X - pw / 2, Y - ph * this.scale, pw, ph * this.scale + bandPx * 0.4);
        c.strokeStyle = INK;
        c.lineWidth = lw * 0.7;
        c.strokeRect(X - pw / 2, Y - ph * this.scale, pw, ph * this.scale + bandPx * 0.4);
      }
      for (const rh of [postH, postH * 0.55]) {
        c.beginPath();
        for (let x = br.x0; x <= br.x1; x += 0.4) {
          const u = (x - br.x0) / (br.x1 - br.x0);
          const sag = Math.sin(Math.PI * u) * 0.35;
          const X = this.sx(x);
          const Y = this.sy(deck(x) + rh + 0.3 - sag);
          if (x === br.x0) c.moveTo(X, Y);
          else c.lineTo(X, Y);
        }
        c.strokeStyle = INK;
        c.lineWidth = this.scale * 0.07 + lw;
        c.stroke();
        c.strokeStyle = '#d9b27a';
        c.lineWidth = this.scale * 0.07;
        c.stroke();
      }
    }
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
    this.bikeR.draw(c, b, this.scale, riderOn);
    c.restore();

    if (!riderOn && game.ragdoll) {
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
          const a = Math.min(1, t * 1.4) * 0.42;
          c.fillStyle = `rgba(${p.r | 0},${p.g | 0},${p.b | 0},${a})`;
          c.beginPath();
          c.arc(X, Y, r, 0, Math.PI * 2);
          c.fill();
          // lit top (cel two-tone)
          c.fillStyle = `rgba(255,240,215,${a * 0.45})`;
          c.beginPath();
          c.arc(X - r * 0.25, Y - r * 0.3, r * 0.55, 0, Math.PI * 2);
          c.fill();
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
