// Synergy system: combining tagged boons/relics unlocks named synergies with
// emergent effects. Passive synergies mutate stats once on activation; active
// synergies hook combat events (onHit/onCrit/onKill/onDash/onHurt/dashTick).
// The registry is data — adding a synergy is one entry.
import { dist, TAU } from '../core/math.js';

// needs: tag -> minimum count across owned boons + relics.
export const SYNERGIES = [
  {
    id: 'plasma', name: 'Plasma Burst', needs: { fire: 1, lightning: 1 },
    desc: 'Hits explode in a plasma blast',
    onHit(sys, target) {
      if (sys._cd('plasma', 0.8)) return;
      sys.aoe(target.x, target.y, 64, sys.playerDamage() * 0.5, '#c9a8ff', target);
    },
  },
  {
    id: 'frozen_trail', name: 'Frozen Trail', needs: { ice: 1, dash: 1 },
    desc: 'Dashing freezes enemies in your wake',
    dashTick(sys, dt) {
      const p = sys.game.player;
      for (const e of sys.targets()) {
        if (e.alive && dist(e.x, e.y, p.x, p.y) < 70) sys.chill(e, 1.8);
      }
    },
  },
  {
    id: 'venom_burst', name: 'Venom Burst', needs: { poison: 1, crit: 1 },
    desc: 'Crits detonate in a toxic blast',
    onCrit(sys, target) {
      if (sys._cd('venom_burst', 0.6)) return;
      sys.aoe(target.x, target.y, 56, sys.playerDamage() * 0.45, '#8fe0a8', target);
    },
  },
  {
    id: 'blood_knight', name: 'Blood Knight', needs: { blood: 2 },
    desc: 'Lifesteal is 50% stronger',
    apply(s) { s.lifesteal *= 1.5; },
  },
  {
    id: 'infinite_chain', name: 'Infinite Chain', needs: { lightning: 2 },
    desc: 'Chain arcs jump +2 more times',
    apply(s) { s.chain += 2; },
  },
  {
    id: 'toxic_flames', name: 'Toxic Flames', needs: { fire: 1, poison: 1 },
    desc: 'Damage-over-time is 50% stronger',
    apply(s) { s.dotAmp += 0.5; },
  },
  {
    id: 'permafrost', name: 'Permafrost', needs: { ice: 2 },
    desc: 'Chills briefly freeze enemies solid',
    onChill(sys, target) {
      if (target.state !== 'stunned' && !target.isBossEntity) {
        target.state = 'stunned'; target.strikeTimer = Math.max(target.strikeTimer, 0.45);
        target.lockFacing = false;
      }
    },
  },
  {
    id: 'static_field', name: 'Static Field', needs: { lightning: 1, dash: 1 },
    desc: 'Dashing zaps nearby enemies',
    onDash(sys) {
      const p = sys.game.player;
      for (const e of sys.targets()) {
        if (e.alive && dist(e.x, e.y, p.x, p.y) < 140) {
          sys.zap(e, sys.playerDamage() * 0.3);
        }
      }
    },
  },
  {
    id: 'golden_touch', name: 'Golden Touch', needs: { gold: 1, crit: 1 },
    desc: 'Critical hits earn gold',
    onCrit(sys) {
      if (sys._cd('golden_touch', 0.35)) return;
      sys.game.player.gold += 1;
    },
  },
  {
    id: 'wildfire', name: 'Wildfire', needs: { fire: 2 },
    desc: 'Kills spread Burn to nearby enemies',
    onKill(sys, target) {
      for (const e of sys.targets()) {
        if (e.alive && dist(e.x, e.y, target.x, target.y) < 110) {
          e.addBurn(sys.playerDamage() * 0.1, 2.5);
        }
      }
      sys.game.particles.burst(target.x, target.y, '#ff9a5a', 10, { speed: 200, life: 0.4 });
    },
  },
  {
    id: 'phoenix', name: 'Phoenix Soul', needs: { fire: 1, holy: 1 },
    desc: 'Second Wind, and reviving detonates',
    apply(s) { s.secondWind = true; },
    onSecondWind(sys) {
      const p = sys.game.player;
      sys.aoe(p.x, p.y, 150, sys.playerDamage() * 2, '#ffb347');
    },
  },
  {
    id: 'assassins_mark', name: "Assassin's Mark", needs: { crit: 1, dash: 1 },
    desc: 'First hit after dashing always crits',
    apply(s) { s.dashCrit = true; },
  },
  {
    id: 'glacier_armor', name: 'Glacier Armor', needs: { ice: 1, earth: 1 },
    desc: 'Taking a hit chills nearby attackers',
    onHurt(sys) {
      const p = sys.game.player;
      for (const e of sys.targets()) {
        if (e.alive && dist(e.x, e.y, p.x, p.y) < 130) sys.chill(e, 2.0);
      }
    },
  },
  {
    id: 'executioners_seal', name: "Executioner's Seal", needs: { void: 1, blood: 1 },
    desc: 'Execute below +8%; executions heal 5',
    apply(s) { s.cull += 0.08; },
    onCull(sys) { sys.game.player.heal(5); },
  },
  {
    id: 'storm_surge', name: 'Storm Surge', needs: { lightning: 1, wind: 1 },
    desc: '+15% attack & move speed',
    apply(s) { s.attackSpeedMult += 0.15; s.speedMult += 0.15; },
  },
  {
    id: 'leech_swarm', name: 'Leech Swarm', needs: { poison: 1, blood: 1 },
    desc: 'Stronger DoT, +3% lifesteal',
    apply(s) { s.dotAmp += 0.25; s.lifesteal += 0.03; },
  },
];

