import { CARDS, HALF, SPREAD, SPREADS, type Card } from './album';

/**
 * v2.83: the album as a real book. A double page holds 24 stickers (12 per page, 4 × 3), 4 double
 * pages in all. Pages turn with the arrows, or by dragging a page with the finger: the leaf follows
 * the finger and finishes its turn (or falls back) when released.
 */
export interface BookHooks {
  owned(c: Card): boolean;
  where(c: Card): string;
  label(c: Card): string; // "Alpes · Trial"
  tap(c: Card, owned: boolean): void;
}

const TURN_MS = 620;

export class AlbumBook {
  spread = 0;
  private book: HTMLElement;
  private left: HTMLElement;
  private right: HTMLElement;
  private turning: { leaf: HTMLElement; dir: 1 | -1; p: number } | null = null;
  private drag: { x: number; y: number; id: number; moved: boolean; dir: 0 | 1 | -1 } | null = null;
  private suppressClick = false;

  constructor(
    root: HTMLElement,
    private dots: HTMLElement,
    private h: BookHooks,
  ) {
    root.innerHTML = '<div class="book"><div class="bk-page bk-left"></div><div class="bk-page bk-right"></div><i class="bk-spine"></i></div>';
    this.book = root.querySelector('.book')!;
    this.left = root.querySelector('.bk-left')!;
    this.right = root.querySelector('.bk-right')!;
    this.book.addEventListener('click', (e) => {
      if (this.suppressClick || this.turning) return;
      const el = (e.target as HTMLElement).closest<HTMLElement>('.slot');
      if (!el) return;
      const c = CARDS[Number(el.dataset.id)];
      this.h.tap(c, this.h.owned(c));
    });
    this.book.addEventListener('pointerdown', (e) => this.down(e));
    this.book.addEventListener('pointermove', (e) => this.move(e));
    this.book.addEventListener('pointerup', (e) => this.up(e));
    this.book.addEventListener('pointercancel', (e) => this.up(e));
  }

  /** Redraw the open double page (after a run, or when the album is opened). */
  render(): void {
    this.left.innerHTML = this.half(this.spread * 2);
    this.right.innerHTML = this.half(this.spread * 2 + 1);
    this.dots.innerHTML = Array.from({ length: SPREADS }, (_, i) => `<i class="${i === this.spread ? 'on' : ''}"></i>`).join('');
  }

  /** Open the book on the double page holding this sticker. */
  goTo(id: number): void {
    this.spread = Math.floor(id / SPREAD);
    this.render();
  }

  next(): void {
    if (!this.turning && this.spread < SPREADS - 1) this.animate(this.begin(1), 1);
  }

  prev(): void {
    if (!this.turning && this.spread > 0) this.animate(this.begin(-1), 1);
  }

  /** One page (half of a double page): a title, 12 slots, its number. */
  private half(k: number): string {
    const cards = CARDS.slice(k * HALF, (k + 1) * HALF);
    if (!cards.length) return '';
    const labels = [...new Set(cards.map((c) => this.h.label(c)))];
    const slots = cards
      .map((c) => {
        const has = this.h.owned(c);
        const tilt = (((c.id * 37) % 7) - 3) * 0.7;
        return `<button class="slot ${has ? 'has' : 'empty'} t${c.tier}" data-id="${c.id}" style="--tilt:${tilt}deg"><span class="sl-pic"><img src="${c.thumb}" alt="" loading="lazy" decoding="async" draggable="false"></span><span class="sl-cap">${has ? c.name : `${c.id + 1} · ${this.h.where(c)}`}</span></button>`;
      })
      .join('');
    return `<div class="bk-head">${labels.join('<em>/</em>')}</div><div class="bk-grid">${slots}</div><div class="bk-num">${k + 1}</div>`;
  }

  // ------------------------------------------------------------ turning

  /** Lay the leaf over the page that turns; what lies under it already shows the next pages. */
  private begin(dir: 1 | -1): { leaf: HTMLElement; dir: 1 | -1; p: number } {
    const s = this.spread;
    const leaf = document.createElement('div');
    leaf.className = `bk-leaf ${dir > 0 ? 'fwd' : 'back'}`;
    if (dir > 0) {
      leaf.innerHTML = `<div class="bk-page bk-right lf-front">${this.half(s * 2 + 1)}<i class="lf-shade"></i></div><div class="bk-page bk-left lf-back">${this.half(s * 2 + 2)}<i class="lf-shade"></i></div>`;
      this.right.innerHTML = this.half(s * 2 + 3);
    } else {
      leaf.innerHTML = `<div class="bk-page bk-left lf-front">${this.half(s * 2)}<i class="lf-shade"></i></div><div class="bk-page bk-right lf-back">${this.half(s * 2 - 1)}<i class="lf-shade"></i></div>`;
      this.left.innerHTML = this.half(s * 2 - 2);
    }
    this.book.appendChild(leaf);
    this.turning = { leaf, dir, p: 0 };
    this.set(0);
    return this.turning;
  }

  /** p = 0 (flat where it started) … 1 (turned over). */
  private set(p: number): void {
    const t = this.turning!;
    t.p = p;
    const a = p * 180 * -t.dir;
    t.leaf.style.transform = `rotateY(${a}deg)`;
    // a soft shadow grows on the face as the page rises, and on the pages under it
    const lift = Math.sin(p * Math.PI);
    t.leaf.style.setProperty('--shade', String(lift * 0.45));
    t.leaf.style.setProperty('--lift', String(lift));
  }

  private animate(t: { leaf: HTMLElement; dir: 1 | -1; p: number }, to: 0 | 1): void {
    const from = t.p;
    const dur = TURN_MS * Math.max(0.35, Math.abs(to - from));
    const t0 = performance.now();
    const step = (now: number): void => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      this.set(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
      else this.end(to === 1);
    };
    requestAnimationFrame(step);
  }

  private end(done: boolean): void {
    const t = this.turning!;
    if (done) this.spread += t.dir;
    t.leaf.remove();
    this.turning = null;
    this.render();
  }

  // ------------------------------------------------------------ finger

  private down(e: PointerEvent): void {
    if (this.turning) return;
    this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, dir: 0 };
    this.suppressClick = false;
  }

  private move(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved) {
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(e.clientY - d.y)) return;
      const dir: 1 | -1 = dx < 0 ? 1 : -1;
      if ((dir > 0 && this.spread >= SPREADS - 1) || (dir < 0 && this.spread <= 0)) return;
      d.moved = true;
      d.dir = dir;
      this.suppressClick = true;
      this.book.setPointerCapture(e.pointerId);
      this.begin(dir);
    }
    const w = this.book.clientWidth;
    this.set(Math.max(0, Math.min(1, (-dx * d.dir) / w)));
  }

  private up(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    if (!d.moved || !this.turning) return;
    this.animate(this.turning, this.turning.p > 0.3 ? 1 : 0);
    setTimeout(() => (this.suppressClick = false), 50);
  }
}
