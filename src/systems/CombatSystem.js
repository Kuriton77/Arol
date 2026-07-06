// Central combat resolver — the "game feel" hub. Handles melee arc hits,
// projectile collisions, enemy/boss contact damage, and every juice effect:
// crits, damage numbers, knockback, lifesteal, burn, chain lightning, thorns,
// hit-pause, camera shake, particles and SFX. Systems above stay decoupled by
// talking to this through a small context object.
import { inArc, inThrust, circlesOverlap, dist, clamp } from '../core/math.js';
import { CONFIG } from '../data/config.js';
import { derive } from './Stats.js';

export class CombatSystem {
  constructor(ctx) {
    this.ctx = ctx; // { player, getEnemies, getBoss, projectiles, particles, damageNumbers, camera, audio, bus, hitPause }
  }

  update(dt) {
    this._playerMelee();
    this._projectiles(dt);
    this._contactDamage();
  }

  _allTargets() {
    const c = this.ctx;
    const list = c.getEnemies();
    const boss = c.getBoss();
    return boss && boss.alive ? [...list, boss] : list;
  }

  // Apply a single melee/projectile hit to a target with full effect stack.
  dealDamage(target, baseDamage, srcX, srcY, opts = {}) {
    const c = this.ctx;
    const s = c.player.stats;
    const hpFrac = c.player.health / c.player.maxHealth;
    let dmg = baseDamage != null ? baseDamage : derive.damage(s, hpFrac);
    if (opts.mult) dmg *= opts.mult;
    // First-strike boons reward opening hits on untouched enemies.
    if (s.firstStrikePct > 0 && target.health >= target.maxHealth) dmg *= 1 + s.firstStrikePct;
    const crit = Math.random() < s.critChance;
    if (crit) {
      dmg *= s.critMult;
      if (s.bleedOnCrit > 0) target.addBurn(dmg * 0.1 * s.bleedOnCrit, 2.5);
    }
    dmg = Math.round(dmg);

    const applied = target.hurt(dmg);
    if (!applied) return false;

    // Knockback away from source.
    const kb = opts.knockback ?? derive.knockback(s);
    const dx = target.x - srcX, dy = target.y - srcY;
    const len = Math.hypot(dx, dy) || 1;
    target.applyKnockback(dx / len, dy / len, kb);

    // Feedback.
    c.damageNumbers.add(target.x, target.y - target.radius, dmg, { crit });
    c.particles.burst(target.x, target.y, target.accent || '#fff', crit ? 12 : 7,
      { dir: Math.atan2(dy, dx), spread: 1.6, speed: crit ? 240 : 170 });
    c.audio.play(crit ? 'crit' : 'enemyhit');
    c.camera.addShake(crit ? CONFIG.combat.shakeOnHit * 1.6 : CONFIG.combat.shakeOnHit);
    c.hitPause(crit ? CONFIG.combat.hitPause * 1.8 : CONFIG.combat.hitPause);

    // Lifesteal.
    if (s.lifesteal > 0) c.player.heal(dmg * s.lifesteal);
    // Burn (DoT).
    if (s.burn > 0 && !opts.noStatus) target.addBurn(dmg * 0.12 * s.burn, 2.0);
    // Chain lightning to a nearby other target.
    if (s.chain > 0 && !opts.noChain) this._chain(target, dmg * 0.5, s.chain);

    if (target.dead) c.onKilled(target);
    return true;
  }

  _chain(from, dmg, jumps) {
    const c = this.ctx;
    let last = from;
    const hitIds = new Set([from]);
    for (let j = 0; j < jumps; j++) {
      let best = null, bestD = 200 * 200;
      for (const e of this._allTargets()) {
        if (hitIds.has(e) || !e.alive) continue;
        const d2 = (e.x - last.x) ** 2 + (e.y - last.y) ** 2;
        if (d2 < bestD) { bestD = d2; best = e; }
      }
      if (!best) break;
      // Lightning arc particles.
      c.particles.burst((best.x + last.x) / 2, (best.y + last.y) / 2, '#8fe0ff', 6, { speed: 120 });
      const applied = best.hurt(Math.round(dmg));
      if (applied) {
        c.damageNumbers.add(best.x, best.y - best.radius, Math.round(dmg), { color: '#8fe0ff' });
        if (best.dead) c.onKilled(best);
      }
      hitIds.add(best);
      last = best;
      dmg *= 0.7;
    }
  }

