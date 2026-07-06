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

// Weapon definitions moved to weapons.js (full modular weapon framework).
