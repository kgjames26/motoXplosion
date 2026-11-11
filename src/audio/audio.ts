import { ENGINE_WORKLET } from './engineWorklet';

/**
 * Sound: synthesized motocross engine (AudioWorklet), wind, effects, and the two music
 * tracks (menu / in game) looped seamlessly with a cross-fade. Music and effects have their
 * own volume (settings).
 */

type Track = 'menu' | 'game';

/** Loop window (seconds) measured on the files: leading/trailing silence excluded. */
const LOOP = { start: 0.24, end: 171.9, fade: 4 };

class MusicTrack {
  private els: HTMLAudioElement[] = [];
  private gains: GainNode[] = [];
  private active = 0;
  private timer = 0;
  readonly out: GainNode;
  playing = false;

  constructor(
    private ctx: AudioContext,
    src: string,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    for (let i = 0; i < 2; i++) {
      const el = new window.Audio(src);
      el.preload = i === 0 ? 'auto' : 'none'; // the cross-fade twin reuses the HTTP cache
      el.crossOrigin = 'anonymous';
      const node = ctx.createMediaElementSource(el);
      const g = ctx.createGain();
      g.gain.value = 0;
      node.connect(g).connect(this.out);
      this.els.push(el);
      this.gains.push(g);
    }
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    const el = this.els[this.active];
    if (el.currentTime < LOOP.start || el.currentTime > LOOP.end - LOOP.fade) el.currentTime = LOOP.start;
    this.gains[this.active].gain.setValueAtTime(1, this.ctx.currentTime);
    void el.play().catch(() => {});
    this.tick();
  }

  /** Retry playback (autoplay can be refused until the first touch). */
  kick(): void {
    if (this.playing && this.els[this.active].paused) void this.els[this.active].play().catch(() => {});
  }

  pause(): void {
    this.playing = false;
    clearTimeout(this.timer);
    for (const el of this.els) el.pause();
  }

