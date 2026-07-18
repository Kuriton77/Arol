// The player actor: responsive 8-directional movement, dash with i-frames,
// and a data-driven weapon combo state machine (windup/active/recover phases
// per combo step). Combat resolution (who gets hit) lives in CombatSystem;
// the Player only owns state + animation.
import { Entity } from './Entity.js';
import { CONFIG } from '../data/config.js';
import { createStats, derive } from '../systems/Stats.js';

export class Player extends Entity {
  constructor(x, y, weapon) {
    super(x, y, CONFIG.player.radius);
    this.weapon = weapon;
    this.stats = createStats(weapon);
    this.maxHealth = derive.maxHealth(this.stats);
    this.health = this.maxHealth;

    // Dash state
    this.dashTimer = 0;       // remaining dash duration
    this.dashCd = 0;          // cooldown remaining
    this.dashDirX = 0; this.dashDirY = 0;
    this.isDashing = false;

    // Attack state machine (data-driven by weapon.combo)
    this.attackTimer = 0;
    this.attackPhase = 'idle'; // idle | windup | active | recover
    this.attackCd = 0;
    this.swingDir = 0;
    this.swingProgress = 0;    // 0..1 for rendering the arc sweep
    this.comboIndex = 0;
    this.comboTimer = 0;       // time left to continue the chain
    this.currentStep = weapon.combo[0];
    this._hitThisSwing = new Set();
    this._firedProjectile = false;
    this.slowT = 0;            // spider-web slow timer
    this.shield = 0;           // current Aegis shield (absorbs damage)
    this.shieldRegenT = 0;     // time since last hit, for shield regen

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
    // Dash-triggered damage windows (Riposte / Shadow Dance boons).
    if (this.stats.dashBuffPct > 0) this.stats.dashBuffT = 2.0;
    if (this.stats.dashCrit) this._dashCritReady = true;
    return true;
  }

  tryAttack(aimX, aimY) {
    if (this.attackCd > 0 || this.attackPhase !== 'idle') return false;
    if (this.comboTimer <= 0) this.comboIndex = 0; // chain expired → restart
    const step = this.weapon.combo[this.comboIndex];
    this.currentStep = step;
    this.swingDir = Math.atan2(aimY - this.y, aimX - this.x);
    this.facing = this.swingDir;
    this.attackPhase = 'windup';
    this.attackTimer = step.windup ?? CONFIG.player.attack.windup;
    this.attackCd = derive.attackCooldown(this.stats, this.health / this.maxHealth) * (step.cd ?? 1);
    this._hitThisSwing.clear();
    this._firedProjectile = false;
    this._lunged = false;
    return true;
  }

  isSwingActive() { return this.attackPhase === 'active'; }

  update(dt, input, bounds) {
    // --- cooldowns & boon timers ---
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.comboTimer > 0) this.comboTimer -= dt;
    if (this.stats.dashBuffT > 0) this.stats.dashBuffT -= dt;
    if (this.stats.surgeT > 0) this.stats.surgeT -= dt;
    if (this.stats.killSpeedT > 0) this.stats.killSpeedT -= dt;
    if (this.stats.regen > 0 && this.health < this.maxHealth) this.heal(this.stats.regen * dt);
    // Aegis shield regenerates to full after ~3s without taking damage.
    if (this.stats.shieldMax > 0) {
      this.shieldRegenT += dt;
      if (this.shieldRegenT > 3 && this.shield < this.stats.shieldMax) {
        this.shield = Math.min(this.stats.shieldMax, this.shield + this.stats.shieldMax * 0.5 * dt);
      }
    }

    // --- attack phase machine ---
    const step = this.currentStep;
    if (this.attackPhase !== 'idle') {
      this.attackTimer -= dt;
      if (this.attackPhase === 'windup') {
        this.swingProgress = 0;
        if (this.attackTimer <= 0) {
          this.attackPhase = 'active';
          this.attackTimer = step.active ?? CONFIG.player.attack.active;
          // Self-lunge steps (spear finisher) burst the player forward.
          if (step.lunge && !this._lunged) {
            this._lunged = true;
            this.applyKnockback(Math.cos(this.swingDir), Math.sin(this.swingDir), step.lunge);
          }
        }
      } else if (this.attackPhase === 'active') {
        const dur = step.active ?? CONFIG.player.attack.active;
        this.swingProgress = 1 - this.attackTimer / dur;
        if (this.attackTimer <= 0) {
          this.attackPhase = 'recover';
          this.attackTimer = 0.06;
          // Advance the combo chain; window scaled by boons.
          this.comboIndex = (this.comboIndex + 1) % this.weapon.combo.length;
          this.comboTimer = this.weapon.comboWindow * this.stats.comboWindowMult;
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
      if (this.slowT > 0) this.slowT -= dt;
      const sp = derive.moveSpeed(this.stats) * (this.slowT > 0 ? 0.55 : 1);
      // Weapon weight: per-phase movement modifiers.
      const mm = this.weapon.moveMod || {};
      const atkSlow = this.attackPhase === 'active' ? (mm.active ?? 0.55)
                    : this.attackPhase === 'windup' ? (mm.windup ?? 0.7) : 1;
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
    // Pact of Scarcity (and similar) scale all healing received.
    const mult = this.stats.healMult ?? 1;
    this.health = Math.min(this.maxHealth, this.health + amount * mult);
  }
}
