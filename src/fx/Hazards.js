// Pooled telegraphed ground hazards: a warning circle grows for `warn`
// seconds, then detonates (one-shot) or lingers as a damaging zone (lava,
// webs). Used by bosses and biome environments alike.
import { ObjectPool } from '../core/ObjectPool.js';
import { dist, TAU } from '../core/math.js';

export class Hazards {
  constructor() {
    this.pool = new ObjectPool(
      () => ({
        x: 0, y: 0, radius: 50, warn: 0.9, t: 0, damage: 15, color: '#ff8a5a',
        linger: 0, tickEvery: 0.6, _nextTick: 0, _detonated: false, dead: false,
        slow: false,
      }),
      (h, o) => { Object.assign(h, { t: 0, _nextTick: 0, _detonated: false, linger: 0, slow: false, tickEvery: 0.6 }, o); },
    );
  }

  spawn(o) { return this.pool.spawn(o); }

  // ctx: { player, damagePlayer(dmg, x, y, kb), onDetonate(h) }
  update(dt, ctx) {
    this.pool.update((h) => {
      h.t += dt;
      const p = ctx.player;
      if (!h._detonated && h.t >= h.warn) {
        h._detonated = true;
        if (ctx.onDetonate) ctx.onDetonate(h);
        // One-shot burst damage on detonation.
        if (h.linger <= 0 && dist(p.x, p.y, h.x, h.y) < h.radius + p.radius) {
          ctx.damagePlayer(h.damage, h.x, h.y, 260);
          if (h.slow) p.slowT = Math.max(p.slowT || 0, 1.6);
        }
      }
      if (h._detonated) {
        if (h.linger > 0) {
          // Lingering zone: periodic damage while standing inside.
          h._nextTick -= dt;
          if (h._nextTick <= 0 && dist(p.x, p.y, h.x, h.y) < h.radius + p.radius * 0.5) {
            h._nextTick = h.tickEvery;
            ctx.damagePlayer(h.damage, h.x, h.y, 60);
            if (h.slow) p.slowT = Math.max(p.slowT || 0, 1.2);
          }
          if (h.t >= h.warn + h.linger) h.dead = true;
        } else if (h.t >= h.warn + 0.25) {
          h.dead = true;
        }
      }
    });
  }

  render(c) {
    this.pool.forEach((h) => {
      c.save();
      if (!h._detonated) {
        // Warning telegraph: growing filled disc + rim.
        const frac = Math.min(1, h.t / h.warn);
        c.globalAlpha = 0.16 + frac * 0.2;
        c.fillStyle = h.color;
        c.beginPath(); c.arc(h.x, h.y, h.radius, 0, TAU); c.fill();
        c.globalAlpha = 0.5 + frac * 0.4;
        c.strokeStyle = h.color; c.lineWidth = 2.5;
        c.beginPath(); c.arc(h.x, h.y, h.radius * frac, 0, TAU); c.stroke();
      } else if (h.linger > 0) {
        // Lingering pool.
        const lifeFrac = 1 - (h.t - h.warn) / h.linger;
        c.globalAlpha = 0.22 + 0.1 * Math.sin(h.t * 6) + 0.15 * lifeFrac;
        c.fillStyle = h.color;
        c.beginPath(); c.arc(h.x, h.y, h.radius, 0, TAU); c.fill();
        c.globalAlpha = 0.5;
        c.strokeStyle = h.color; c.lineWidth = 1.5;
        c.beginPath(); c.arc(h.x, h.y, h.radius, 0, TAU); c.stroke();
      } else {
        // Detonation flash.
        const f = (h.t - h.warn) / 0.25;
        c.globalAlpha = (1 - f) * 0.8;
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(h.x, h.y, h.radius * (1 + f * 0.2), 0, TAU); c.fill();
      }
      c.restore();
    });
  }

  clear() { this.pool.clear(); }
  get count() { return this.pool.count; }
}
