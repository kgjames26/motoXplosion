import { KMH } from '../units';
import { clamp } from '../core/math';
import { CHECKPOINT_EVERY, fmtClock, fmtMult, Game } from '../game';
import { WEATHER_ICONS, WEATHER_NAMES } from '../weather';

const $ = (id: string) => document.getElementById(id)!;

/**
 * DOM HUD: speedometer and, depending on the mode, energies (cruising, enduro), clock
 * (enduro), helmets / zone / points (trial), position and riders on the progress bar (race).
 */
export class Hud {
  private root = $('hud');
  private speed = $('speed');
  private gaugeFill = $('gauge-fill');
  private needle = $('gauge-needle');
  private fuelBar = $('fuel-bar');
  private staminaBar = $('stamina-bar');
  private fuelBox = this.fuelBar.closest('.energy')!;
  private staminaBox = this.staminaBar.closest('.energy')!;
  private progressFill = $('progress-fill');
  private progressMoto = $('progress-moto');
  private distance = $('distance');
  private distanceUnit = $('distance-unit');
  private lapsN = $('laps500-n');
  private timer = $('timer');
  private timerBox = $('hud-timer');
  private zone = $('trial-zone');
  private falls = $('trial-falls');
  private level = $('hud-level');
  private mult = $('mult');
  private pos = $('race-pos');
  private posSfx = $('race-pos-sfx');
  private riders = $('riders');
  private coins = $('coins');
  private coinsBox = $('hud-coins');
  private last = { speed: -1, dist: -1, coins: -1, clock: -1, mult: -1, mode: '', circuit: -1 };
  private dots: HTMLElement[] = [];
  private reliefKey = '';
  private reliefT = 0;
  private rLo = 0;
  private rHi = 0;

  /**
   * Cruising: the relief scrolls past the bike, which stays in the middle of the map (200 m behind,
   * 200 m ahead): the ground comes towards it.
   */
  private cruiseRelief(game: Game): void {
    const now = performance.now();
    if (now - this.reliefT < 45) return;
    this.reliefT = now;
    const w = game.world;
    const span = 400;
    const x0 = game.bike.x - span / 2;
    w.ensure(x0 + span + 10);
    const n = 160;
    const hs: number[] = [];
    for (let i = 0; i <= n; i++) hs.push(w.heightAt(x0 + (span * i) / n));
    let lo = Math.min(...hs);
    let hi = Math.max(...hs);
    if (hi - lo < 14) {
      const m = (hi + lo) / 2;
      lo = m - 7;
      hi = m + 7;
    }
    // the scale follows smoothly so the map does not jump when a hill enters it
    if (this.reliefKey !== 'scroll') {
      this.reliefKey = 'scroll';
      this.rLo = lo;
      this.rHi = hi;
    }
    this.rLo += (lo - this.rLo) * 0.15;
    this.rHi += (hi - this.rHi) * 0.15;
    const y = (h: number) => (92 - clamp((h - this.rLo) / (this.rHi - this.rLo), 0, 1) * 84).toFixed(1);
    const line = hs.map((h, i) => `${i ? 'L' : 'M'}${(i * 1000) / n} ${y(h)}`).join('');
    $('relief-line').setAttribute('d', line);
    $('relief-fill').setAttribute('d', `${line}L1000 100L0 100Z`);
  }

  /**
   * v2.21: a sober relief of the stretch shown by the progress bar (the whole circuit, or the
   * current kilometre in cruising), drawn just above it.
   */
  private relief(game: Game): void {
    const w = game.world;
    let x0: number, x1: number, key: string;
    if (game.mode === 'cruising') {
      this.cruiseRelief(game);
      return;
    } else {
      if (this.reliefKey === 'scroll') this.reliefKey = '';
      key = `${game.mode}:${game.circuit}:${w.seed}`;
      if (key === this.reliefKey) return;
      x0 = game.startX;
      if (game.mode === 'trial') {
        for (let i = 0; i < 40 && !isFinite(w.finishX); i++) w.ensure(game.bike.x + 300 + i * 200);
        x1 = isFinite(w.finishX) ? w.finishX : x0 + 1000;
      } else x1 = x0 + game.raceLen;
    }
    if (key === this.reliefKey) return;
    this.reliefKey = key;
    w.ensure(x1 + 10);
    const n = 200;
    const hs: number[] = [];
    for (let i = 0; i <= n; i++) hs.push(w.heightAt(x0 + ((x1 - x0) * i) / n));
    let lo = Math.min(...hs);
    let hi = Math.max(...hs);
    if (hi - lo < 8) { const m = (hi + lo) / 2; lo = m - 4; hi = m + 4; }
    const y = (h: number) => (92 - ((h - lo) / (hi - lo)) * 84).toFixed(1);
    const line = hs.map((h, i) => `${i ? 'L' : 'M'}${(i * 1000) / n} ${y(h)}`).join('');
    $('relief-line').setAttribute('d', line);
    $('relief-fill').setAttribute('d', `${line}L1000 100L0 100Z`);
  }

