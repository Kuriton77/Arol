// Generic enemy driven by data (ENEMY_TYPES) + an AI behaviour selector.
// Three archetypes share one class; behaviour differs by `def.ai`:
//   melee  – close in, telegraph, lunge-strike
//   ranged – kite to preferred distance, telegraph, fire projectile
//   tank   – slow relentless advance, heavy telegraphed slam
import { Entity } from './Entity.js';
import { dist, TAU } from '../core/math.js';

export class Enemy extends Entity {
  constructor(x, y, def, depth = 0) {
    super(x, y, def.radius);
    this.def = def;
    this.ai = def.ai;
    // Depth scaling keeps later floors threatening without new data.
    const hpScale = 1 + depth * 0.18;
    const dmgScale = 1 + depth * 0.12;
    this.maxHealth = Math.round(def.health * hpScale);
    this.health = this.maxHealth;
    this.damage = def.damage * dmgScale;
    this.speed = def.speed;
    this.knockbackResist = def.knockbackResist || 0;
    this.color = def.color;
    this.accent = def.accent;
    this.xpValue = def.xp;
    this.goldValue = def.gold;
    this.isElite = false;

    this.state = 'chase';
    this.attackCd = Math.random() * 0.5; // desync initial attacks
    this.windup = 0;
    this.strikeTimer = 0;
    this.telegraph = 0;        // 0..1 render intensity
    this.hasStruck = false;
    this.wanderAngle = Math.random() * TAU;
  }

  makeElite() {
    this.isElite = true;
    this.maxHealth = Math.round(this.maxHealth * 2.2);
    this.health = this.maxHealth;
    this.damage *= 1.4;
    this.speed *= 1.12;
    this.radius *= 1.25;
    this.goldValue *= 3;
    this.xpValue *= 2.5;
  }

  // ctx: { player, bounds, spawnProjectile }
  update(dt, ctx) {
    if (this.attackCd > 0) this.attackCd -= dt;
    const p = ctx.player;
    const d = dist(this.x, this.y, p.x, p.y);
    this.facing = Math.atan2(p.y - this.y, p.x - this.x);
    const atk = this.def.attack;

    let mx = 0, my = 0;
    switch (this.ai) {
      case 'ranged': {
        const pref = this.def.preferredDist;
        if (d < pref - 30) { mx = -Math.cos(this.facing); my = -Math.sin(this.facing); }
        else if (d > pref + 30) { mx = Math.cos(this.facing); my = Math.sin(this.facing); }
        else {
          // Strafe around the player.
          mx = -Math.sin(this.facing); my = Math.cos(this.facing);
        }
        if (this.state === 'chase' && this.attackCd <= 0 && d < atk.range) {
          this.state = 'windup'; this.windup = atk.windup; this.telegraph = 0;
        }
        break;
      }
      case 'tank':
      case 'melee': {
        mx = Math.cos(this.facing); my = Math.sin(this.facing);
        if (this.state === 'chase' && this.attackCd <= 0 && d < atk.range + this.radius + p.radius) {
          this.state = 'windup'; this.windup = atk.windup; this.telegraph = 0; this.hasStruck = false;
        }
        break;
      }
    }

    // Behaviour states.
    if (this.state === 'windup') {
      this.windup -= dt;
      this.telegraph = Math.min(1, this.telegraph + dt * 4);
      mx *= 0.15; my *= 0.15; // brace during telegraph
      if (this.windup <= 0) {
        if (this.ai === 'ranged') {
          this._fire(ctx);
          this.state = 'recover'; this.strikeTimer = 0.25;
        } else {
          this.state = 'strike'; this.strikeTimer = 0.22;
          // Lunge burst toward player.
          this.applyKnockback(Math.cos(this.facing), Math.sin(this.facing), atk.lunge);
        }
        this.attackCd = atk.cooldown;
      }
    } else if (this.state === 'strike') {
      this.telegraph = Math.max(0, this.telegraph - dt * 3);
      this.strikeTimer -= dt;
      if (this.strikeTimer <= 0) this.state = 'chase';
    } else if (this.state === 'recover') {
      this.telegraph = Math.max(0, this.telegraph - dt * 4);
      this.strikeTimer -= dt;
      mx *= 0.3; my *= 0.3;
      if (this.strikeTimer <= 0) this.state = 'chase';
    }

    this.vx = mx * this.speed;
    this.vy = my * this.speed;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.integrate(dt, ctx.bounds);
  }

  _fire(ctx) {
    const a = this.def.attack;
    ctx.spawnProjectile({
      x: this.x, y: this.y,
      vx: Math.cos(this.facing) * a.projSpeed,
      vy: Math.sin(this.facing) * a.projSpeed,
      radius: 7, damage: this.damage, hostile: true,
      color: this.accent, life: 3, knockback: a.knockback,
    });
    if (ctx.onShoot) ctx.onShoot(this);
  }

  // True while a melee/tank strike can connect this frame.
  get strikeActive() { return this.state === 'strike' && !this.hasStruck; }
}
