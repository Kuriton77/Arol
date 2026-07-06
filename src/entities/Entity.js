// Base for all mobile actors (player, enemies, boss). Handles position,
// velocity integration, knockback, hurt flash, and health bookkeeping.
import { clamp } from '../core/math.js';
import { CONFIG } from '../data/config.js';

export class Entity {
  constructor(x, y, radius) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = radius;
    this.health = 1;
    this.maxHealth = 1;
    this.dead = false;
    this.facing = 0;              // radians
    this.knockbackResist = 0;
    this._kx = 0; this._ky = 0;   // active knockback velocity
    this.hurtFlash = 0;           // >0 = show white flash
    this.iframes = 0;             // invulnerability timer
    // Damage-over-time (burn) stacks: {dps, time}
    this.dots = [];
  }

  get alive() { return !this.dead && this.health > 0; }

  applyKnockback(dirX, dirY, force) {
    const f = force * (1 - this.knockbackResist);
    this._kx += dirX * f;
    this._ky += dirY * f;
  }

  // Returns true if damage was actually applied (respecting i-frames).
  hurt(amount) {
    if (this.iframes > 0 || this.dead) return false;
    this.health -= amount;
    this.hurtFlash = 0.12;
    if (this.health <= 0) { this.health = 0; this.dead = true; }
    return true;
  }

  addBurn(dps, duration) {
    this.dots.push({ dps, time: duration });
  }

  // Integrate knockback + DoT; clamp to arena bounds. Movement is added by subclass.
  integrate(dt, bounds) {
    this.x += this._kx * dt;
    this.y += this._ky * dt;
    // Knockback decays quickly (exponential).
    const decay = Math.pow(0.0009, dt);
    this._kx *= decay;
    this._ky *= decay;

    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.iframes > 0) this.iframes -= dt;

    // Damage over time.
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      d.time -= dt;
      this.health -= d.dps * dt;
      if (d.time <= 0) this.dots.splice(i, 1);
    }
    if (this.health <= 0 && !this.dead) { this.health = 0; this.dead = true; }

    if (bounds) {
      const p = CONFIG.world.roomPadding + this.radius;
      this.x = clamp(this.x, bounds.x + p, bounds.x + bounds.w - p);
      this.y = clamp(this.y, bounds.y + p, bounds.y + bounds.h - p);
    }
  }
}
