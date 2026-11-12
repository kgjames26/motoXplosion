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
  /** v2.26 motocross track: stick left / right (the stick's up / down is the balance). */
  steer = 0;
  /** Joystick instead of the balance bar (3D track). */
  stickMode = false;
  private stickTouch = false;
  private stickEl = document.getElementById('ctl-stick')!;
  private stickKnob = document.getElementById('stick-knob')!;
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
    this.bindStick();
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

  private bindStick(): void {
    const update = (e: PointerEvent) => {
      const r = this.stickEl.getBoundingClientRect();
      const R = r.width / 2;
      let dx = (e.clientX - (r.left + R)) / (R * 0.72);
      let dy = (e.clientY - (r.top + R)) / (R * 0.72);
      const m = Math.hypot(dx, dy);
      if (m > 1) {
        dx /= m;
        dy /= m;
      }
      this.steer = dx;
      this.balance = -dy; // up = weight forward, down = weight back
    };
    this.stickEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.stickEl.setPointerCapture(e.pointerId);
      this.stickTouch = true;
      update(e);
    });
    this.stickEl.addEventListener('pointermove', (e) => {
      if (this.stickTouch) update(e);
    });
    const end = () => {
      this.stickTouch = false;
    };
    this.stickEl.addEventListener('pointerup', end);
    this.stickEl.addEventListener('pointercancel', end);
  }

  /** Switch between the balance bar (2.5D) and the joystick (3D track). */
  setStickMode(on: boolean): void {
    if (on === this.stickMode) return;
    this.stickMode = on;
    this.stickTouch = this.balTouch = false;
    this.steer = 0;
    this.stickEl.classList.toggle('hidden', !on);
    this.balEl.classList.toggle('hidden', on);
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
    const st = this.stickMode;
    const up = k.has('Space') || (!st && k.has('ArrowUp'));
    const down = k.has('ControlLeft') || k.has('ControlRight') || k.has('AltRight') || (!st && k.has('ArrowDown'));
    const left = k.has('ArrowLeft') || k.has('KeyA');
    const right = k.has('ArrowRight') || k.has('KeyD');
    // keyboard throttle ramps like a twist grip
    this.kbThrottle = clamp(this.kbThrottle + (up ? 3 : -6) * dt, 0, 1);
    if (!this.thrTouch) this.throttle = this.kbThrottle;
    if (!this.brakeEl.classList.contains('on')) this.brake = down ? 1 : 0;
    if (st) {
      // 3D track: ← → steer, ↑ ↓ shift the rider's weight
      if (!this.stickTouch) {
        const ts = left ? -1 : right ? 1 : 0;
        const tb = k.has('ArrowUp') ? 1 : k.has('ArrowDown') ? -1 : 0;
        this.steer += (ts - this.steer) * (1 - Math.exp(-(ts === 0 ? 10 : 6) * dt));
        this.balance += (tb - this.balance) * (1 - Math.exp(-(tb === 0 ? 9 : 5) * dt));
        if (Math.abs(this.steer) < 0.002) this.steer = 0;
        if (Math.abs(this.balance) < 0.002) this.balance = 0;
      }
      const R = this.stickEl.clientWidth * 0.5 * 0.5;
      this.stickKnob.style.transform = `translate(${this.steer * R}px, ${-this.balance * R}px)`;
    } else if (!this.balTouch) {
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
