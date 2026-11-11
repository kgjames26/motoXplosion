/**
 * AudioWorklet source for a single-cylinder 4-stroke motocross engine (450 cc style).
 *
 * Model: a firing pulse every two crankshaft revolutions (f = rpm / 120) excites two
 * resonators (exhaust pipe + engine body). Each firing has random amplitude and timing jitter,
 * a short combustion "crack" of filtered noise that grows with throttle, and off-throttle
 * deceleration pops. The result is then low-passed outside the worklet for a slightly muffled
 * ("sourd") tone.
 *
 * Kept as a string so it can be loaded from a Blob URL without a separate build entry.
 */
export const ENGINE_WORKLET = /* js */ `
class Resonator {
  constructor() { this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; this.set(100, 5, 48000); }
  set(f, q, sr) {
    const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr;
    const a = Math.sin(w) / (2 * q);
    const b0 = a, b2 = -a, a0 = 1 + a, a1 = -2 * Math.cos(w), a2 = 1 - a;
    this.b0 = b0 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

class MxEngine extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 1400, minValue: 600, maxValue: 14000, automationRate: 'k-rate' },
      { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'on', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.phase = 0;
    this.jitter = 1;
    this.pulse = 0; // samples left in the current firing pulse
    this.pulseLen = 1;
    this.amp = 0;
    this.crack = 0;
    this.pop = 0;
    this.pipe = new Resonator();
    this.body = new Resonator();
    this.sub = new Resonator();
    this.lp = 0;
    this.thr = 0;
    this.rpm = 1400;
  }
  process(inputs, outputs, params) {
    const out = outputs[0][0];
    if (!out) return true;
    const sr = sampleRate;
    const targetRpm = params.rpm[0];
    const targetThr = params.throttle[0];
    const on = params.on[0];
    // smooth control changes over the block
    this.rpm += (targetRpm - this.rpm) * 0.25;
    this.thr += (targetThr - this.thr) * 0.3;
    const rpm = this.rpm;
    const thr = this.thr;
    const fire = rpm / 120; // firings per second
    this.pipe.set(88 + rpm * 0.0105, 3.2, sr);
    this.body.set(520 + rpm * 0.028, 2.2, sr);
    this.sub.set(fire * 1.0, 1.4, sr);
    const decel = rpm > 3500 && thr < 0.05;
    for (let i = 0; i < out.length; i++) {
      this.phase += (fire / sr) * this.jitter;
      let x = 0;
      if (this.phase >= 1) {
        this.phase -= 1;
        this.jitter = 1 + (Math.random() - 0.5) * (rpm < 3000 ? 0.12 : 0.05);
        const load = 0.28 + thr * 0.72;
        this.amp = load * (0.82 + Math.random() * 0.36);
        this.pulseLen = Math.max(8, Math.floor(sr * (0.0016 + 0.0012 * (1 - thr))));
        this.pulse = this.pulseLen;
        this.crack = thr * (0.6 + Math.random() * 0.4);
        if (decel && Math.random() < 0.18) this.pop = 0.9 + Math.random() * 0.6;
      }
      if (this.pulse > 0) {
        const u = 1 - this.pulse / this.pulseLen;
        x += Math.sin(Math.PI * u) * this.amp * 2.2;
        this.pulse--;
      }
      // combustion crack and decel pops: decaying noise
      if (this.crack > 0.002) {
        x += (Math.random() * 2 - 1) * this.crack * 0.55;
        this.crack *= 0.9965;
      }
      if (this.pop > 0.002) {
        x += (Math.random() * 2 - 1) * this.pop;
        this.pop *= 0.992;
      }
      const p = this.pipe.run(x);
      const b = this.body.run(x);
      const s = this.sub.run(x);
      let y = p * 1.6 + b * 0.55 + s * 0.9 + x * 0.12;
      // soft saturation: louder and rougher under load
      y = Math.tanh(y * (1.2 + thr * 1.4)) * 0.7;
      // gentle internal low-pass to remove digital edge
      this.lp += (y - this.lp) * 0.35;
      out[i] = this.lp * on;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor('mx-engine', MxEngine);
`;
