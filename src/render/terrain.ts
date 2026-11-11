import { hash1 } from '../core/math';
import { Biome, DX, Surface } from '../world/types';
import type { World } from '../world/world';
import { BiomePalette } from './palette';
import { propSprite } from './sprites';
import type { Textures, View } from './view';

/**
 * Ground rendering: grass field behind the track, the textured track band (seen slightly
 * from above, 2.5D), the ground body in front, ravines/valleys under bridges.
 */

const BAND = 0.8; // track surface depth (m)
const LIFT = 1.1; // back field height above the track line

export function drawBackField(c: CanvasRenderingContext2D, v: View, w: World, x0: number, x1: number, pal: BiomePalette, tex: Textures | null, warm: boolean): void {
  const step = DX * 2;
  c.beginPath();
  c.moveTo(v.sx(x0), v.H);
  for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
    const y = w.visualAt(x) + LIFT + Math.sin(x * 0.21) * 0.22 + Math.sin(x * 0.057) * 0.35;
    c.lineTo(v.sx(x), v.sy(y));
  }
  c.lineTo(v.sx(x1), v.H);
  c.closePath();
  const pat = tex?.get(warm ? 'rockWarm' : 'grass', v, warm ? 1.4 : 1.2, 0.3);
  c.fillStyle = pat ?? pal.grass;
  c.fill();
  // atmospheric haze: the field is a little further away than the track
  const g = c.createLinearGradient(0, v.sy(v.camY + 5), 0, v.sy(v.camY - 3));
  g.addColorStop(0, warm ? 'rgba(255,214,170,0.35)' : 'rgba(210,240,200,0.32)');
  g.addColorStop(1, warm ? 'rgba(120,60,30,0.15)' : 'rgba(30,70,30,0.18)');
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = 'rgba(28,26,43,0.25)';
  c.lineWidth = Math.max(1, v.scale * 0.025);
  c.stroke();
}

/** Ground body in front of the track and ravines under bridges. */
export function drawGround(c: CanvasRenderingContext2D, v: View, w: World, x0: number, x1: number, pal: BiomePalette, tex: Textures | null, warm: boolean): void {
  const i0 = Math.floor(x0 / DX);
  const i1 = Math.ceil(x1 / DX);
  // ravines / valleys under bridges: far cliff wall or valley, river at the bottom.
  // Drawn first: the ground body below covers everything under the visual profile.
  for (const br of w.bridges) {
    if (br.x1 < x0 - 12 || br.x0 > x1 + 12) continue;
    const pad = br.kind === 'viaduct' ? 9 : 1.5;
    const left = v.sx(br.x0 - pad);
    const right = v.sx(br.x1 + pad);
    const top = v.sy(br.deckY0 + 0.6);
    const bottom = v.sy(br.floorY - 1);
    if (br.kind === 'viaduct' && !br.water) {
      c.fillStyle = (tex?.get('grass', v, 0.6) ?? pal.grass) as string | CanvasPattern;
    } else {
      c.fillStyle = (tex?.get(warm ? 'rockWarm' : 'rock', v, 1.1) ?? pal.rock) as string | CanvasPattern;
    }
    c.fillRect(left, top, right - left, v.H - top);
    const g = c.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, warm ? 'rgba(255,220,180,0.25)' : 'rgba(200,225,255,0.3)');
    g.addColorStop(1, warm ? 'rgba(70,25,10,0.5)' : 'rgba(15,30,45,0.5)');
    c.fillStyle = g;
    c.fillRect(left, top, right - left, v.H - top);
    if (br.water) drawRiver(c, v, left, right, v.sy(br.floorY + 0.8), pal);
  }

  c.beginPath();
  c.moveTo(v.sx(i0 * DX), v.H + 10);
  for (let i = i0; i <= i1; i++) c.lineTo(v.sx(i * DX), v.sy(w.sampleVisual(i)));
  c.lineTo(v.sx(i1 * DX), v.H + 10);
  c.closePath();
  c.fillStyle = (warm ? tex?.get('rockWarm', v, 0.9) : tex?.get('grass', v, 0.9)) ?? pal.grass;
  c.fill();
  // depth shading going down (the near ground slope falls away from the light)
  const body = c.createLinearGradient(0, v.sy(v.camY - 0.5), 0, v.H);
  body.addColorStop(0, 'rgba(0,0,0,0)');
  body.addColorStop(1, warm ? 'rgba(80,30,10,0.45)' : 'rgba(10,40,15,0.5)');
  c.fillStyle = body;
  c.fill();
  // rocky cliff edges where the ground drops into a ravine
  c.save();
  c.clip();
  for (const br of w.bridges) {
    if (br.x1 < x0 - 12 || br.x0 > x1 + 12 || br.kind === 'viaduct') continue;
    for (const [edge, dir] of [
      [br.x0, -1],
      [br.x1, 1],
    ] as [number, number][]) {
      const xa = v.sx(edge + dir * 2.5);
      const xb = v.sx(edge - dir * 0.5);
      c.fillStyle = (tex?.get(warm ? 'rockWarm' : 'rock', v, 0.7) ?? pal.rock) as string | CanvasPattern;
      c.fillRect(Math.min(xa, xb), v.sy(br.deckY0 + 0.3), Math.abs(xb - xa), v.H);
    }
  }
  c.restore();
}

