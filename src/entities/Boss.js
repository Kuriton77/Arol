// Data-driven boss: a pattern engine running a clear AI state machine —
//   idle → telegraph → execute → recover → idle
// Phases (def.phases, keyed by HP fraction) change speed/cooldowns and unlock
// pattern pools. PATTERNS is a shared library: each entry defines telegraph
// time, execute duration, and either a one-shot execute() or a tick() that
// emits continuously across the execute window. Adding a boss = data entry
// in bosses.js; adding an attack = one PATTERNS entry.
import { Entity } from './Entity.js';
import { TAU, dist } from '../core/math.js';

function fire(ctx, x, y, angle, speed, opts = {}) {
  ctx.spawnProjectile({
    x, y,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    radius: opts.radius ?? 8, damage: opts.damage ?? 12, hostile: true,
    color: opts.color ?? '#ffb0cf', life: opts.life ?? 4, knockback: opts.knockback ?? 150,
    slow: opts.slow ?? false,
  });
}

const PATTERNS = {
  // Full-circle bullet burst.
  radial: {
    tel: 0.85, dur: 0.35,
    execute(b, ctx) {
      const P = b.def.params;
      const n = (P.radialCount ?? 14) + b.phaseIndex * 4;
      const speed = (P.projSpeed ?? 260) + b.phaseIndex * 40;
      for (let i = 0; i < n; i++) {
        fire(ctx, b.x, b.y, (i / n) * TAU + Math.random() * 0.05, speed,
          { color: b.accent, slow: P.webShots, damage: b.projDamage });
      }
    },
  },
  // Rotating multi-arm stream across the execute window.
  spiral: {
    tel: 0.7, dur: 1.5, tickEvery: 0.13,
    tick(b, ctx) {
      const P = b.def.params;
      const speed = (P.projSpeed ?? 260) + b.phaseIndex * 30;
      const arms = 3;
      for (let k = 0; k < arms; k++) {
        fire(ctx, b.x, b.y, b.spinAngle + (k / arms) * TAU, speed,
          { color: '#ff9bc4', damage: b.projDamage });
      }
      b.spinAngle += 0.42;
    },
  },
  // Locked-direction body charge.
  charge: {
    tel: 0.7, dur: 0.55, locksFacing: true,
    moveSpeed(b) { return b.def.params.chargeSpeed ?? 620; },
  },
  // Raise adds around the boss.
  summon: {
    tel: 0.9, dur: 0.4,
    execute(b, ctx) {
      const P = b.def.params;
      const n = (P.summonCount ?? 2) + b.phaseIndex;
      for (let i = 0; i < n; i++) ctx.spawnAdd(b, P.summonType ?? 'melee');
    },
  },
  // Aimed shotgun bursts, repeated.
  volley: {
    tel: 0.6, dur: 0.9, tickEvery: 0.28,
    tick(b, ctx) {
      const P = b.def.params;
      const shots = P.volleyShots ?? 3;
      const speed = (P.projSpeed ?? 260) + 60;
      for (let i = 0; i < shots; i++) {
        const off = (i - (shots - 1) / 2) * 0.18;
        fire(ctx, b.x, b.y, b.facing + off, speed, { color: b.accent, damage: b.projDamage });
      }
    },
  },
  // Expanding ring with a random safe gap — dodge through the opening.
  ring: {
    tel: 0.9, dur: 0.35,
    execute(b, ctx) {
      const n = 26;
      const gapAt = Math.floor(Math.random() * n);
      const speed = (b.def.params.projSpeed ?? 260) * 0.85;
      for (let i = 0; i < n; i++) {
        if (i === gapAt || i === (gapAt + 1) % n || i === (gapAt + n - 1) % n) continue;
        fire(ctx, b.x, b.y, (i / n) * TAU, speed, { color: '#fff', radius: 7, damage: b.projDamage });
      }
    },
  },
  // Sweeping breath cone toward the player.
  cone: {
    tel: 0.7, dur: 1.2, tickEvery: 0.16,
    tick(b, ctx) {
      const P = b.def.params;
      const shots = P.coneShots ?? 4;
      const speed = P.projSpeed ?? 240;
      for (let i = 0; i < shots; i++) {
        const off = (Math.random() - 0.5) * 0.9;
        fire(ctx, b.x, b.y, b.facing + off, speed * (0.8 + Math.random() * 0.4),
          { color: b.accent, slow: P.chillProj, damage: b.projDamage, life: 2.4 });
      }
    },
  },
  // Telegraphed ground eruptions under and around the player.
  hazards: {
    tel: 0.55, dur: 0.4,
    execute(b, ctx) {
      const P = b.def.params;
      const n = (P.hazardCount ?? 4) + b.phaseIndex;
      const p = ctx.player;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = i === 0 ? 0 : 60 + Math.random() * 160; // first lands on the player
        ctx.spawnHazard({
          x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r,
          radius: P.hazardRadius ?? 60, warn: 1.0,
          damage: b.projDamage + 4, color: b.accent,
        });
      }
    },
  },
  // Blink next to the player and release a short burst.
  teleport: {
    tel: 0.5, dur: 0.35,
    execute(b, ctx) {
      const p = ctx.player;
      const a = Math.random() * TAU;
      const bnd = ctx.bounds, pad = 90;
      b.x = Math.min(bnd.x + bnd.w - pad, Math.max(bnd.x + pad, p.x + Math.cos(a) * 170));
      b.y = Math.min(bnd.y + bnd.h - pad, Math.max(bnd.y + pad, p.y + Math.sin(a) * 170));
      if (ctx.onBlink) ctx.onBlink(b);
      const n = 8 + b.phaseIndex * 2;
      for (let i = 0; i < n; i++) {
        fire(ctx, b.x, b.y, (i / n) * TAU + Math.random() * 0.1, 300, { color: b.accent, damage: b.projDamage });
      }
    },
  },
  // Close-range slam: AoE around the boss plus a slow shockwave ring.
  novaSlam: {
    tel: 0.8, dur: 0.35,
    execute(b, ctx) {
      const P = b.def.params;
      ctx.explode(b.x, b.y, P.slamRadius ?? 120, b.projDamage + 6, b.accent);
      const n = 12;
      for (let i = 0; i < n; i++) {
        fire(ctx, b.x, b.y, (i / n) * TAU, 170, { color: b.color, radius: 9, damage: b.projDamage, life: 2 });
      }
    },
  },
};

