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

  update(game: Game): void {
    const mode = game.mode;
    if (mode !== this.last.mode) {
      this.last.mode = mode;
      this.root.dataset.mode = mode;
      this.last.dist = -1;
      this.last.clock = -1;
      this.last.mult = -1;
    }
    if (game.circuit * 10 + game.weather !== this.last.circuit) {
      this.last.circuit = game.circuit * 10 + game.weather;
      this.level.innerHTML = `${WEATHER_ICONS[game.weather]}${game.circuit ? `Circuit ${game.circuit} · ` : ''}${WEATHER_NAMES[game.weather]}`;
      this.riders.innerHTML = '';
      this.dots = [];
    }
    const kmh = Math.round(Math.abs(game.bike.forwardSpeed) * 3.6);
    if (kmh !== this.last.speed) {
      this.last.speed = kmh;
      this.speed.textContent = String(kmh);
      const t = clamp(kmh / 130, 0, 1);
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
    const key = Math.floor(p * 400) + text.length * 1000 + (mode !== 'cruising' ? Math.round(game.bike.x) * 7 : 0) + game.sectionsCleared * 13;
    if (key !== this.last.dist) {
      this.last.dist = key;
      this.distance.textContent = text;
      this.distanceUnit.textContent = unit;
      this.progressFill.style.transform = `scaleX(${p})`;
      this.progressMoto.style.left = `${4 + p * 88}%`;
    }
  }
}

export function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}
