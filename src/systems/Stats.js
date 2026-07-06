// Aggregates all modifiers (weapon base + meta upgrades + in-run boons/relics)
// into a single mutable stats object. Systems read derived getters so tuning
// stays central. Weapon-specific accumulators default to 0/false so any weapon
// can safely share the pool.
import { CONFIG } from '../data/config.js';

export function createStats(weapon) {
  const w = weapon.base;
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
    // element / status accumulators (relics & elemental boons)
    chill: 0,
    chillPower: 0,
    poison: 0,
    static: 0,
    dotAmp: 0,
    // defense & utility
    armor: 0,
    dodge: 0,
    regen: 0,
    fragile: 0,
    cull: 0,
    secondWind: false,
    secondWindUsed: false,
    roomHeal: 0,
    healOnKill: 0,
    // offense & mobility
    moveDamage: 0,
    frenzy: 0,
    killSpeed: 0,
    killSpeedT: 0,
    dashCrit: false,
    projDamageMult: 1,
    // economy
    xpMult: 0,
    shopDiscount: 0,
    // weapon-framework accumulators (weapon-exclusive boons write these)
    comboWindowMult: 1,
    finisherMult: 1,
    dashBuffPct: 0,       // +damage% granted for a short window after dashing
    firstStrikePct: 0,    // +damage% vs full-health targets
    bleedOnCrit: 0,
    guardSwing: false,    // damage reduction while mid-swing
    shockwave: 0,         // greatsword finisher wave
    arrowExtra: 0,        // extra volley arrows
    arrowPierce: 0,
    novaExtra: 0,
    surgeOnKill: false,   // temp attack speed on kill
    // timers ticked by Player.update
    dashBuffT: 0,
    surgeT: 0,
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
  moveSpeed: (s) => CONFIG.player.speed * s.speedMult
    * (s.killSpeedT > 0 && s.killSpeed > 0 ? 1 + s.killSpeed : 1),
  attackCooldown: (s, hpFrac = 1) =>
    s.baseCooldown / (s.attackSpeedMult
      * (s.surgeT > 0 ? 1.3 : 1)
      * (s.frenzy > 0 && hpFrac < 0.5 ? 1 + s.frenzy : 1)),
  range: (s) => s.baseRange * s.rangeMult,
  arc: (s) => Math.min(Math.PI * 1.4, s.baseArc * s.arcMult),
  knockback: (s) => s.baseKnockback * s.knockbackMult,
  dashCooldown: (s) => CONFIG.player.dash.cooldown * s.dashCdMult,
  // Berserk scales damage from +0% (full hp) up to +80% (near death);
  // dash buff (Riposte-style boons) adds while its timer runs.
  damage: (s, hpFrac = 1) => {
    let d = s.baseDamage * s.damageMult;
    if (s.berserk) d *= 1 + 0.8 * (1 - hpFrac);
    if (s.dashBuffT > 0 && s.dashBuffPct > 0) d *= 1 + s.dashBuffPct;
    return d;
  },
};
