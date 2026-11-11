import { clamp } from '../core/math';
import { CHECKPOINT_EVERY, Game } from '../game';
import { ENDURO_CP, TRIAL_SECTIONS } from '../modes';

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
  private lives = $('lives');
  private zone = $('trial-zone');
  private faults = $('trial-faults');
  private pos = $('race-pos');
  private posSfx = $('race-pos-sfx');
  private riders = $('riders');
  private coins = $('coins');
  private coinsBox = $('hud-coins');
  private last = { speed: -1, dist: -1, coins: -1, lives: -1, mode: '' };
  private dots: HTMLElement[] = [];

  update(game: Game): void {
    const mode = game.mode;
    if (mode !== this.last.mode) {
      this.last.mode = mode;
      this.root.dataset.mode = mode;
      this.last.lives = -1;
      this.last.dist = -1;
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
    switch (mode) {
      case 'cruising':
        p = (game.distance % CHECKPOINT_EVERY) / CHECKPOINT_EVERY;
        text = Math.floor(game.distance).toLocaleString('fr-FR');
        break;
      case 'enduro': {
        p = (game.distance % ENDURO_CP) / ENDURO_CP;
        text = `CP ${game.checkpoints + 1}`;
        unit = `· ${Math.max(0, Math.round(ENDURO_CP - (game.distance % ENDURO_CP)))} m`;
        const t = Math.max(0, game.timeLeft);
        this.timer.textContent = `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
        this.timerBox.classList.toggle('low', t < 15);
        break;
      }
      case 'trial':
        p = game.sectionsCleared / TRIAL_SECTIONS;
        text = `${game.sectionsCleared}/${TRIAL_SECTIONS}`;
        unit = 'zones';
        if (game.lives !== this.last.lives) {
          this.last.lives = game.lives;
          this.lives.innerHTML = [0, 1, 2].map((i) => `<i class="${i < game.lives ? '' : 'lost'}"></i>`).join('');
        }
        this.zone.textContent = `${Math.max(game.section, 1)}/${TRIAL_SECTIONS}`;
        this.faults.textContent = String(game.totalFaults);
        break;
      case 'course': {
        p = clamp((game.bike.x - game.startX) / game.raceLen, 0, 1);
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
    const key = Math.floor(p * 400) + text.length * 1000 + (mode === 'course' ? Math.round(game.bike.x) : 0);
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
