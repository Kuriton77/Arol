// Meta-progression: permanent upgrades and weapon unlocks bought with Souls
// (currency that persists between runs via SaveSystem). Applied at run start.
export const META_UPGRADES = [
  {
    id: 'm_health', name: 'Fortitude', maxLevel: 5, baseCost: 20, costGrowth: 1.6,
    desc: (lvl) => `+${lvl * 15} starting max health`,
    apply: (s, lvl) => { s.maxHealthBonus += lvl * 15; },
  },
  {
    id: 'm_damage', name: 'Might', maxLevel: 5, baseCost: 25, costGrowth: 1.6,
    desc: (lvl) => `+${lvl * 8}% base damage`,
    apply: (s, lvl) => { s.damageMult += lvl * 0.08; },
  },
  {
    id: 'm_dash', name: 'Agility', maxLevel: 3, baseCost: 30, costGrowth: 1.8,
    desc: (lvl) => `-${lvl * 8}% dash cooldown`,
    apply: (s, lvl) => { s.dashCdMult *= (1 - lvl * 0.08); },
  },
  {
    id: 'm_crit', name: 'Precision', maxLevel: 3, baseCost: 35, costGrowth: 1.8,
    desc: (lvl) => `+${lvl * 4}% base crit chance`,
    apply: (s, lvl) => { s.critChance += lvl * 0.04; },
  },
  {
    id: 'm_greed', name: 'Greed', maxLevel: 3, baseCost: 25, costGrowth: 1.7,
    desc: (lvl) => `+${lvl * 20}% soul & gold gain`,
    apply: (s, lvl) => { s.greed = (s.greed || 0) + lvl * 0.20; },
  },
];

// Unlockable starting weapons. The first is free/default; others cost Souls once.
export const WEAPONS = [
  {
    id: 'sword', name: 'Iron Sword', cost: 0, unlockedByDefault: true,
    desc: 'Balanced all-rounder.',
    stats: { damage: 18, cooldown: 0.34, range: 58, arc: 0.85, knockback: 260 },
  },
  {
    id: 'dagger', name: 'Twin Daggers', cost: 60,
    desc: 'Fast. Short reach. Crits.',
    stats: { damage: 11, cooldown: 0.19, range: 46, arc: 0.7, knockback: 150, critBonus: 0.08 },
  },
  {
    id: 'greatsword', name: 'Greatsword', cost: 90,
    desc: 'Slow. Huge arc & knockback.',
    stats: { damage: 36, cooldown: 0.6, range: 74, arc: 1.25, knockback: 460 },
  },
];
