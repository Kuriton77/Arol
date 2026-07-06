// Data-driven in-run upgrades ("boons"). Each applies to the player's Stats.
// Upgrades stack; `weight` controls draw rarity; `stackable` allows repeats.
// Effects mutate a plain stats object so synergies emerge naturally.

export const RARITY = {
  common:   { label: 'Common',   color: '#b8c0cc', weight: 100 },
  rare:     { label: 'Rare',     color: '#4aa8ff', weight: 45 },
  epic:     { label: 'Epic',     color: '#b45cff', weight: 18 },
  legendary:{ label: 'Legendary',color: '#ffb020', weight: 6 },
};

export const UPGRADES = [
  {
    id: 'power', name: 'Sharpened Blade', rarity: 'common', stackable: true,
    desc: '+20% melee damage',
    apply: (s) => { s.damageMult += 0.20; },
  },
  {
    id: 'haste', name: 'Quickened Strikes', rarity: 'common', stackable: true,
    desc: '+15% attack speed',
    apply: (s) => { s.attackSpeedMult += 0.15; },
  },
  {
    id: 'vigor', name: 'Vigor', rarity: 'common', stackable: true,
    desc: '+25 max health, heal 25',
    apply: (s) => { s.maxHealthBonus += 25; s.healOnPick = (s.healOnPick || 0) + 25; },
  },
  {
    id: 'crit', name: 'Keen Eye', rarity: 'rare', stackable: true,
    desc: '+12% critical chance',
    apply: (s) => { s.critChance += 0.12; },
  },
  {
    id: 'critdmg', name: 'Executioner', rarity: 'rare', stackable: true,
    desc: '+60% critical damage',
    apply: (s) => { s.critMult += 0.6; },
  },
  {
    id: 'swift', name: 'Fleet Feet', rarity: 'common', stackable: true,
    desc: '+12% move speed',
    apply: (s) => { s.speedMult += 0.12; },
  },
  {
    id: 'dashcd', name: 'Phantom Step', rarity: 'rare', stackable: true,
    desc: '-20% dash cooldown',
    apply: (s) => { s.dashCdMult *= 0.8; },
  },
  {
    id: 'reach', name: 'Long Reach', rarity: 'common', stackable: true,
    desc: '+18% attack range & arc',
    apply: (s) => { s.rangeMult += 0.18; s.arcMult += 0.12; },
  },
  {
    id: 'knock', name: 'Heavy Hitter', rarity: 'common', stackable: true,
    desc: '+50% knockback',
    apply: (s) => { s.knockbackMult += 0.5; },
  },
  {
    id: 'lifesteal', name: 'Vampiric Edge', rarity: 'epic', stackable: true,
    desc: 'Heal 8% of melee damage dealt',
    apply: (s) => { s.lifesteal += 0.08; },
  },
  {
    id: 'burn', name: 'Ember Coating', rarity: 'epic', stackable: true,
    desc: 'Hits apply Burn (damage over time)',
    apply: (s) => { s.burn += 1; },
  },
  {
    id: 'chain', name: 'Chain Lightning', rarity: 'epic', stackable: true,
    desc: 'Hits arc to a nearby enemy',
    apply: (s) => { s.chain += 1; },
  },
  {
    id: 'thorns', name: 'Spiked Guard', rarity: 'rare', stackable: true,
    desc: 'Reflect 40% of contact damage',
    apply: (s) => { s.thorns += 0.4; },
  },
  {
    id: 'projectile', name: 'Blade Projector', rarity: 'epic', stackable: true,
    desc: 'Swings fire a blade projectile',
    apply: (s) => { s.projectiles += 1; },
  },
  {
    id: 'multishot', name: 'Splinter Volley', rarity: 'legendary', stackable: true,
    desc: '+2 projectiles per swing',
    apply: (s) => { s.projectiles += 2; s.projSpread += 0.25; },
  },
  {
    id: 'berserk', name: "Berserker's Fury", rarity: 'legendary', stackable: false,
    desc: 'Deal more damage the lower your health',
    apply: (s) => { s.berserk = true; },
  },
  {
    id: 'glasscannon', name: 'Glass Cannon', rarity: 'legendary', stackable: false,
    desc: '+80% damage, -30 max health',
    apply: (s) => { s.damageMult += 0.8; s.maxHealthBonus -= 30; },
  },
];

// Weighted random draw of `n` distinct upgrades, honouring stackability.
export function drawUpgrades(rng, n, ownedCounts) {
  const pool = UPGRADES.filter((u) => u.stackable || !(ownedCounts[u.id] > 0));
  const picks = [];
  const available = [...pool];
  for (let i = 0; i < n && available.length; i++) {
    const total = available.reduce((sum, u) => sum + RARITY[u.rarity].weight, 0);
    let roll = rng() * total;
    let idx = 0;
    for (; idx < available.length; idx++) {
      roll -= RARITY[available[idx].rarity].weight;
      if (roll <= 0) break;
    }
    idx = Math.min(idx, available.length - 1);
    picks.push(available[idx]);
    available.splice(idx, 1);
  }
  return picks;
}