function drawRiver(c: CanvasRenderingContext2D, v: View, left: number, right: number, wy: number, pal: BiomePalette): void {
  const g = c.createLinearGradient(0, wy, 0, wy + v.scale * 3);
  g.addColorStop(0, pal.water);
  g.addColorStop(1, '#1f6fa8');
  c.fillStyle = g;
  c.fillRect(left, wy, right - left, v.H - wy + 10);
  // foam and ripples
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.fillRect(left, wy - 1, right - left, Math.max(2, v.scale * 0.08));
  const w = right - left;
  for (let k = 0; k < 22; k++) {
    const fx = left + ((k * 137 + v.time * v.scale * 1.8 * (k % 2 ? 1 : 0.6)) % Math.max(1, w));
    const fy = wy + v.scale * (0.25 + (k % 5) * 0.32);
    c.fillStyle = k % 3 ? 'rgba(220,245,255,0.75)' : 'rgba(255,255,255,0.9)';
    c.fillRect(fx, fy, v.scale * (0.5 + (k % 4) * 0.35), Math.max(1.5, v.scale * 0.05));
  }
}

/** The textured track band (dirt seen slightly from above) with lip, ruts and grass edges. */
export function drawTrack(c: CanvasRenderingContext2D, v: View, w: World, x0: number, x1: number, pal: BiomePalette, tex: Textures | null, warm: boolean, biomeAt: (x: number) => Biome): void {
  const i0 = Math.floor(x0 / DX);
  const i1 = Math.ceil(x1 / DX);
  const bandPx = BAND * v.scale;
  const lw = Math.max(1.5, v.scale * 0.045);
  // contiguous runs, interrupted by bridges (they draw their own deck)
  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  for (let i = i0; i <= i1; i++) {
    const x = i * DX;
    if (w.bridgeAt(x)) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    run.push([v.sx(x), v.sy(w.sampleHeight(i))]);
  }
  if (run.length) runs.push(run);

  const dirt = tex?.get('dirt', v, 1, 0);
  for (const r of runs) {
    if (r.length < 2) continue;
    // top face
    c.beginPath();
    c.moveTo(r[0][0], r[0][1] - bandPx);
    for (const [x, y] of r) c.lineTo(x, y - bandPx);
    for (let k = r.length - 1; k >= 0; k--) c.lineTo(r[k][0], r[k][1] + bandPx * 0.22);
    c.closePath();
    c.fillStyle = dirt ?? pal.dirt;
    c.fill();
    if (warm) {
      c.fillStyle = 'rgba(255,190,120,0.22)';
      c.fill();
    }
    // light falloff: back of the band a bit lighter, front darker
    c.fillStyle = 'rgba(255,235,200,0.10)';
    c.beginPath();
    c.moveTo(r[0][0], r[0][1] - bandPx);
    for (const [x, y] of r) c.lineTo(x, y - bandPx);
    for (let k = r.length - 1; k >= 0; k--) c.lineTo(r[k][0], r[k][1] - bandPx * 0.55);
    c.closePath();
    c.fill();
    // front lip (soil cross-section)
    c.beginPath();
    c.moveTo(r[0][0], r[0][1] + bandPx * 0.22);
    for (const [x, y] of r) c.lineTo(x, y + bandPx * 0.22);
    for (let k = r.length - 1; k >= 0; k--) c.lineTo(r[k][0], r[k][1] + bandPx * 0.62);
    c.closePath();
    c.fillStyle = dirt ?? pal.dirtDark;
    c.fill();
    c.fillStyle = warm ? 'rgba(110,40,15,0.5)' : 'rgba(60,30,12,0.55)';
    c.fill();
    // tyre ruts following the curve
    c.lineWidth = Math.max(1, v.scale * 0.06);
    for (const [off, col] of [
      [-0.62, 'rgba(90,50,25,0.35)'],
      [-0.5, 'rgba(255,225,180,0.22)'],
      [-0.18, 'rgba(90,50,25,0.4)'],
      [-0.07, 'rgba(255,225,180,0.25)'],
    ] as [number, string][]) {
      c.beginPath();
      for (let k = 0; k < r.length; k++) {
        const [x, y] = r[k];
        if (k === 0) c.moveTo(x, y + off * bandPx);
        else c.lineTo(x, y + off * bandPx);
      }
      c.strokeStyle = col;
      c.stroke();
    }
    // contour of the front edge
    c.beginPath();
    c.moveTo(r[0][0], r[0][1] + bandPx * 0.62);
    for (const [x, y] of r) c.lineTo(x, y + bandPx * 0.62);
    c.strokeStyle = 'rgba(28,20,20,0.75)';
    c.lineWidth = lw;
    c.stroke();
  }

  // surface patches (water, mud, rock, grass, sand) over the band, merged into runs
  let i = i0;
  while (i < i1) {
    const s = w.sampleSurface(i);
    if (s === Surface.Dirt || s === Surface.Wood || w.bridgeAt(i * DX)) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < i1 && w.sampleSurface(j) === s && !w.bridgeAt(j * DX)) j++;
    c.beginPath();
    for (let k = i; k <= j; k++) {
      const X = v.sx(k * DX);
      const Y = v.sy(w.sampleHeight(k)) - bandPx;
      if (k === i) c.moveTo(X, Y);
      else c.lineTo(X, Y);
    }
    for (let k = j; k >= i; k--) c.lineTo(v.sx(k * DX), v.sy(w.sampleHeight(k)) + bandPx * 0.22);
    c.closePath();
    switch (s) {
      case Surface.Water:
        c.fillStyle = 'rgba(70,170,230,0.88)';
        c.fill();
        c.fillStyle = 'rgba(230,250,255,0.9)';
        for (let k = i; k < j; k++) {
          if (hash1(k, 5) < 0.5) continue;
          const xa = v.sx(k * DX);
          const ya = v.sy(w.sampleHeight(k));
          const drift = ((v.time * 0.6 + hash1(k, 9)) % 1) * DX * v.scale;
          c.fillRect(xa + drift, ya - bandPx * (0.15 + hash1(k, 6) * 0.7), DX * v.scale * 0.8, Math.max(1.5, v.scale * 0.04));
        }
        break;
      case Surface.Mud:
        c.fillStyle = 'rgba(70,42,22,0.55)';
        c.fill();
        c.fillStyle = 'rgba(255,240,220,0.22)';
        for (let k = i; k < j; k++) {
          if (hash1(k, 7) < 0.7) continue;
          c.fillRect(v.sx(k * DX), v.sy(w.sampleHeight(k)) - bandPx * (0.2 + hash1(k, 8) * 0.5), DX * v.scale * 1.2, Math.max(1, v.scale * 0.03));
        }
        break;
      case Surface.Rock:
        c.fillStyle = (tex?.get(warm ? 'rockWarm' : 'rock', v, 0.5) ?? pal.rock) as string | CanvasPattern;
        c.fill();
        break;
      case Surface.Grass:
        c.fillStyle = (tex?.get('grass', v, 0.8) ?? pal.grass) as string | CanvasPattern;
        c.globalAlpha = 0.85;
        c.fill();
        c.globalAlpha = 1;
        break;
      case Surface.Sand:
        c.fillStyle = 'rgba(240,196,138,0.35)';
        c.fill();
        break;
    }
    i = j;
  }

  // grass tufts along the back edge and hanging over the front lip
  const tuftStep = 0.8;
  for (let x = Math.floor(x0 / tuftStep) * tuftStep; x < x1; x += tuftStep) {
    if (w.bridgeAt(x)) continue;
    const biome = biomeAt(x);
    const h = w.heightAt(x);
    const n = hash1(Math.round(x / tuftStep), 91);
    const spr = propSprite(biome === Biome.Canyon ? (n > 0.6 ? 'rock' : 'grass') : n > 0.88 ? 'flower' : 'grass', Math.floor(n * 7), biome);
    const s = 0.45 + n * 0.25;
    const ppm = v.scale * s;
    const X = v.sx(x + n * 0.4);
    const Y = v.sy(h) - bandPx * 0.92;
    c.drawImage(spr.canvas, X - spr.ax * ppm, Y - spr.ay * ppm, spr.w * ppm, spr.h * ppm);
  }
}
