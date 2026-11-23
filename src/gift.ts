import { VOLUMES, type Card } from './album';

/**
 * v2.82: winning a sticker. A gift box fills the screen; every tap spins it faster (the spin
 * slows down on its own), and once it has turned enough it bursts open: the sticker pops out
 * with rays and fireworks. Several stickers won at once are opened one after the other.
 */
interface GiftAudio {
  giftTap(n: number): void;
  giftOpen(): void;
  firework(): void;
}

const OPEN_SPIN = 1260; // degrees of spin to open (3.5 turns): a few quick taps, more if slow
const TAP_KICK = 520; // deg/s added per tap
const MAX_VEL = 2600;
const FRICTION = 1.5; // per second (exponential)

let busy = false;
const queue: Card[] = [];

export function revealStickers(cards: Card[], where: (c: Card) => string, audio: GiftAudio): void {
  queue.push(...cards);
  if (!busy) next(where, audio);
}

function next(where: (c: Card) => string, audio: GiftAudio): void {
  const card = queue.shift();
  if (!card) {
    busy = false;
    return;
  }
  busy = true;
  const left = queue.length;
  const root = document.createElement('div');
  root.className = 'gift-ov';
  root.innerHTML = `<canvas class="gift-fx"></canvas>
<div class="gift-head"><b>NOUVEL AUTOCOLLANT !</b><small>Tapote le cadeau pour l’ouvrir</small></div>
<div class="gift-stage">
  <div class="gift-glow"></div>
  <div class="gift-box"><div class="gift-cube">
    <i class="gf f"></i><i class="gf b"></i><i class="gf l"></i><i class="gf r"></i><i class="gf bot"></i>
    <div class="gift-lid"><i class="gf top"></i><i class="gbow"></i><i class="gbow x"></i></div>
  </div></div>
  <div class="gift-rays"></div>
  <div class="gift-sticker"><img src="${card.img}" alt="" draggable="false"></div>
</div>
<div class="gift-info"><b>${card.name}</b><small>Vol. ${card.vol} · ${VOLUMES[card.vol]}</small><p>${card.bio}</p><i>${where(card)}</i><button class="btn-primary gift-ok">${left ? `SUIVANT (${left})` : 'SUPER !'}</button></div>`;
  document.body.appendChild(root);
  new Image().src = card.img; // warm the picture while the box spins

  const cube = root.querySelector<HTMLElement>('.gift-cube')!;
  const box = root.querySelector<HTMLElement>('.gift-box')!;
  const glow = root.querySelector<HTMLElement>('.gift-glow')!;
  const canvas = root.querySelector<HTMLCanvasElement>('.gift-fx')!;
  const fx = new Fireworks(canvas, audio);

  let angle = -25;
  let vel = 0;
  let spin = 0;
  let taps = 0;
  let opened = false;
  let openedAt = 0;
  let last = performance.now();
  let raf = 0;

  const frame = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!opened) {
      vel *= Math.exp(-FRICTION * dt);
      if (vel < 4) vel = 0;
      angle += vel * dt;
      spin += vel * dt;
      const p = Math.min(1, spin / OPEN_SPIN);
      const wob = Math.sin(now / 70) * Math.min(6, vel / 260);
      const idle = vel === 0 ? Math.sin(now / 380) * 4 : 0; // a gentle sway inviting the tap
      cube.style.transform = `rotateX(-20deg) rotateY(${angle + idle}deg) rotateZ(${wob}deg)`;
      glow.style.opacity = String(0.25 + p * 0.75);
      glow.style.transform = `scale(${0.8 + p * 0.6})`;
      if (spin >= OPEN_SPIN) open();
    }
    fx.step(dt);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  function open(): void {
    opened = true;
    openedAt = performance.now();
    root.classList.add('opened');
    audio.giftOpen();
    const w = canvas.width;
    const h = canvas.height;
    fx.burst(w * 0.5, h * 0.42, 1.4);
    [
      [0.25, 0.3, 350],
      [0.75, 0.28, 600],
      [0.35, 0.6, 950],
      [0.68, 0.55, 1250],
      [0.5, 0.22, 1600],
      [0.18, 0.5, 2000],
      [0.82, 0.45, 2300],
    ].forEach(([x, y, t]) => setTimeout(() => !closed && fx.burst(w * x, h * y, 1), t));
  }

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    root.classList.add('closing');
    setTimeout(() => {
      cancelAnimationFrame(raf);
      root.remove();
      next(where, audio);
    }, 280);
  }

  root.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (opened) {
      if (performance.now() - openedAt > 900) close();
      return;
    }
    taps++;
    vel = Math.min(MAX_VEL, vel + TAP_KICK);
    audio.giftTap(Math.min(1, spin / OPEN_SPIN));
    box.classList.remove('bump');
    void box.offsetWidth;
    box.classList.add('bump');
    if (taps === 1) root.classList.add('tapped');
  });
  root.addEventListener('click', (e) => e.stopPropagation());
}

interface Spark {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: string;
  w: number;
}

const COLORS = ['#ff7a1a', '#ffd23a', '#2fe0d0', '#ffffff', '#ff4d6d', '#7cff6b', '#58a6ff'];

class Fireworks {
  private ctx: CanvasRenderingContext2D;
  private sparks: Spark[] = [];
  private dpr = Math.min(2, window.devicePixelRatio || 1);

  constructor(
    private canvas: HTMLCanvasElement,
    private audio: GiftAudio,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  private resize(): void {
    this.canvas.width = Math.round(innerWidth * this.dpr);
    this.canvas.height = Math.round(innerHeight * this.dpr);
  }

  burst(x: number, y: number, size: number): void {
    this.audio.firework();
    const n = Math.round(70 * size);
    const c1 = COLORS[(Math.random() * COLORS.length) | 0];
    const c2 = COLORS[(Math.random() * COLORS.length) | 0];
    const sp = Math.min(this.canvas.width, this.canvas.height) * 0.55 * size;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const v = sp * (0.45 + Math.random() * 0.6);
      const max = 0.9 + Math.random() * 0.8;
      this.sparks.push({ x, y, px: x, py: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, c: i % 3 ? c1 : c2, w: (1.5 + Math.random() * 2) * this.dpr });
    }
  }

  step(dt: number): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.sparks.length) return;
    const g = canvas.height * 0.45;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    this.sparks = this.sparks.filter((s) => (s.life -= dt) > 0);
    for (const s of this.sparks) {
      s.px = s.x;
      s.py = s.y;
      s.vx *= Math.exp(-2.2 * dt);
      s.vy = s.vy * Math.exp(-2.2 * dt) + g * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const k = s.life / s.max;
      ctx.globalAlpha = Math.min(1, k * 1.6) * (0.75 + Math.random() * 0.25);
      ctx.strokeStyle = s.c;
      ctx.lineWidth = s.w * (0.5 + k * 0.5);
      ctx.beginPath();
      ctx.moveTo(s.px - (s.x - s.px) * 2, s.py - (s.y - s.py) * 2);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
