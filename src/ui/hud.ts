import { clamp } from '../core/math';
import { CHECKPOINT_EVERY, Game } from '../game';

const $ = (id: string) => document.getElementById(id)!;

/** DOM HUD: speedometer, energies, progress to the next checkpoint, distance. */
export class Hud {
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
  private last = { speed: -1, dist: -1 };

  update(game: Game): void {
    const kmh = Math.round(Math.abs(game.bike.forwardSpeed) * 3.6);
    if (kmh !== this.last.speed) {
      this.last.speed = kmh;
      this.speed.textContent = String(kmh);
      const t = clamp(kmh / 120, 0, 1);
      this.gaugeFill.style.strokeDasharray = `${t * 100} 100`;
      this.needle.style.transform = `rotate(${-90 + t * 180}deg)`;
    }
    this.fuelBar.style.transform = `scaleX(${game.fuel / 100})`;
    this.staminaBar.style.transform = `scaleX(${game.stamina / 100})`;
    this.fuelBox.classList.toggle('low', game.fuel < 22);
    this.staminaBox.classList.toggle('low', game.stamina < 22);
    const d = Math.floor(game.distance);
    if (d !== this.last.dist) {
      this.last.dist = d;
      this.distance.textContent = d.toLocaleString('fr-FR');
      const p = (game.distance % CHECKPOINT_EVERY) / CHECKPOINT_EVERY;
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
