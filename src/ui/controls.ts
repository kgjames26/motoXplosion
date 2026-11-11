import { clamp } from '../core/math';

/**
 * Touch (multi-pointer) and keyboard controls (Space = gas, Ctrl / AltGr = brake, ← → = balance).
 *  - Throttle grip: drag down inside the grip track; release returns it to idle.
 *  - Balance slider: ARRIÈRE (left, -1) ↔ AVANT (right, +1); springs back to the centre.
 *  - Brake disc: hold to brake.
 */
export class Controls {
  throttle = 0;
  brake = 0;
  balance = 0;
  private balTouch = false;
  private thrTouch = false;
  private keys = new Set<string>();
  private kbThrottle = 0;
  onPause: () => void = () => {};
  onCruise: () => void = () => {};

  private thrEl = document.getElementById('ctl-throttle')!;
  private thrTrack = this.thrEl.querySelector('.thr-track') as HTMLElement;
  private thrGrip = document.getElementById('thr-grip')!;
  private thrFill = document.getElementById('thr-fill')!;
  private balEl = document.getElementById('ctl-balance')!;
  private balTrack = document.getElementById('bal-track')!;
  private balKnob = document.getElementById('bal-knob')!;
  private balFill = document.getElementById('bal-fill')!;
  private brakeEl = document.getElementById('ctl-brake')!;

  constructor() {
    this.bindThrottle();
    this.bindBalance();
    this.bindBrake();
    window.addEventListener('keydown', (e) => {
      // typing in a text field (pseudo) never drives the bike
      if (e.repeat || (e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      this.keys.add(e.code);
      // Space would click the focused button / scroll, AltGr would open browser menus
      if (e.code === 'Space' || e.code === 'AltRight' || e.code === 'AltLeft') e.preventDefault();
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause();
      if (e.code === 'KeyC') this.onCruise();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());
  }

  reset(): void {
    this.throttle = this.brake = this.balance = 0;
    this.balTouch = this.thrTouch = false;
    this.keys.clear();
    this.kbThrottle = 0;
    this.brakeEl.classList.remove('on');
    this.thrEl.classList.remove('on');
  }

  private bindThrottle(): void {
    const update = (e: PointerEvent) => {
      const r = this.thrTrack.getBoundingClientRect();
      const gripH = this.thrGrip.offsetHeight;
      const usable = Math.max(1, r.height - gripH);
      // finger holds the middle of the grip
      this.throttle = clamp((e.clientY - r.top - gripH / 2) / usable, 0, 1);
    };
    this.thrEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.thrEl.setPointerCapture(e.pointerId);
      this.thrTouch = true;
      this.thrEl.classList.add('on');
      update(e);
    });
    this.thrEl.addEventListener('pointermove', (e) => {
      if (this.thrTouch) update(e);
    });
    const end = () => {
      this.thrTouch = false;
      this.throttle = 0;
      this.thrEl.classList.remove('on');
    };
    this.thrEl.addEventListener('pointerup', end);
    this.thrEl.addEventListener('pointercancel', end);
  }

  private bindBalance(): void {
    const update = (e: PointerEvent) => {
      const r = this.balTrack.getBoundingClientRect();
      this.balance = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    };
    this.balEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.balEl.setPointerCapture(e.pointerId);
      this.balTouch = true;
      update(e);
    });
    this.balEl.addEventListener('pointermove', (e) => {
      if (this.balTouch) update(e);
    });
    const end = () => {
      this.balTouch = false;
    };
    this.balEl.addEventListener('pointerup', end);
    this.balEl.addEventListener('pointercancel', end);
  }

  private bindBrake(): void {
    const on = (e: PointerEvent) => {
      e.preventDefault();
      this.brakeEl.setPointerCapture(e.pointerId);
      this.brake = 1;
      this.brakeEl.classList.add('on');
    };
    const off = () => {
      this.brake = 0;
      this.brakeEl.classList.remove('on');
    };
    this.brakeEl.addEventListener('pointerdown', on);
    this.brakeEl.addEventListener('pointerup', off);
    this.brakeEl.addEventListener('pointercancel', off);
  }

  /** Per-frame update: keyboard mixing, spring-back and visuals. */
  update(dt: number): void {
    const k = this.keys;
    // keyboard: Space = throttle, Ctrl or AltGr = brake, arrows = rider balance
    const up = k.has('Space') || k.has('ArrowUp');
    const down = k.has('ControlLeft') || k.has('ControlRight') || k.has('AltRight') || k.has('ArrowDown');
    const left = k.has('ArrowLeft') || k.has('KeyA');
    const right = k.has('ArrowRight') || k.has('KeyD');
    // keyboard throttle ramps like a twist grip
    this.kbThrottle = clamp(this.kbThrottle + (up ? 3 : -6) * dt, 0, 1);
    if (!this.thrTouch) this.throttle = this.kbThrottle;
    if (!this.brakeEl.classList.contains('on')) this.brake = down ? 1 : 0;
    if (!this.balTouch) {
      const target = left ? -1 : right ? 1 : 0;
      const rate = target === 0 ? 9 : 5;
      this.balance += (target - this.balance) * (1 - Math.exp(-rate * dt));
      if (Math.abs(this.balance) < 0.002) this.balance = 0;
    }
    // visuals
    const pct = this.balance * 50 + 50;
    this.balKnob.style.left = pct + '%';
    this.balFill.style.width = pct + '%';
    const r = this.thrTrack.clientHeight - this.thrGrip.offsetHeight;
    this.thrGrip.style.transform = `translateY(${this.throttle * r}px)`;
    this.thrFill.style.height = this.throttle * 100 + '%';
  }
}
