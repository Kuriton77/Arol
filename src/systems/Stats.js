// Aggregates all modifiers (weapon base + meta upgrades + in-run boons) into a
// single mutable stats object. Systems read derived getters so tuning is central.
import { CONFIG } from '../data/config.js';

export function createStats(weapon) {
  const w = weapon.stats;
  return {
    // multiplicative / additive accumulators mutated by upgrades
    damageMult: 1,
    attackSpeedMult: 1,
    speedMult: 1,
    rangeMult: 1,
    arcMult: 1,
    knockbackMult: 1,
    dashCdMult: 1,
    critChance: CONFIG.player.baseCrit + (w.critBonus || 0),
    critMult: CONFIG.player.critMult,
    maxHealthBonus: 0,
    lifesteal: 0,
    burn: 0,
    chain: 0,
    thorns: 0,
    projectiles: 0,
    projSpread: 0.12,
    berserk: false,
    greed: 0,
    healOnPick: 0,
    // weapon base values
    baseDamage: w.damage,
    baseCooldown: w.cooldown,
    baseRange: w.range,
    baseArc: w.arc,
    baseKnockback: w.knockback,
    weaponId: weapon.id,
  };
}

// Derived, read-only accessors. Kept as functions to reflect live modifier state.
export const derive = {
  maxHealth: (s) => Math.max(20, CONFIG.player.maxHealth + s.maxHealthBonus),
  moveSpeed: (s) => CONFIG.player.speed * s.speedMult,
  attackCooldown: (s) => s.baseCooldown / s.attackSpeedMult,
  range: (s) => s.baseRange * s.rangeMult,
  arc: (s) => Math.min(Math.PI * 1.4, s.baseArc * s.arcMult),
  knockback: (s) => s.baseKnockback * s.knockbackMult,
  dashCooldown: (s) => CONFIG.player.dash.cooldown * s.dashCdMult,
  // Berserk scales damage from +0% (full hp) up to +80% (near death).
  damage: (s, hpFrac = 1) => {
    let d = s.baseDamage * s.damageMult;
    if (s.berserk) d *= 1 + 0.8 * (1 - hpFrac);
    return d;
  },
};
