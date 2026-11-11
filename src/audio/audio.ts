/**
 * Procedural WebAudio sound: a two-oscillator engine whose pitch follows the rpm, wind noise
 * with speed, and short synthesized effects (pickups, landings, crashes). No audio files.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engGain!: GainNode;
  private osc1!: OscillatorNode;
  private osc2!: OscillatorNode;
  private filter!: BiquadFilterNode;
  private windGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  enabled = true;

  constructor() {
    try {
      this.enabled = localStorage.getItem('mx.sound') !== '0';
    } catch {
      this.enabled = true;
    }
  }

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.6 : 0;
    this.master.connect(ctx.destination);

    // engine
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 900;
    this.filter.Q.value = 4;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 2.5);
    }
    shaper.curve = curve;
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    const g2 = ctx.createGain();
    g2.gain.value = 0.45;
    this.osc1.connect(shaper);
    this.osc2.connect(g2).connect(shaper);
    shaper.connect(this.filter).connect(this.engGain).connect(this.master);
    this.osc1.start();
    this.osc2.start();

    // noise buffer (wind, crash)
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuf;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 600;
    wf.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(wf).connect(this.windGain).connect(this.master);
    wind.start();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem('mx.sound', on ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.6 : 0, this.ctx.currentTime, 0.05);
  }

  /** Continuous engine/wind parameters, call every frame. */
  engine(rpm: number, throttle: number, speed: number, running: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 28 + (rpm / 60) * 0.85;
    this.osc1.frequency.setTargetAtTime(f, t, 0.03);
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.filter.frequency.setTargetAtTime(500 + throttle * 1800 + rpm * 0.08, t, 0.05);
    this.engGain.gain.setTargetAtTime(running ? 0.1 + throttle * 0.12 : 0, t, 0.08);
    this.windGain.gain.setTargetAtTime(Math.min(0.25, (speed / 30) ** 2 * 0.25), t, 0.2);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slide = 1): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur);
  }

  pickup(kind: 'fuel' | 'water'): void {
    const base = kind === 'fuel' ? 523 : 659;
    this.tone(base, 0.12, 'triangle', 0.25);
    this.tone(base * 1.25, 0.12, 'triangle', 0.25, 0.08);
    this.tone(base * 1.5, 0.22, 'triangle', 0.25, 0.16);
  }

  landing(strength: number): void {
    const v = Math.min(0.5, strength / 12);
    if (v < 0.05) return;
    this.tone(120, 0.18, 'sine', v, 0, 0.4);
    this.noise(0.15, v * 0.6, 500);
  }

  crash(): void {
    this.noise(0.6, 0.5, 900);
    this.tone(90, 0.4, 'sawtooth', 0.2, 0, 0.3);
  }

  checkpoint(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'square', 0.12, i * 0.09));
  }

  over(): void {
    [392, 330, 262].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.2, i * 0.18));
  }
}