export class Boss extends Entity {
  // `scale` is a { hp, damage } multiplier bundle from the DifficultyManager.
  // Defaults to identity so the boss can be constructed standalone.
  constructor(x, y, def, scale = { hp: 1, damage: 1 }) {
    super(x, y, def.radius);
    this.def = def;
    this.maxHealth = Math.round(def.health * (scale.hp ?? 1));
    this.health = this.maxHealth;
    this.speed = def.speed;
    this.color = def.color;
    this.accent = def.accent;
    this.contactDamage = def.contactDamage * (scale.damage ?? 1);
    this.projDamage = Math.round(12 * (scale.damage ?? 1));
    this.knockbackResist = 0.85;
    this.isBossEntity = true; // excluded from execute/stun effects

    this.state = 'idle';
    this.stateTimer = 1.2;
    this.telegraph = 0;
    this.pattern = null;       // active PATTERNS key
    this.lastPattern = null;
    this.phaseIndex = 0;
    this.spinAngle = 0;
    this._chargeDir = { x: 0, y: 0 };
    this._tickT = 0;
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

  // ctx: { player, bounds, spawnProjectile, spawnAdd, spawnHazard, explode, onBlink, onTelegraph, onExecute }
  update(dt, ctx) {
    this._updatePhase();
    const p = ctx.player;
    const pat = this.pattern ? PATTERNS[this.pattern] : null;
    const locked = pat && pat.locksFacing && this.state !== 'idle';
    if (!locked) this.facing = Math.atan2(p.y - this.y, p.x - this.x);
    const ph = this.phase;
    this.spinAngle += dt * 0.6;

    let mx = 0, my = 0;
    this.stateTimer -= dt;

    switch (this.state) {
      case 'idle': {
        const d = dist(this.x, this.y, p.x, p.y);
        if (d > 160) { mx = Math.cos(this.facing); my = Math.sin(this.facing); }
        if (this.stateTimer <= 0) this._choosePattern(ctx);
        break;
      }
      case 'telegraph': {
        this.telegraph = Math.min(1, this.telegraph + dt * 3);
        if (pat.locksFacing) {
          this._chargeDir = { x: Math.cos(this.facing), y: Math.sin(this.facing) };
        }
        if (this.stateTimer <= 0) {
          this.state = 'execute';
          this.stateTimer = pat.dur;
          this._tickT = 0;
          this._executed = false;
        }
        break;
      }
      case 'execute': {
        if (pat.execute && !this._executed) {
          this._executed = true;
          pat.execute(this, ctx);
          if (ctx.onExecute) ctx.onExecute(this);
        }
        if (pat.tick) {
          this._tickT -= dt;
          if (this._tickT <= 0) {
            this._tickT = pat.tickEvery;
            pat.tick(this, ctx);
            if (ctx.onExecute) ctx.onExecute(this);
          }
        }
        if (pat.moveSpeed) {
          const cs = pat.moveSpeed(this) * ph.speedMult;
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
    const pool = this.phase.patterns;
    // Avoid repeating the previous pattern when alternatives exist.
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && pick === this.lastPattern) {
      pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    }
    this.pattern = pick;
    this.lastPattern = pick;
    this.state = 'telegraph';
    this.stateTimer = PATTERNS[pick].tel;
    this.telegraph = 0;
    if (ctx.onTelegraph) ctx.onTelegraph(this);
  }

  // Renderer helpers.
  get telegraphKind() {
    if (this.state !== 'telegraph') return null;
    const pat = PATTERNS[this.pattern];
    if (pat && pat.locksFacing) return 'line';
    if (this.pattern === 'novaSlam' || this.pattern === 'teleport') return 'burst';
    return 'ring';
  }
}
