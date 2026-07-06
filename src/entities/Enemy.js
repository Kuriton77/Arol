// Generic enemy driven by data (ENEMY_TYPES) + a behaviour registry.
// All archetypes share one state machine — chase → windup → strike → recover
// (plus 'vanish' and 'stunned' for special behaviours) — while BEHAVIOURS
// provides per-archetype hooks:
//   chase(e, ctx, dt, d)  → {x, y} movement intent; may call e.startWindup()
//   attack(e, ctx)        → executes when windup completes
//   strikeMove(e, ctx, dt)→ optional custom movement during strike
// Adding an enemy = data entry + (if its AI is new) one behaviour object.
import { Entity } from './Entity.js';
import { dist, TAU, angleDelta } from '../core/math.js';

// --- shared movement helpers -----------------------------------------------
const toward = (e, tx, ty) => {
  const a = Math.atan2(ty - e.y, tx - e.x);
  return { x: Math.cos(a), y: Math.sin(a) };
};
const away = (e, tx, ty) => { const v = toward(e, tx, ty); return { x: -v.x, y: -v.y }; };
const strafe = (e, tx, ty, dir = 1) => {
  const a = Math.atan2(ty - e.y, tx - e.x);
  return { x: -Math.sin(a) * dir, y: Math.cos(a) * dir };
};
// Approach / retreat to hold a preferred ring around the player.
const holdRing = (e, p, pref, band = 30) => {
  const d = dist(e.x, e.y, p.x, p.y);
  if (d < pref - band) return away(e, p.x, p.y);
  if (d > pref + band) return toward(e, p.x, p.y);
  return strafe(e, p.x, p.y, e.strafeDir);
};

