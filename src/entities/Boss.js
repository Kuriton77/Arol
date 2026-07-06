// Multi-phase boss with telegraphed attack patterns and a clear AI state machine:
//   idle → choose pattern → telegraph → execute → recover → idle
// Phases (BOSS_DEF.phases) unlock faster/harder behaviour at HP thresholds.
import { Entity } from './Entity.js';
import { BOSS_DEF } from '../data/enemies.js';
import { TAU, dist } from '../core/math.js';

export class Boss extends Entity {
  constructor(x, y, depth = 0) {
    super(x, y, BOSS_DEF.radius);
    this.def = BOSS_DEF;
    const scale = 1 + depth * 0.15;
    this.maxHealth = Math.round(BOSS_DEF.health * scale);
    this.health = this.maxHealth;
    this.speed = BOSS_DEF.speed;
    this.color = BOSS_DEF.color;
    this.accent = BOSS_DEF.accent;
    this.contactDamage = BOSS_DEF.contactDamage * scale;
    this.knockbackResist = 0.85;

    this.state = 'idle';
    this.stateTimer = 1.2;
    this.telegraph = 0;
    this.pattern = null;
    this.phaseIndex = 0;
    this.spinAngle = 0;
    this._chargeDir = { x: 0, y: 0 };
    this.justChangedPhase = false;
  }

  get phase() { return this.def.phases[this.phaseIndex]; }

  _updatePhase() {
    const frac = this.health / this.maxHealth;
    let target = 0;
    for (let i = 0; i < this.def.phases.length; i++) {
      if (frac <= this.def.phases[i].at) target = i;
    }
    if (target > this.phaseIndex) {
      this.phaseIndex = target;
      this.justChangedPhase = true;   // consumed by Game for VFX/roar
      this.state = 'recover';
      this.stateTimer = 0.8;
      this.iframes = 0.8;             // brief invuln on phase transition
    }
  }

  // ctx: { player, bounds, spawnProjectile, spawnAdd }
  update(dt, ctx) {
    this._updatePhase();
    const p = ctx.player;
    this.facing = Math.atan2(p.y - this.y, p.x - this.x);
    const ph = this.phase;
    this.spinAngle += dt * 2;

    let mx = 0, my = 0;
    this.stateTimer -= dt;

    switch (this.state) {
      case 'idle': {
        // Drift slowly toward the player between attacks.
        const d = dist(this.x, this.y, p.x, p.y);
        if (d > 160) { mx = Math.cos(this.facing); my = Math.sin(this.facing); }
        if (this.stateTimer <= 0) this._choosePattern(ctx);
        break;
      }
      case 'telegraph': {
        this.telegraph = Math.min(1, this.telegraph + dt * 3);
        if (this.pattern === 'charge') {
          // Lock direction, brace.
          this._chargeDir = { x: Math.cos(this.facing), y: Math.sin(this.facing) };
        }
        if (this.stateTimer <= 0) { this.state = 'execute'; this.stateTimer = 0.45; this._executed = false; }
        break;
      }
      case 'execute': {
        if (!this._executed) { this._execute(ctx); this._executed = true; }
        if (this.pattern === 'charge') {
          const cs = 620 * ph.speedMult;
          mx = this._chargeDir.x * (cs / this.speed);
          my = this._chargeDir.y * (cs / this.speed);
        }
        this.telegraph = Math.max(0, this.telegraph - dt * 4);
        if (this.stateTimer <= 0) { this.state = 'recover'; this.stateTimer = 0.7 * ph.cooldownMult; }
        break;
      }
      case 'recover': {
        this.telegraph = Math.max(0, this.telegraph - dt * 3);
        if (this.stateTimer <= 0) { this.state = 'idle'; this.stateTimer = (0.6 + Math.random() * 0.6) * ph.cooldownMult; }
        break;
      }
    }

    this.vx = mx * this.speed * ph.speedMult;
    this.vy = my * this.speed * ph.speedMult;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.integrate(dt, ctx.bounds);
  }

  _choosePattern(ctx) {
    // Pattern pool widens with phase.
    const pool = ['radial', 'charge'];
    if (this.phaseIndex >= 1) pool.push('spiral', 'summon');
    if (this.phaseIndex >= 2) pool.push('spiral', 'radial'); // more aggressive weighting
    this.pattern = pool[Math.floor(Math.random() * pool.length)];
    this.state = 'telegraph';
    this.stateTimer = this.pattern === 'charge' ? 0.7 : 0.85;
    this.telegraph = 0;
    if (ctx.onTelegraph) ctx.onTelegraph(this);
  }

  _execute(ctx) {
    const ph = this.phase;
    const speedBoost = 260 + this.phaseIndex * 40;
    if (this.pattern === 'radial') {
      const n = 14 + this.phaseIndex * 4;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + Math.random() * 0.05;
        ctx.spawnProjectile({
          x: this.x, y: this.y,
          vx: Math.cos(a) * speedBoost, vy: Math.sin(a) * speedBoost,
          radius: 8, damage: 12, hostile: true, color: this.accent, life: 4, knockback: 160,
        });
      }
    } else if (this.pattern === 'spiral') {
      // Fire an arm of a rotating spiral (execute is called once; emit a fan).
      const arms = 3;
      for (let k = 0; k < arms; k++) {
        const a = this.spinAngle + (k / arms) * TAU;
        ctx.spawnProjectile({
          x: this.x, y: this.y,
          vx: Math.cos(a) * speedBoost, vy: Math.sin(a) * speedBoost,
          radius: 8, damage: 12, hostile: true, color: '#ff7bad', life: 4, knockback: 140,
        });
      }
      // Chain a few more shots over the execute window via caller? Keep single-shot for MVP clarity.
    } else if (this.pattern === 'summon') {
      const n = 2 + this.phaseIndex;
      for (let i = 0; i < n; i++) ctx.spawnAdd(this);
    }
    // 'charge' movement is handled in execute-state velocity; no projectiles.
    if (ctx.onExecute) ctx.onExecute(this);
  }
}