export class SynergySystem {
  constructor(game) {
    this.game = game;
    this.active = new Set();
    this._cds = {};
  }

  reset() { this.active.clear(); this._cds = {}; }

  // Recheck tag counts; returns newly-activated synergy defs.
  recheck(tagCounts) {
    const fresh = [];
    for (const syn of SYNERGIES) {
      if (this.active.has(syn.id)) continue;
      const met = Object.entries(syn.needs).every(([tag, n]) => (tagCounts[tag] || 0) >= n);
      if (met) {
        this.active.add(syn.id);
        if (syn.apply) { syn.apply(this.game.player.stats); this.game.player.refreshMaxHealth(); }
        fresh.push(syn);
      }
    }
    return fresh;
  }

  activeList() { return SYNERGIES.filter((s) => this.active.has(s.id)); }

  // ---- event dispatch (called from CombatSystem / Game) ----
  onHit(target, dmg, crit) {
    for (const syn of this.activeList()) {
      if (syn.onHit) syn.onHit(this, target, dmg);
      if (crit && syn.onCrit) syn.onCrit(this, target, dmg);
    }
  }
  onKill(target) { for (const syn of this.activeList()) if (syn.onKill) syn.onKill(this, target); }
  onDash() { for (const syn of this.activeList()) if (syn.onDash) syn.onDash(this); }
  dashTick(dt) { for (const syn of this.activeList()) if (syn.dashTick) syn.dashTick(this, dt); }
  onHurt() { for (const syn of this.activeList()) if (syn.onHurt) syn.onHurt(this); }
  onChillApplied(target) { for (const syn of this.activeList()) if (syn.onChill) syn.onChill(this, target); }
  onCull(target) { for (const syn of this.activeList()) if (syn.onCull) syn.onCull(this, target); }
  onSecondWind() { for (const syn of this.activeList()) if (syn.onSecondWind) syn.onSecondWind(this); }

  // ---- shared helpers for synergy effects ----
  _cd(id, t) {
    const now = this.game.time;
    if ((this._cds[id] || 0) > now) return true;
    this._cds[id] = now + t;
    return false;
  }
  targets() {
    const g = this.game;
    return g.boss && g.boss.alive ? [...g.enemies, g.boss] : g.enemies;
  }
  playerDamage() {
    const p = this.game.player;
    return p.stats.baseDamage * p.stats.damageMult;
  }
  // Enemy-only AoE (no self-damage) with FX.
  aoe(x, y, radius, dmg, color, exclude = null) {
    const g = this.game;
    g.particles.burst(x, y, color, 14, { speed: 240, life: 0.4 });
    g.camera.addShake(3);
    for (const e of this.targets()) {
      if (!e.alive || e === exclude) continue;
      if (dist(e.x, e.y, x, y) < radius + e.radius) {
        const applied = e.hurt(Math.round(dmg));
        if (applied) {
          g.damageNumbers.add(e.x, e.y - e.radius, Math.round(dmg), { color });
          if (e.dead) g.combat.ctx.onKilled(e);
        }
      }
    }
  }
  chill(e, duration) {
    if (e.chillT > 0.2) return; // don't spam the synergy hook
    e.chillT = duration;
    this.game.particles.burst(e.x, e.y, '#bfe8ff', 4, { speed: 80, life: 0.4 });
    this.onChillApplied(e);
  }
  zap(e, dmg) {
    const g = this.game;
    const applied = e.hurt(Math.round(dmg));
    g.particles.burst(e.x, e.y, '#8fe0ff', 6, { speed: 160, life: 0.3 });
    if (applied) {
      g.damageNumbers.add(e.x, e.y - e.radius, Math.round(dmg), { color: '#8fe0ff' });
      if (e.dead) g.combat.ctx.onKilled(e);
    }
  }
}
