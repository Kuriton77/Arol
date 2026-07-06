// The player actor: responsive 8-directional movement, dash with i-frames,
// and an arc melee swing with windup/active/recover phases. Combat resolution
// (who gets hit) lives in CombatSystem; the Player only owns state + animation.
import { Entity } from './Entity.js';
import { CONFIG } from '../data/config.js';
import { createStats, derive } from '../systems/Stats.js';

export class Player extends Entity {
  constructor(x, y, weapon) {
    super(x, y, CONFIG.player.radius);
    this.stats = createStats(weapon);
    this.maxHealth = derive.maxHealth(this.stats);
    this.health = this.maxHealth;

    // Dash state
    this.dashTimer = 0;       // remaining dash duration
    this.dashCd = 0;          // cooldown remaining
    this.dashDirX = 0; this.dashDirY = 0;
    this.isDashing = false;

    // Attack state machine
    this.attackTimer = 0;
    this.attackPhase = 'idle'; // idle | windup | active | recover
    this.attackCd = 0;
    this.swingDir = 0;
    this.swingProgress = 0;    // 0..1 for rendering the arc sweep
    this._hitThisSwing = new Set();

    // Progression
    this.level = 1;
    this.xp = 0;
    this.xpToNext = CONFIG.progression.xpBase;
    this.gold = 0;
  }

  refreshMaxHealth() {
    const nm = derive.maxHealth(this.stats);
    this.maxHealth = nm;
    if (this.health > nm) this.health = nm;
  }

  tryDash(dirX, dirY) {
    if (this.dashCd > 0 || this.isDashing) return false;
    // Dash in movement direction, or facing if standing still.
    let dx = dirX, dy = dirY;
    if (dx === 0 && dy === 0) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); }
    const len = Math.hypot(dx, dy) || 1;
    this.dashDirX = dx / len; this.dashDirY = dy / len;
    this.isDashing = true;
    this.dashTimer = CONFIG.player.dash.duration;
    this.dashCd = derive.dashCooldown(this.stats);
    this.iframes = Math.max(this.iframes, CONFIG.player.dash.iframes);
    return true;
  }

  tryAttack(aimX, aimY) {
    if (this.attackCd > 0 || this.attackPhase !== 'idle') return false;
    this.swingDir = Math.atan2(aimY - this.y, aimX - this.x);
    this.facing = this.swingDir;
    this.attackPhase = 'windup';
    this.attackTimer = CONFIG.player.attack.windup;
    this.attackCd = derive.attackCooldown(this.stats);
    this._hitThisSwing.clear();
    this._firedProjectile = false;
    return true;
  }

  isSwingActive() { return this.attackPhase === 'active'; }

  update(dt, input, bounds) {
    // --- cooldowns ---
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;

    // --- attack phase machine ---
    if (this.attackPhase !== 'idle') {
      this.attackTimer -= dt;
      if (this.attackPhase === 'windup') {
        this.swingProgress = 0;
        if (this.attackTimer <= 0) {
          this.attackPhase = 'active';
          this.attackTimer = CONFIG.player.attack.active;
        }
      } else if (this.attackPhase === 'active') {
        this.swingProgress = 1 - this.attackTimer / CONFIG.player.attack.active;
        if (this.attackTimer <= 0) {
          this.attackPhase = 'recover';
          this.attackTimer = 0.06;
        }
      } else if (this.attackPhase === 'recover') {
        if (this.attackTimer <= 0) this.attackPhase = 'idle';
      }
    }

    // --- movement ---
    if (this.isDashing) {
      const ds = CONFIG.player.dash.speed;
      this.vx = this.dashDirX * ds;
      this.vy = this.dashDirY * ds;
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) this.isDashing = false;
    } else {
      const axis = input.moveAxis();
      const sp = derive.moveSpeed(this.stats);
      // Slow slightly while swinging for weightier feel.
      const atkSlow = this.attackPhase === 'active' ? 0.55 : this.attackPhase === 'windup' ? 0.7 : 1;
      this.vx = axis.x * sp * atkSlow;
      this.vy = axis.y * sp * atkSlow;
      // Face aim direction when not mid-swing.
      if (this.attackPhase === 'idle') {
        this.facing = Math.atan2(input.mouse.y - this.y, input.mouse.x - this.x);
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.integrate(dt, bounds);
  }

  gainXp(amount) {
    this.xp += amount;
    let levels = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      levels++;
      this.xpToNext = Math.round(this.xpToNext * CONFIG.progression.xpGrowth);
    }
    return levels; // number of level-ups gained
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }
}