  /** Watch the active element and start the other one for the cross-fade before the end. */
  private tick = (): void => {
    if (!this.playing) return;
    const el = this.els[this.active];
    const remaining = LOOP.end - el.currentTime;
    if (remaining <= LOOP.fade) {
      const next = 1 - this.active;
      const nel = this.els[next];
      nel.currentTime = LOOP.start;
      void nel.play().catch(() => {});
      const t = this.ctx.currentTime;
      const f = Math.max(0.5, remaining);
      this.gains[next].gain.cancelScheduledValues(t);
      this.gains[next].gain.setValueAtTime(0, t);
      this.gains[next].gain.linearRampToValueAtTime(1, t + f);
      this.gains[this.active].gain.cancelScheduledValues(t);
      this.gains[this.active].gain.setValueAtTime(1, t);
      this.gains[this.active].gain.linearRampToValueAtTime(0, t + f);
      const old = el;
      setTimeout(() => old.pause(), f * 1000 + 200);
      this.active = next;
    }
    this.timer = window.setTimeout(this.tick, 250);
  };
}

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private engineNode: AudioWorkletNode | null = null;
  private engineFilter!: BiquadFilterNode;
  private engineGain!: GainNode;
  private fallback: { osc: OscillatorNode; osc2: OscillatorNode } | null = null;
  private windGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private tracks: Partial<Record<Track, MusicTrack>> = {};
  private current: Track | null = null;
  private wanted: Track | null = null;
  private duck = 1;
  musicVolume = 0.6;
  sfxVolume = 0.85;

  /** Must be called from a user gesture (iOS/Android autoplay rules). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      if (this.current) this.tracks[this.current]?.kick();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);

    // engine chain: worklet → muffling low-pass → gain
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 900;
    this.engineFilter.Q.value = 0.8;
    const body = ctx.createBiquadFilter(); // a bit of chest: low shelf boost
    body.type = 'lowshelf';
    body.frequency.value = 160;
    body.gain.value = 5;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(body).connect(this.engineGain).connect(this.sfxBus);
    void this.initEngine(ctx);

    // noise for wind and impacts
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuf;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 500;
    wf.Q.value = 0.5;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(wf).connect(this.windGain).connect(this.sfxBus);
    wind.start();

    this.tracks.menu = new MusicTrack(ctx, '/audio/music-menu.mp3');
    this.tracks.game = new MusicTrack(ctx, '/audio/music-game.mp3');
    for (const t of Object.values(this.tracks)) t!.out.connect(this.musicBus);
    if (this.wanted) this.music(this.wanted);
  }

  private async initEngine(ctx: AudioContext): Promise<void> {
    try {
      if (!ctx.audioWorklet) throw new Error('no worklet');
      const url = URL.createObjectURL(new Blob([ENGINE_WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      this.engineNode = new AudioWorkletNode(ctx, 'mx-engine', { outputChannelCount: [1] });
      this.engineNode.connect(this.engineFilter);
    } catch {
      // Fallback: two detuned oscillators (older browsers).
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      const g2 = ctx.createGain();
      g2.gain.value = 0.4;
      osc.connect(this.engineFilter);
      osc2.connect(g2).connect(this.engineFilter);
      osc.start();
      osc2.start();
      this.fallback = { osc, osc2 };
    }
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(music * this.duck, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.05);
  }

  /** Select the music for the current screen (cross-fades between tracks). */
  music(track: Track, duck = 1): void {
    this.wanted = track;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (duck !== this.duck) {
      this.duck = duck;
      this.musicBus.gain.setTargetAtTime(this.musicVolume * duck, t, 0.3);
    }
    if (this.current === track) return;
    const prevName = this.current;
    const prev = prevName ? this.tracks[prevName] : null;
    const next = this.tracks[track]!;
    if (prev) {
      prev.out.gain.setTargetAtTime(0, t, 0.4);
      setTimeout(() => {
        if (this.current !== prevName) prev.pause();
      }, 2500);
    }
    next.play();
    next.out.gain.cancelScheduledValues(t);
    next.out.gain.setTargetAtTime(1, t, 0.5);
    this.current = track;
  }

  /** Continuous engine/wind parameters, call every frame. */
  // Smoothed control values. Parameters are written directly (.value) at most ~30 times per
  // second: scheduling a new automation event every frame makes the AudioParam timelines grow
  // and slowly eats CPU on phones.
  private eng = { rpm: 1400, thr: 0, gain: 0, wind: 0, lp: 900, t: 0 };
  engine(rpm: number, throttle: number, speed: number, running: boolean): void {
    if (!this.ctx) return;
    const now = performance.now();
    const e = this.eng;
    const dt = Math.min(0.1, (now - e.t) / 1000);
    if (dt < 1 / 30) return;
    e.t = now;
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    e.rpm += (rpm - e.rpm) * k(25);
    e.thr += (throttle - e.thr) * k(30);
    e.gain += ((running ? 0.55 + throttle * 0.25 : 0) - e.gain) * k(8);
    e.wind += (Math.min(0.2, (speed / 30) ** 2 * 0.2) - e.wind) * k(4);
    e.lp += (520 + throttle * 900 + rpm * 0.07 - e.lp) * k(15);
    if (this.engineNode) {
      const p = this.engineNode.parameters;
      p.get('rpm')!.value = e.rpm;
      p.get('throttle')!.value = e.thr;
    } else if (this.fallback) {
      const f = 25 + (e.rpm / 60) * 0.5;
      this.fallback.osc.frequency.value = f;
      this.fallback.osc2.frequency.value = f * 0.5;
    }
    this.engineFilter.frequency.value = e.lp;
    this.engineGain.gain.value = e.gain;
    this.windGain.gain.value = e.wind;
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
    o.connect(g).connect(this.sfxBus);
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
    s.connect(f).connect(g).connect(this.sfxBus);
    s.start(t);
    s.stop(t + dur);
  }

  pickup(kind: 'fuel' | 'water'): void {
    const base = kind === 'fuel' ? 523 : 659;
    this.tone(base, 0.12, 'triangle', 0.22);
    this.tone(base * 1.25, 0.12, 'triangle', 0.22, 0.08);
    this.tone(base * 1.5, 0.22, 'triangle', 0.22, 0.16);
  }

  landing(strength: number): void {
    const v = Math.min(0.5, strength / 14);
    if (v < 0.05) return;
    this.tone(95, 0.2, 'sine', v, 0, 0.45);
    this.noise(0.18, v * 0.5, 420);
  }

  crash(): void {
    this.noise(0.7, 0.5, 800);
    this.tone(80, 0.45, 'sawtooth', 0.18, 0, 0.3);
  }

  checkpoint(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.14, i * 0.09));
  }

  over(): void {
    [392, 330, 262].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.18, i * 0.18));
  }
}