  /** v2.21 cruising: the speed window of the next jump, green when the speed is right. */
  private jumpHint(game: Game): void {
    const el = $('jump-hint');
    const j = game.mode === 'cruising' ? game.nextSpeedJump(130) : null;
    el.classList.toggle('hidden', !j);
    if (!j) return;
    $('jump-range').textContent = `${j.vmin}–${j.vmax}`;
    const v = game.bike.forwardSpeed * KMH;
    el.classList.toggle('ok', v >= j.vmin! && v <= j.vmax!);
    el.classList.toggle('fast', v > j.vmax!);
  }

  update(game: Game): void {
    const mode = game.mode;
    this.relief(game);
    this.jumpHint(game);
    if (mode !== this.last.mode) {
      this.last.mode = mode;
      this.root.dataset.mode = mode;
      this.last.dist = -1;
      this.last.clock = -1;
      this.last.mult = -1;
    }
    const wx = game.weatherNow;
    if (game.circuit * 10 + wx !== this.last.circuit) {
      this.last.circuit = game.circuit * 10 + wx;
      this.level.innerHTML = `${WEATHER_ICONS[wx]}${game.circuit ? `Circuit ${game.circuit} · ` : ''}${WEATHER_NAMES[wx]}`;
      this.riders.innerHTML = '';
      this.dots = [];
    }
    const kmh = Math.round(Math.abs(game.bike.forwardSpeed) * KMH);
    if (kmh !== this.last.speed) {
      this.last.speed = kmh;
      this.speed.textContent = String(kmh);
      const t = clamp(kmh / 175, 0, 1);
      this.gaugeFill.style.strokeDasharray = `${t * 100} 100`;
      this.needle.style.transform = `rotate(${-90 + t * 180}deg)`;
    }
    if (game.coinsRun !== this.last.coins) {
      if (this.last.coins >= 0) {
        this.coinsBox.classList.remove('pop');
        void this.coinsBox.offsetWidth;
        this.coinsBox.classList.add('pop');
      }
      this.last.coins = game.coinsRun;
      this.coins.textContent = String(game.coinsRun);
    }
    if (game.usesEnergy) {
      this.fuelBar.style.transform = `scaleX(${game.fuel / 100})`;
      this.staminaBar.style.transform = `scaleX(${game.stamina / 100})`;
      this.fuelBox.classList.toggle('low', game.fuel < 22);
      this.staminaBox.classList.toggle('low', game.stamina < 22);
    }
    // progress bar & counter
    let p = 0;
    let text = '';
    let unit = 'm';
    if (mode === 'trial' || mode === 'enduro') {
      const t = Math.floor(game.chrono * 10);
      if (t !== this.last.clock) {
        this.last.clock = t;
        this.timer.textContent = fmtClock(game.chrono);
      }
      this.timerBox.classList.remove('low');
    }
    switch (mode) {
      case 'cruising':
        p = (game.distance % CHECKPOINT_EVERY) / CHECKPOINT_EVERY;
        text = Math.floor(game.distance).toLocaleString('fr-FR');
        {
          const n = String(Math.floor(game.distance / CHECKPOINT_EVERY));
          if (n !== this.lapsN.textContent) this.lapsN.textContent = n;
        }
        if (game.cruiseMult !== this.last.mult) {
          this.last.mult = game.cruiseMult;
          this.mult.textContent = '×' + fmtMult(game.cruiseMult);
        }
        break;
      case 'enduro':
        p = game.progress;
        text = String(Math.max(0, Math.round(game.finishX - game.bike.x)));
        unit = 'm';
        break;
      case 'trial':
        p = game.progress;
        text = `${game.sectionsCleared}/${game.zones}`;
        unit = 'zones';
        this.zone.textContent = `${Math.max(game.section, 1)}/${game.zones}`;
        this.falls.textContent = String(game.falls);
        break;
      case 'course': {
        p = game.progress;
        text = String(Math.max(0, Math.round(game.finishX - game.bike.x)));
        unit = 'm';
        const pos = game.racePosition();
        this.pos.textContent = String(pos);
        this.posSfx.textContent = pos === 1 ? 'er' : 'e';
        $('race-total').textContent = `/${game.opponents.length + 1}`;
        if (!this.dots.length)
          for (const o of game.opponents) {
            const d = document.createElement('i');
            d.style.background = o.look.jersey;
            this.riders.appendChild(d);
            this.dots.push(d);
          }
        game.opponents.forEach((o, i) => (this.dots[i].style.left = `${clamp((o.bike.x - game.startX) / game.raceLen, 0, 1) * 100}%`));
        break;
      }
    }
    if (game.mxKind === 'tricks') {
      text = String(game.mxScore);
      unit = game.mxScore > 1 ? 'saltos' : 'salto';
    }
    const key = game.mxFlips * 31 + game.mxFails * 57 + Math.floor(p * 400) + text.length * 1000 + (mode !== 'cruising' ? Math.round(game.bike.x) * 7 : 0) + game.sectionsCleared * 13;
    if (key !== this.last.dist) {
      this.last.dist = key;
      this.distance.textContent = text;
      this.distanceUnit.textContent = unit;
      this.progressFill.style.transform = `scaleX(${p})`;
      this.progressMoto.style.left = mode === 'cruising' ? '48%' : `${4 + p * 88}%`;
    }
  }
}

export function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}
