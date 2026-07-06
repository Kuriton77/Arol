// Modular weapon framework — every weapon is pure data resolved by the shared
// combat pipeline (Player attack state machine + CombatSystem hit shapes).
//
// Weapon anatomy:
//   base   : balancing values fed into Stats (damage, cooldown, range, ...)
//   combo  : chain of attack steps; consecutive attacks inside comboWindow
//            advance the chain. Each step may override timing, damage mult,
//            hit shape, self-lunge, and projectile emission.
//   shapes : 'arc' (swing), 'thrust' (line stab), 'shot' (arrow projectile),
//            'bolt' (piercing magic), 'nova' (radial burst)
//   moveMod: movement speed multipliers per attack phase (weapon weight).
//   upgrades: weapon-exclusive boons mixed into the draw pool when equipped.

export const WEAPONS = [
  {
    id: 'sword', name: 'Iron Sword', cost: 0, class: 'slash',
    desc: 'Balanced all-rounder.',
    base: { damage: 18, cooldown: 0.34, range: 58, arc: 0.85, knockback: 260, critBonus: 0 },
    moveMod: { windup: 0.7, active: 0.55 },
    comboWindow: 0.9,
    vfx: { color: '#dff0ff' },
    sfx: 'swing',
    combo: [
      { dmg: 1.0, cd: 1.0 },
      { dmg: 1.1, cd: 0.9, reversed: true },
      { dmg: 1.55, cd: 1.5, arcMult: 1.3, knockMult: 1.6, finisher: true, shake: 2 },
    ],
    upgrades: [
      { id: 'w_riposte', name: 'Riposte', rarity: 'rare', stackable: true, weapon: 'sword',
        desc: '+35% damage for 2s after dashing',
        apply: (s) => { s.dashBuffPct += 0.35; } },
      { id: 'w_sweep', name: 'Sweeping Arc', rarity: 'common', stackable: true, weapon: 'sword',
        desc: '+20% range and arc',
        apply: (s) => { s.rangeMult += 0.2; s.arcMult += 0.2; } },
      { id: 'w_form', name: 'Perfect Form', rarity: 'epic', stackable: true, weapon: 'sword',
        desc: 'Combo finisher deals +45% damage',
        apply: (s) => { s.finisherMult += 0.45; } },
    ],
  },
  {
    id: 'greatsword', name: 'Greatsword', cost: 90, class: 'slash',
    desc: 'Slow. Huge arc & knockback.',
    base: { damage: 36, cooldown: 0.6, range: 74, arc: 1.25, knockback: 460, critBonus: 0 },
    moveMod: { windup: 0.45, active: 0.35 },
    comboWindow: 1.2,
    vfx: { color: '#ffd9c0' },
    sfx: 'swing',
    combo: [
      { dmg: 1.0, cd: 1.0, windup: 0.14 },
      { dmg: 1.2, cd: 1.1, windup: 0.12, reversed: true },
      { dmg: 1.8, cd: 1.7, windup: 0.2, arcMult: 1.7, knockMult: 1.5, finisher: true, shake: 4 },
    ],
    upgrades: [
      { id: 'w_shockwave', name: 'Shockwave', rarity: 'epic', stackable: true, weapon: 'greatsword',
        desc: 'Finisher releases a shockwave projectile',
        apply: (s) => { s.shockwave += 1; } },
      { id: 'w_colossus', name: 'Colossus', rarity: 'rare', stackable: false, weapon: 'greatsword',
        desc: 'Take 25% less damage while swinging',
        apply: (s) => { s.guardSwing = true; } },
      { id: 'w_momentum', name: 'Momentum', rarity: 'common', stackable: true, weapon: 'greatsword',
        desc: '+15% damage, +40% knockback',
        apply: (s) => { s.damageMult += 0.15; s.knockbackMult += 0.4; } },
    ],
  },
  {
    id: 'dagger', name: 'Twin Daggers', cost: 60, class: 'slash',
    desc: 'Fast. Short reach. Crits.',
    base: { damage: 11, cooldown: 0.19, range: 46, arc: 0.7, knockback: 150, critBonus: 0.08 },
    moveMod: { windup: 0.9, active: 0.8 },
    comboWindow: 0.7,
    vfx: { color: '#c8ffe8' },
    sfx: 'swing',
    combo: [
      { dmg: 0.85, cd: 1.0 },
      { dmg: 0.85, cd: 0.95, reversed: true },
      { dmg: 0.9, cd: 0.9 },
      { dmg: 1.7, cd: 1.4, arcMult: 1.2, finisher: true, shake: 1 },
    ],
    upgrades: [
      { id: 'w_flurry', name: 'Flurry Master', rarity: 'common', stackable: true, weapon: 'dagger',
        desc: '+12% attack speed, longer combo window',
        apply: (s) => { s.attackSpeedMult += 0.12; s.comboWindowMult += 0.3; } },
      { id: 'w_serrated', name: 'Serrated Edge', rarity: 'rare', stackable: true, weapon: 'dagger',
        desc: 'Critical hits cause Bleed',
        apply: (s) => { s.bleedOnCrit += 1; } },
      { id: 'w_shadow', name: 'Shadow Dance', rarity: 'epic', stackable: true, weapon: 'dagger',
        desc: '+8% crit, +25% damage for 2s after dashing',
        apply: (s) => { s.critChance += 0.08; s.dashBuffPct += 0.25; } },
    ],
  },
  {
    id: 'spear', name: 'Serpent Spear', cost: 45, class: 'thrust',
    desc: 'Long reach. Narrow. Lunges.',
    base: { damage: 21, cooldown: 0.42, range: 96, arc: 0.4, knockback: 230, critBonus: 0.03, width: 30 },
    moveMod: { windup: 0.65, active: 0.5 },
    comboWindow: 1.0,
    vfx: { color: '#c9f0a8' },
    sfx: 'thrust',
    combo: [
      { dmg: 1.0, cd: 1.0, shape: 'thrust' },
      { dmg: 1.1, cd: 0.9, shape: 'thrust' },
      { dmg: 1.6, cd: 1.5, shape: 'thrust', rangeMult: 1.3, lunge: 380, knockMult: 1.4, finisher: true, shake: 2 },
    ],
    upgrades: [
      { id: 'w_reach', name: 'Serpent Reach', rarity: 'common', stackable: true, weapon: 'spear',
        desc: '+25% thrust range',
        apply: (s) => { s.rangeMult += 0.25; } },
      { id: 'w_impale', name: 'Impale', rarity: 'epic', stackable: true, weapon: 'spear',
        desc: 'Lunge finisher deals +60% damage',
        apply: (s) => { s.finisherMult += 0.6; } },
      { id: 'w_phalanx', name: 'First Strike', rarity: 'rare', stackable: true, weapon: 'spear',
        desc: '+40% damage to full-health enemies',
        apply: (s) => { s.firstStrikePct += 0.4; } },
    ],
  },
  {
    id: 'bow', name: 'Ashen Bow', cost: 75, class: 'shot',
    desc: 'Ranged. Slow draw. Deadly.',
    base: { damage: 20, cooldown: 0.55, range: 999, arc: 0.3, knockback: 140, critBonus: 0.06, projSpeed: 640 },
    moveMod: { windup: 0.4, active: 0.75 },
    comboWindow: 1.1,
    vfx: { color: '#e8e0a8' },
    sfx: 'bow',
    combo: [
      { dmg: 1.0, cd: 1.0, shape: 'shot', count: 1, windup: 0.16 },
      { dmg: 1.05, cd: 0.9, shape: 'shot', count: 1, windup: 0.14 },
      { dmg: 0.8, cd: 1.5, shape: 'shot', count: 3, spreadA: 0.24, volley: true, finisher: true, windup: 0.24 },
    ],
    upgrades: [
      { id: 'w_broadhead', name: 'Broadheads', rarity: 'common', stackable: true, weapon: 'bow',
        desc: '+25% arrow damage',
        apply: (s) => { s.damageMult += 0.25; } },
      { id: 'w_splitnock', name: 'Split Nock', rarity: 'epic', stackable: true, weapon: 'bow',
        desc: 'Volley fires +1 arrow',
        apply: (s) => { s.arrowExtra += 1; } },
      { id: 'w_hawkeye', name: 'Hawkeye', rarity: 'rare', stackable: true, weapon: 'bow',
        desc: '+10% crit, arrows pierce +1 enemy',
        apply: (s) => { s.critChance += 0.10; s.arrowPierce += 1; } },
    ],
  },
  {
    id: 'staff', name: 'Void Staff', cost: 110, class: 'bolt',
    desc: 'Piercing bolts. Nova finisher.',
    base: { damage: 16, cooldown: 0.4, range: 999, arc: 0.3, knockback: 170, critBonus: 0, projSpeed: 430 },
    moveMod: { windup: 0.55, active: 0.7 },
    comboWindow: 1.2,
    vfx: { color: '#c9a8ff' },
    sfx: 'bolt',
    combo: [
      { dmg: 1.0, cd: 1.0, shape: 'bolt', count: 1, pierce: 1, windup: 0.12 },
      { dmg: 1.1, cd: 0.95, shape: 'bolt', count: 1, pierce: 1, windup: 0.12 },
      { dmg: 0.7, cd: 1.6, shape: 'nova', count: 10, pierce: 0, finisher: true, windup: 0.22, shake: 3 },
    ],
    upgrades: [
      { id: 'w_focus', name: 'Focused Mind', rarity: 'common', stackable: true, weapon: 'staff',
        desc: 'Bolts pierce +1 enemy',
        apply: (s) => { s.arrowPierce += 1; } },
      { id: 'w_overload', name: 'Overload', rarity: 'epic', stackable: true, weapon: 'staff',
        desc: 'Nova releases +4 bolts',
        apply: (s) => { s.novaExtra += 4; } },
      { id: 'w_resonance', name: 'Resonance', rarity: 'rare', stackable: false, weapon: 'staff',
        desc: 'Kills grant +30% attack speed for 3s',
        apply: (s) => { s.surgeOnKill = true; } },
    ],
  },
];

export function weaponById(id) {
  return WEAPONS.find((w) => w.id === id) || WEAPONS[0];
}
