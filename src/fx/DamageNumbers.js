// Pooled floating damage numbers. Crits render larger and gold.
import { ObjectPool } from '../core/ObjectPool.js';

export class DamageNumbers {
  constructor() {
    this.enabled = true; // toggled by the Damage Numbers setting
    this.pool = new ObjectPool(
      () => ({ x: 0, y: 0, vy: 0, life: 0, text: '', crit: false, color: '#fff', dead: false }),
      (n, o) => Object.assign(n, o),
    );
  }

  add(x, y, amount, opts = {}) {
    if (!this.enabled) return;
    this.pool.spawn({
      x: x + (Math.random() - 0.5) * 16,
      y: y - 10,
      vy: -46,
      life: 0.8,
      text: opts.text ?? String(Math.round(amount)),
      crit: opts.crit ?? false,
      color: opts.color ?? (opts.crit ? '#ffd23f' : '#fff'),
      dead: false,
    });
  }

  update(dt) {
    this.pool.update((n) => {
      n.life -= dt;
      if (n.life <= 0) { n.dead = true; return; }
      n.y += n.vy * dt;
      n.vy += 60 * dt; // slight gravity ease
    });
  }

  render(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.pool.forEach((n) => {
      const a = Math.min(1, n.life / 0.4);
      ctx.globalAlpha = a;
      const size = n.crit ? 22 : 15;
      ctx.font = `bold ${size}px "Trebuchet MS", system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(n.text, n.x, n.y);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, n.x, n.y);
    });
    ctx.globalAlpha = 1;
  }

  clear() { this.pool.clear(); }
}
