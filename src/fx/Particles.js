// Pooled particle system for hits, deaths, dashes, pickups.
import { ObjectPool } from '../core/ObjectPool.js';
import { TAU } from '../core/math.js';

export class Particles {
  constructor() {
    this.pool = new ObjectPool(
      () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 3, color: '#fff', drag: 0.9, dead: false }),
      (p, o) => Object.assign(p, o),
    );
  }

  // Emit `count` particles in a burst.
  burst(x, y, color, count = 8, opts = {}) {
    const speed = opts.speed ?? 160;
    const life = opts.life ?? 0.45;
    const size = opts.size ?? 3;
    const spread = opts.spread ?? TAU;
    const dir = opts.dir ?? 0;
    for (let i = 0; i < count; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.pool.spawn({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life, maxLife: life,
        size: size * (0.6 + Math.random() * 0.8),
        color, drag: opts.drag ?? 0.86, dead: false,
      });
    }
  }

  // Single slow-drifting ambient particle (biome atmosphere: snow, embers...).
  drift(x, y, color, vx, vy, life, size) {
    this.pool.spawn({ x, y, vx, vy, life, maxLife: life, size, color, drag: 1, dead: false });
  }

  update(dt) {
    this.pool.update((p) => {
      p.life -= dt;
      if (p.life <= 0) { p.dead = true; return; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
    });
  }

  render(ctx) {
    this.pool.forEach((p) => {
      const a = p.life / p.maxLife;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const s = p.size * a;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    });
    ctx.globalAlpha = 1;
  }

  clear() { this.pool.clear(); }
}