  // Resolve the player's current attack step by its hit shape. All weapons run
  // through this one pipeline — arcs and thrusts scan targets, shot/bolt/nova
  // steps emit pooled projectiles; blade-boon projectiles ride along for all.
  _playerMelee() {
    const c = this.ctx;
    const p = c.player;
    if (!p.isSwingActive()) return;
    const s = p.stats;
    const step = p.currentStep || {};
    const shape = step.shape || 'arc';
    const stepMult = (step.dmg ?? 1) * (step.finisher ? s.finisherMult : 1);
    const range = derive.range(s) * (step.rangeMult ?? 1);
    const kb = derive.knockback(s) * (step.knockMult ?? 1);

    if (shape === 'arc' || shape === 'thrust') {
      const halfArc = (derive.arc(s) * (step.arcMult ?? 1)) / 2;
      const width = (p.weapon.base.width || 28) * (s.rangeMult > 1 ? 1 + (s.rangeMult - 1) * 0.5 : 1);
      for (const e of this._allTargets()) {
        if (!e.alive || p._hitThisSwing.has(e)) continue;
        const hit = shape === 'thrust'
          ? inThrust(p.x, p.y, p.swingDir, range, width, e.x, e.y, e.radius)
          : inArc(p.x, p.y, p.swingDir, halfArc, range, e.x, e.y, e.radius);
        if (hit) {
          p._hitThisSwing.add(e);
          this.dealDamage(e, null, p.x, p.y, { mult: stepMult, knockback: kb });
          if (step.shake) c.camera.addShake(step.shake);
        }
      }
    }

    // Once-per-swing projectile emissions (weapon shots + boon blades).
    if (!p._firedProjectile) {
      p._firedProjectile = true;
      const dmgBase = derive.damage(s, p.health / p.maxHealth);

      if (shape === 'shot' || shape === 'bolt') {
        let n = step.count ?? 1;
        if (step.volley) n += s.arrowExtra;
        const spreadA = step.spreadA ?? 0;
        const speed = p.weapon.base.projSpeed || 520;
        for (let i = 0; i < n; i++) {
          const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * spreadA * (n - 1);
          const a = p.swingDir + off;
          c.projectiles.spawn({
            x: p.x, y: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
            radius: shape === 'bolt' ? 8 : 6,
            damage: dmgBase * stepMult,
            hostile: false, color: p.weapon.vfx.color,
            life: 2.2, pierce: (step.pierce ?? 0) + s.arrowPierce, knockback: kb * 0.6,
          });
        }
        c.audio.play(p.weapon.sfx);
        if (step.shake) c.camera.addShake(step.shake);
      } else if (shape === 'nova') {
        const n = (step.count ?? 10) + s.novaExtra;
        const speed = p.weapon.base.projSpeed || 430;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + p.swingDir;
          c.projectiles.spawn({
            x: p.x, y: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
            radius: 8, damage: dmgBase * stepMult,
            hostile: false, color: p.weapon.vfx.color,
            life: 1.4, pierce: s.arrowPierce, knockback: kb * 0.6,
          });
        }
        c.particles.burst(p.x, p.y, p.weapon.vfx.color, 18, { speed: 260, life: 0.5 });
        c.audio.play(p.weapon.sfx);
        c.camera.addShake(step.shake || 3);
      }

      // Greatsword Shockwave boon: finisher launches a heavy wave.
      if (s.shockwave > 0 && step.finisher && (shape === 'arc' || shape === 'thrust')) {
        c.projectiles.spawn({
          x: p.x, y: p.y,
          vx: Math.cos(p.swingDir) * 340, vy: Math.sin(p.swingDir) * 340,
          radius: 16, damage: dmgBase * 0.8 * s.shockwave,
          hostile: false, color: '#ffd9c0', life: 0.8, pierce: 99, knockback: kb,
        });
        c.audio.play('shoot');
      }

      // Blade-projector boon rides along with every weapon.
      if (s.projectiles > 0) {
        const n = s.projectiles;
        const spread = s.projSpread;
        for (let i = 0; i < n; i++) {
          const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * n;
          const a = p.swingDir + off;
          c.projectiles.spawn({
            x: p.x, y: p.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520,
            radius: 8, damage: dmgBase * 0.6,
            hostile: false, color: '#ffe08a', life: 0.9, pierce: 1, knockback: 120,
          });
        }
        c.audio.play('shoot');
      }
    }
  }

  _projectiles(dt) {
    const c = this.ctx;
    const p = c.player;
    c.projectiles.forEach((pr) => {
      if (pr.hostile) {
        // Enemy/boss projectile vs player.
        if (p.iframes <= 0 && circlesOverlap(pr.x, pr.y, pr.radius, p.x, p.y, p.radius)) {
          this._damagePlayer(pr.damage, pr.x, pr.y, pr.knockback);
          pr.dead = true;
        }
      } else {
        // Player projectile vs enemies.
        for (const e of this._allTargets()) {
          if (!e.alive) continue;
          if (circlesOverlap(pr.x, pr.y, pr.radius, e.x, e.y, e.radius)) {
            this.dealDamage(e, pr.damage, pr.x, pr.y, { knockback: pr.knockback, noChain: true });
            if (pr.pierce > 0) { pr.pierce--; } else { pr.dead = true; break; }
          }
        }
      }
    });
  }

  _contactDamage() {
    const c = this.ctx;
    const p = c.player;

    for (const e of c.getEnemies()) {
      if (!e.alive) continue;
      // Melee/tank strike window.
      if (e.strikeActive && circlesOverlap(e.x, e.y, e.radius, p.x, p.y, p.radius)) {
        e.hasStruck = true;
        this._damagePlayer(e.damage, e.x, e.y, e.def.attack.knockback);
        this._thorns(e, p);
      }
    }

    const boss = c.getBoss();
    if (boss && boss.alive && p.iframes <= 0 &&
        circlesOverlap(boss.x, boss.y, boss.radius, p.x, p.y, p.radius)) {
      this._damagePlayer(boss.contactDamage, boss.x, boss.y, 380);
      this._thorns(boss, p);
    }
  }

  _thorns(attacker, p) {
    const s = p.stats;
    if (s.thorns > 0) {
      const refl = Math.round((attacker.damage || attacker.contactDamage || 10) * s.thorns);
      if (attacker.hurt(refl)) {
        this.ctx.damageNumbers.add(attacker.x, attacker.y - attacker.radius, refl, { color: '#ffa0a0' });
        if (attacker.dead) this.ctx.onKilled(attacker);
      }
    }
  }

  _damagePlayer(amount, srcX, srcY, knockback) {
    const c = this.ctx;
    const p = c.player;
    if (p.iframes > 0) return;
    // Colossus boon: damage reduction while mid-swing.
    if (p.stats.guardSwing && p.attackPhase !== 'idle') amount *= 0.75;
    const dmg = Math.round(amount);
    if (!p.hurt(dmg)) return;
    p.iframes = CONFIG.player.hurtIframes;
    const dx = p.x - srcX, dy = p.y - srcY;
    const len = Math.hypot(dx, dy) || 1;
    p.applyKnockback(dx / len, dy / len, knockback);
    c.damageNumbers.add(p.x, p.y - p.radius, dmg, { color: '#ff5a5a' });
    c.particles.burst(p.x, p.y, '#ff5a5a', 10, { speed: 200 });
    c.audio.play('hurt');
    c.camera.addShake(p.dead ? CONFIG.combat.shakeOnDeath : CONFIG.combat.shakeOnHurt);
    c.hitPause(CONFIG.combat.hitPause * 2);
    c.bus.emit('player:hurt', { dmg });
    if (p.dead) c.bus.emit('player:died');
  }
}
