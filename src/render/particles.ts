/**
 * Lightweight pooled particle system: dust clouds, dirt clods, water splashes, sparkles.
 * Simulated in world units (m), drawn by the renderer.
 */

export type ParticleKind = 'dust' | 'clod' | 'splash' | 'spark' | 'leaf' | 'smoke';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  r: number;
  g: number;
  b: number;
  rot: number;
  vr: number;
}

const MAX = 260;

export class Particles {
  readonly list: Particle[] = [];
  private pool: Particle[] = [];

  spawn(p: Omit<Particle, 'maxLife' | 'rot' | 'vr'> & { rot?: number; vr?: number }): void {
    if (this.list.length >= MAX) return;
    const q = this.pool.pop() ?? ({} as Particle);
    Object.assign(q, p);
    q.maxLife = p.life;
    q.rot = p.rot ?? Math.random() * 6.28;
    q.vr = p.vr ?? (Math.random() - 0.5) * 8;
    this.list.push(q);
  }

  update(dt: number, groundAt: (x: number) => number): void {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) {
        l[i] = l[l.length - 1];
        l.pop();
        this.pool.push(p);
        continue;
      }
      switch (p.kind) {
        case 'dust':
          p.vx *= Math.exp(-2.2 * dt);
          p.vy = p.vy * Math.exp(-2 * dt) + 0.25 * dt; // slight lift
          p.size += p.grow * dt;
          break;
        case 'smoke':
          p.vx *= Math.exp(-1.6 * dt);
          p.vy = p.vy * Math.exp(-1.2 * dt) + 0.5 * dt; // warm gas rises
          p.size += p.grow * dt;
          break;
        case 'clod':
        case 'splash': {
          p.vy -= 9.81 * dt;
          const gy = groundAt(p.x);
          if (p.y < gy && p.vy < 0) {
            p.y = gy;
            p.vy *= -0.3;
            p.vx *= 0.5;
            if (p.kind === 'splash') p.life = Math.min(p.life, 0.1);
          }
          break;
        }
        case 'spark':
          p.vx *= Math.exp(-3 * dt);
          p.vy *= Math.exp(-3 * dt);
          break;
        case 'leaf':
          p.vy -= 1.2 * dt;
          p.vx += Math.sin(p.life * 6) * 2 * dt;
          break;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  clear(): void {
    while (this.list.length) this.pool.push(this.list.pop()!);
  }
}