const BEHAVIOURS = {
  melee: {
    chase(e, ctx, dt, d) {
      const p = ctx.player, atk = e.def.attack;
      if (e.attackCd <= 0 && d < atk.range + e.radius + p.radius) e.startWindup();
      return toward(e, p.x, p.y);
    },
    attack(e, ctx) {
      const atk = e.def.attack;
      e.state = 'strike'; e.strikeTimer = 0.22; e.hasStruck = false;
      e.applyKnockback(Math.cos(e.facing), Math.sin(e.facing), atk.lunge);
      e.attackCd = atk.cooldown;
    },
  },

  tank: {
    chase(e, ctx, dt, d) { return BEHAVIOURS.melee.chase(e, ctx, dt, d); },
    attack(e, ctx) { BEHAVIOURS.melee.attack(e, ctx); e.strikeTimer = 0.26; },
  },

  ranged: {
    chase(e, ctx, dt, d) {
      const p = ctx.player, atk = e.def.attack;
      if (e.attackCd <= 0 && d < atk.range) e.startWindup();
      return holdRing(e, p, e.def.preferredDist);
    },
    attack(e, ctx) {
      const a = e.def.attack;
      ctx.spawnProjectile({
        x: e.x, y: e.y,
        vx: Math.cos(e.facing) * a.projSpeed, vy: Math.sin(e.facing) * a.projSpeed,
        radius: 7, damage: e.damage, hostile: true,
        color: e.accent, life: 3, knockback: a.knockback,
      });
      if (ctx.onShoot) ctx.onShoot(e);
      e.state = 'recover'; e.strikeTimer = 0.25;
      e.attackCd = a.cooldown;
    },
  },

  // Blinks away when crowded; fires a 3-round burst with slight spread.
  mage: {
    chase(e, ctx, dt, d) {
      const p = ctx.player, atk = e.def.attack;
      if (d < atk.blinkDist && e.blinkCd <= 0) {
        e.blinkCd = 3.0;
        const a = Math.random() * TAU;
        const b = ctx.bounds, pad = 70;
        e.x = Math.min(b.x + b.w - pad, Math.max(b.x + pad, p.x + Math.cos(a) * 260));
        e.y = Math.min(b.y + b.h - pad, Math.max(b.y + pad, p.y + Math.sin(a) * 260));
        e.iframes = 0.15;
        if (ctx.onBlink) ctx.onBlink(e);
      }
      if (e.attackCd <= 0 && d < atk.range) e.startWindup();
      return holdRing(e, p, e.def.preferredDist);
    },
    attack(e, ctx) {
      const a = e.def.attack;
      for (let i = 0; i < a.burst; i++) {
        const spread = (i - (a.burst - 1) / 2) * 0.14;
        ctx.spawnProjectile({
          x: e.x, y: e.y,
          vx: Math.cos(e.facing + spread) * a.projSpeed,
          vy: Math.sin(e.facing + spread) * a.projSpeed,
          radius: 7, damage: e.damage, hostile: true,
          color: e.accent, life: 3, knockback: a.knockback,
        });
      }
      if (ctx.onShoot) ctx.onShoot(e);
      e.state = 'recover'; e.strikeTimer = 0.35;
      e.attackCd = a.cooldown;
    },
  },

  // Vanishes, reappears behind the player, quick backstab strike.
  assassin: {
    chase(e, ctx, dt, d) {
      const p = ctx.player;
      if (e.attackCd <= 0 && d < 300) {
        e.state = 'vanish';
        e.vanishTimer = e.def.attack.vanishTime;
        return { x: 0, y: 0 };
      }
      return toward(e, p.x, p.y);
    },
    attack(e, ctx) { BEHAVIOURS.melee.attack(e, ctx); e.strikeTimer = 0.18; },
  },

  // Rushes in and detonates — its own death is the attack.
  bomber: {
    chase(e, ctx, dt, d) {
      const p = ctx.player, atk = e.def.attack;
      if (d < atk.range + p.radius) e.startWindup();
      return toward(e, p.x, p.y);
    },
    attack(e, ctx) {
      // Die first so the blast doesn't re-hit (or loot) the bomber itself.
      e.suicided = true;
      e.health = 0; e.dead = true;
      ctx.explode(e.x, e.y, e.def.attack.blastRadius, e.damage, e.accent);
    },
  },

  // Raises Bonelings from a distance. The windup is the summoning ritual.
  necromancer: {
    chase(e, ctx, dt, d) {
      const p = ctx.player;
      if (e.attackCd <= 0) e.startWindup();
      return holdRing(e, p, e.def.preferredDist, 50);
    },
    attack(e, ctx) {
      const a = e.def.attack;
      for (let i = 0; i < a.summonCount; i++) {
        const ang = Math.random() * TAU;
        ctx.spawnEnemy(a.summonType, e.x + Math.cos(ang) * 40, e.y + Math.sin(ang) * 40);
      }
      if (ctx.onSummon) ctx.onSummon(e);
      e.state = 'recover'; e.strikeTimer = 0.5;
      e.attackCd = a.cooldown;
    },
  },

  // Skitters in a zig-zag ring and spits slowing webs.
  spider: {
    chase(e, ctx, dt, d) {
      const p = ctx.player, atk = e.def.attack;
      e.zigT -= dt;
      if (e.zigT <= 0) { e.zigT = 0.5 + Math.random() * 0.4; e.strafeDir *= -1; }
      if (e.attackCd <= 0 && d < atk.range) e.startWindup();
      const ring = holdRing(e, p, e.def.preferredDist, 24);
      return ring;
    },
    attack(e, ctx) {
      const a = e.def.attack;
      ctx.spawnProjectile({
        x: e.x, y: e.y,
        vx: Math.cos(e.facing) * a.projSpeed, vy: Math.sin(e.facing) * a.projSpeed,
        radius: 8, damage: e.damage, hostile: true, slow: true,
        color: '#d8ffe8', life: 2.5, knockback: a.knockback,
      });
      if (ctx.onShoot) ctx.onShoot(e);
      e.state = 'recover'; e.strikeTimer = 0.2;
      e.attackCd = a.cooldown;
    },
  },

  // Channels healing into the most wounded ally in range. Never attacks.
  healer: {
    chase(e, ctx, dt, d) {
      const p = ctx.player, atk = e.def.attack;
      // Find most wounded living ally (not self, not full hp).
      let best = null, bestFrac = 0.99;
      for (const ally of ctx.enemies()) {
        if (ally === e || !ally.alive) continue;
        const frac = ally.health / ally.maxHealth;
        if (frac < bestFrac && dist(e.x, e.y, ally.x, ally.y) < atk.healRange) {
          bestFrac = frac; best = ally;
        }
      }
      e.healTarget = best;
      if (best) {
        best.health = Math.min(best.maxHealth, best.health + atk.healPerSec * dt);
        e.healFxT -= dt;
        if (e.healFxT <= 0 && ctx.onHeal) { e.healFxT = 0.25; ctx.onHeal(e, best); }
      }
      // Stay away from the player, drift toward the heal target.
      if (d < 200) return away(e, p.x, p.y);
      if (best) return toward(e, best.x, best.y);
      return strafe(e, p.x, p.y, e.strafeDir);
    },
    attack() { /* never attacks */ },
  },

  // Telegraphed line charge; slams into walls and is stunned.
  charger: {
    chase(e, ctx, dt, d) {
      const p = ctx.player, atk = e.def.attack;
      if (e.attackCd <= 0 && d < atk.range) {
        e.startWindup();
        e.lockFacing = true;
      }
      return toward(e, p.x, p.y);
    },
    attack(e, ctx) {
      e.state = 'strike'; e.strikeTimer = 1.2; e.hasStruck = false;
      e.chargeDir = e.facing;
      e.attackCd = e.def.attack.cooldown;
    },
    strikeMove(e, ctx, dt) {
      const sp = e.def.attack.chargeSpeed / (e.speed || 1);
      // Wall slam: if we're pressed against the arena edge, stun.
      const b = ctx.bounds, pad = 48 + e.radius + 2;
      const atEdge = e.x <= b.x + pad || e.x >= b.x + b.w - pad || e.y <= b.y + pad || e.y >= b.y + b.h - pad;
      if (atEdge && e.strikeTimer < 1.1) {
        e.state = 'stunned'; e.strikeTimer = e.def.attack.stun;
        e.lockFacing = false;
        if (ctx.onSlam) ctx.onSlam(e);
        return { x: 0, y: 0 };
      }
      return { x: Math.cos(e.chargeDir) * sp, y: Math.sin(e.chargeDir) * sp };
    },
  },

  // Immobile turret firing rotating radial volleys.
  warden: {
    chase(e, ctx, dt, d) {
      if (e.attackCd <= 0) e.startWindup();
      return { x: 0, y: 0 };
    },
    attack(e, ctx) {
      const a = e.def.attack;
      e.spin += 0.35;
      for (let i = 0; i < a.radial; i++) {
        const ang = (i / a.radial) * TAU + e.spin;
        ctx.spawnProjectile({
          x: e.x, y: e.y,
          vx: Math.cos(ang) * a.projSpeed, vy: Math.sin(ang) * a.projSpeed,
          radius: 6, damage: e.damage, hostile: true,
          color: e.accent, life: 3.2, knockback: a.knockback,
        });
      }
      if (ctx.onShoot) ctx.onShoot(e);
      e.state = 'recover'; e.strikeTimer = 0.4;
      e.attackCd = a.cooldown;
    },
  },
};

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
    this.attackCd = 0.4 + Math.random() * 0.6; // desync initial attacks
    this.windup = 0;
    this.strikeTimer = 0;
    this.telegraph = 0;        // 0..1 render intensity
    this.hasStruck = false;
    this.lockFacing = false;
    this.chargeDir = 0;
    this.vanishTimer = 0;
    this.blinkCd = 0;
    this.zigT = 0;
    this.spin = Math.random() * TAU;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.healTarget = null;
    this.healFxT = 0;
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

  startWindup() {
    this.state = 'windup';
    this.windup = this.def.attack.windup;
    this.telegraph = 0;
    this.hasStruck = false;
  }

  // ctx: { player, bounds, enemies(), spawnProjectile, spawnEnemy, explode, on* fx hooks }
  update(dt, ctx) {
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.blinkCd > 0) this.blinkCd -= dt;
    const p = ctx.player;
    const d = dist(this.x, this.y, p.x, p.y);
    if (!this.lockFacing) this.facing = Math.atan2(p.y - this.y, p.x - this.x);
    const B = BEHAVIOURS[this.ai] || BEHAVIOURS.melee;

    let mv = { x: 0, y: 0 };
    switch (this.state) {
      case 'chase':
        mv = B.chase(this, ctx, dt, d);
        break;
      case 'windup': {
        this.windup -= dt;
        this.telegraph = Math.min(1, this.telegraph + dt * 4);
        const tv = toward(this, p.x, p.y);
        mv = { x: tv.x * 0.15, y: tv.y * 0.15 }; // brace during telegraph
        if (this.windup <= 0) B.attack(this, ctx);
        break;
      }
      case 'strike':
        this.telegraph = Math.max(0, this.telegraph - dt * 3);
        this.strikeTimer -= dt;
        if (B.strikeMove) mv = B.strikeMove(this, ctx, dt);
        if (this.strikeTimer <= 0) { this.state = 'chase'; this.lockFacing = false; }
        break;
      case 'recover':
        this.telegraph = Math.max(0, this.telegraph - dt * 4);
        this.strikeTimer -= dt;
        mv = { x: 0, y: 0 };
        if (this.strikeTimer <= 0) this.state = 'chase';
        break;
      case 'stunned':
        this.telegraph = 0;
        this.strikeTimer -= dt;
        if (this.strikeTimer <= 0) this.state = 'chase';
        break;
      case 'vanish':
        // Assassin: intangible, then reappear behind the player and strike.
        this.vanishTimer -= dt;
        this.iframes = 0.1;
        if (this.vanishTimer <= 0) {
          const backA = p.facing + Math.PI + (Math.random() - 0.5) * 0.8;
          const b = ctx.bounds, pad = 60;
          this.x = Math.min(b.x + b.w - pad, Math.max(b.x + pad, p.x + Math.cos(backA) * 52));
          this.y = Math.min(b.y + b.h - pad, Math.max(b.y + pad, p.y + Math.sin(backA) * 52));
          this.facing = Math.atan2(p.y - this.y, p.x - this.x);
          if (ctx.onBlink) ctx.onBlink(this);
          this.startWindup();
        }
        break;
    }

    this.vx = mv.x * this.speed;
    this.vy = mv.y * this.speed;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.integrate(dt, ctx.bounds);
  }

  // True while a melee-type strike can connect this frame.
  get strikeActive() { return this.state === 'strike' && !this.hasStruck; }
  get invisible() { return this.state === 'vanish'; }
}
