// Data-driven in-run upgrades ("boons"). Each applies to the player's Stats.
// Upgrades stack; `weight` controls draw rarity; `stackable` allows repeats.
// `tags` feed the SynergySystem — combining tagged items unlocks synergies.
// Effects mutate a plain stats object so builds emerge naturally.

export const RARITY = {
  common:   { label: 'Common',   color: '#b8c0cc', weight: 100 },
  rare:     { label: 'Rare',     color: '#4aa8ff', weight: 45 },
  epic:     { label: 'Epic',     color: '#b45cff', weight: 18 },
  legendary:{ label: 'Legendary',color: '#ffb020', weight: 6 },
};

const HANDWRITTEN = [
  // ------------------------------------------------------------ core stats
  {
    id: 'power', name: 'Sharpened Blade', rarity: 'common', stackable: true,
    desc: '+20% damage',
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
    id: 'crit', name: 'Keen Eye', rarity: 'rare', stackable: true, tags: ['crit'],
    desc: '+12% critical chance',
    apply: (s) => { s.critChance += 0.12; },
  },
  {
    id: 'critdmg', name: 'Executioner', rarity: 'rare', stackable: true, tags: ['crit'],
    desc: '+60% critical damage',
    apply: (s) => { s.critMult += 0.6; },
  },
  {
    id: 'swift', name: 'Fleet Feet', rarity: 'common', stackable: true, tags: ['wind'],
    desc: '+12% move speed',
    apply: (s) => { s.speedMult += 0.12; },
  },
  {
    id: 'dashcd', name: 'Phantom Step', rarity: 'rare', stackable: true, tags: ['dash'],
    desc: '-20% dash cooldown',
    apply: (s) => { s.dashCdMult *= 0.8; },
  },
  {
    id: 'reach', name: 'Long Reach', rarity: 'common', stackable: true,
    desc: '+18% attack range & arc',
    apply: (s) => { s.rangeMult += 0.18; s.arcMult += 0.12; },
  },
  {
    id: 'knock', name: 'Heavy Hitter', rarity: 'common', stackable: true, tags: ['earth'],
    desc: '+50% knockback',
    apply: (s) => { s.knockbackMult += 0.5; },
  },
  // ------------------------------------------------------------- elemental
  {
    id: 'lifesteal', name: 'Vampiric Edge', rarity: 'epic', stackable: true, tags: ['blood'],
    desc: 'Heal 8% of damage dealt',
    apply: (s) => { s.lifesteal += 0.08; },
  },
  {
    id: 'burn', name: 'Ember Coating', rarity: 'epic', stackable: true, tags: ['fire'],
    desc: 'Hits apply Burn (damage over time)',
    apply: (s) => { s.burn += 1; },
  },
  {
    id: 'chain', name: 'Chain Lightning', rarity: 'epic', stackable: true, tags: ['lightning'],
    desc: 'Hits arc to a nearby enemy',
    apply: (s) => { s.chain += 1; },
  },
  {
    id: 'frost', name: 'Frostbite', rarity: 'epic', stackable: true, tags: ['ice'],
    desc: 'Hits Chill enemies, slowing them',
    apply: (s) => { s.chill += 1; },
  },
  {
    id: 'venom', name: 'Venom Coating', rarity: 'epic', stackable: true, tags: ['poison'],
    desc: 'Hits apply stacking Poison',
    apply: (s) => { s.poison += 1; },
  },
  {
    id: 'static', name: 'Static Charge', rarity: 'rare', stackable: true, tags: ['lightning'],
    desc: 'Hits zap a nearby enemy for 40%',
    apply: (s) => { s.static += 1; },
  },
  {
    id: 'immolate', name: 'Immolation', rarity: 'rare', stackable: true, tags: ['fire'],
    desc: '+1 Burn, +20% damage-over-time',
    apply: (s) => { s.burn += 1; s.dotAmp += 0.2; },
  },
  {
    id: 'cryo', name: 'Cryomancy', rarity: 'rare', stackable: true, tags: ['ice'],
    desc: 'Chills slow enemies 15% more',
    apply: (s) => { s.chill += 0.5; s.chillPower += 0.15; },
  },
  {
    id: 'plague', name: 'Plaguebearer', rarity: 'rare', stackable: true, tags: ['poison'],
    desc: '+1 Poison, +15% damage-over-time',
    apply: (s) => { s.poison += 1; s.dotAmp += 0.15; },
  },
  {
    id: 'spark', name: 'Sparkplug', rarity: 'rare', stackable: true, tags: ['lightning'],
    desc: 'Chain arcs jump +1 time',
    apply: (s) => { s.chain += 1; },
  },
  // -------------------------------------------------------------- defensive
  {
    id: 'thorns', name: 'Spiked Guard', rarity: 'rare', stackable: true, tags: ['earth'],
    desc: 'Reflect 40% of contact damage',
    apply: (s) => { s.thorns += 0.4; },
  },
  {
    id: 'bulwark', name: 'Bulwark', rarity: 'rare', stackable: true, tags: ['earth'],
    desc: 'Take 10% less damage',
    apply: (s) => { s.armor += 0.10; },
  },
  {
    id: 'evasion', name: 'Sixth Sense', rarity: 'rare', stackable: true, tags: ['wind'],
    desc: '10% chance to dodge any hit',
    apply: (s) => { s.dodge += 0.10; },
  },
  {
    id: 'regen', name: 'Troll Blood', rarity: 'rare', stackable: true, tags: ['holy'],
    desc: 'Regenerate 1 health per second',
    apply: (s) => { s.regen += 1; },
  },
  {
    id: 'ironhide', name: 'Ironhide', rarity: 'common', stackable: true, tags: ['earth'],
    desc: '+20 max health, take 5% less damage',
    apply: (s) => { s.maxHealthBonus += 20; s.armor += 0.05; },
  },
  {
    id: 'secondwind', name: 'Second Wind', rarity: 'legendary', stackable: false, tags: ['holy'],
    desc: 'Survive a lethal hit once per floor',
    apply: (s) => { s.secondWind = true; },
  },
  {
    id: 'mender', name: "Mender's Rite", rarity: 'common', stackable: true, tags: ['holy'],
    desc: 'Heal 15 when a room is cleared',
    apply: (s) => { s.roomHeal += 15; },
  },
  {
    id: 'juggernaut', name: 'Juggernaut', rarity: 'rare', stackable: true, tags: ['earth'],
    desc: '+35 max health, take 4% less damage',
    apply: (s) => { s.maxHealthBonus += 35; s.armor += 0.04; },
  },
  // --------------------------------------------------------------- offense+
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
    id: 'sharpshooter', name: 'Sharpshooter', rarity: 'rare', stackable: true,
    desc: '+30% projectile damage',
    apply: (s) => { s.projDamageMult += 0.3; },
  },
  {
    id: 'berserk', name: "Berserker's Fury", rarity: 'legendary', stackable: false, tags: ['blood'],
    desc: 'Deal more damage the lower your health',
    apply: (s) => { s.berserk = true; },
  },
  {
    id: 'glasscannon', name: 'Glass Cannon', rarity: 'legendary', stackable: false, tags: ['void'],
    desc: '+80% damage, -30 max health',
    apply: (s) => { s.damageMult += 0.8; s.maxHealthBonus -= 30; },
  },
  {
    id: 'culling', name: 'Culling Strike', rarity: 'epic', stackable: true, tags: ['void'],
    desc: 'Instantly kill enemies below 12% health',
    apply: (s) => { s.cull += 0.12; },
  },
  {
    id: 'frenzy', name: 'Battle Frenzy', rarity: 'rare', stackable: true, tags: ['blood'],
    desc: '+25% attack speed below half health',
    apply: (s) => { s.frenzy += 0.25; },
  },
  {
    id: 'fury', name: 'Bottled Fury', rarity: 'rare', stackable: true, tags: ['void'],
    desc: '+20% damage, take 10% more damage',
    apply: (s) => { s.damageMult += 0.2; s.fragile += 0.1; },
  },
  {
    id: 'hunter', name: "Hunter's Instinct", rarity: 'common', stackable: true,
    desc: '+20% damage to full-health enemies',
    apply: (s) => { s.firstStrikePct += 0.2; },
  },
  {
    id: 'brutality', name: 'Brutality', rarity: 'rare', stackable: true, tags: ['crit'],
    desc: '+30% crit damage, +20% knockback',
    apply: (s) => { s.critMult += 0.3; s.knockbackMult += 0.2; },
  },
  // --------------------------------------------------------------- mobility
  {
    id: 'adrenaline', name: 'Adrenaline', rarity: 'common', stackable: true, tags: ['wind'],
    desc: '+20% move speed for 2s after a kill',
    apply: (s) => { s.killSpeed += 0.2; },
  },
  {
    id: 'windrunner', name: 'Windrunner', rarity: 'rare', stackable: true, tags: ['wind'],
    desc: '+15% damage while moving',
    apply: (s) => { s.moveDamage += 0.15; },
  },
  {
    id: 'dashmaster', name: 'Dash Master', rarity: 'rare', stackable: true, tags: ['dash'],
    desc: '-25% dash cooldown',
    apply: (s) => { s.dashCdMult *= 0.75; },
  },
  {
    id: 'shadowstep', name: 'Shadowstep', rarity: 'epic', stackable: false, tags: ['dash', 'crit'],
    desc: 'First hit after dashing always crits',
    apply: (s) => { s.dashCrit = true; },
  },
  // ---------------------------------------------------------------- economy
  {
    id: 'scholar', name: 'Scholar', rarity: 'common', stackable: true,
    desc: '+30% experience gained',
    apply: (s) => { s.xpMult += 0.3; },
  },
  {
    id: 'goldfinger', name: 'Goldfinger', rarity: 'common', stackable: true, tags: ['gold'],
    desc: '+35% gold gained',
    apply: (s) => { s.greed += 0.35; },
  },
  {
    id: 'treasurer', name: 'Treasure Hunter', rarity: 'rare', stackable: true, tags: ['gold'],
    desc: '+15% gold & souls, +10% XP',
    apply: (s) => { s.greed += 0.15; s.xpMult += 0.1; },
  },
  {
    id: 'siphon', name: 'Soul Siphon', rarity: 'rare', stackable: true, tags: ['blood'],
    desc: 'Heal 4% of damage dealt',
    apply: (s) => { s.lifesteal += 0.04; },
  },
  {
    id: 'stonewall', name: 'Stonewall', rarity: 'common', stackable: true, tags: ['earth'],
    desc: '+15 max health, reflect 30% contact damage',
    apply: (s) => { s.maxHealthBonus += 15; s.thorns += 0.3; },
  },
  // -------------------------------------------------- P5 build-defining boons
  {
    id: 'pierce', name: 'Piercing Shots', rarity: 'rare', stackable: true,
    desc: 'Projectiles pierce +1 enemy',
    apply: (s) => { s.arrowPierce += 1; },
  },
  {
    id: 'ricochet', name: 'Ricochet', rarity: 'epic', stackable: true,
    desc: 'Projectiles bounce to +1 nearby enemy',
    apply: (s) => { s.ricochet += 1; },
  },
  {
    id: 'volatile', name: 'Volatile Rounds', rarity: 'epic', stackable: true, tags: ['fire'],
    desc: '+20% chance a hit triggers a small explosion',
    apply: (s) => { s.explodeChance += 0.20; },
  },
  {
    id: 'velocity', name: 'High Velocity', rarity: 'common', stackable: true,
    desc: '+30% projectile speed',
    apply: (s) => { s.projSpeedMult += 0.30; },
  },
  {
    id: 'biground', name: 'Heavy Rounds', rarity: 'common', stackable: true,
    desc: '+35% projectile size, +10% projectile damage',
    apply: (s) => { s.projSizeMult += 0.35; s.projDamageMult += 0.10; },
  },
  {
    id: 'cdr', name: 'Momentum Core', rarity: 'rare', stackable: true, tags: ['dash'],
    desc: '-18% dash cooldown',
    apply: (s) => { s.dashCdMult *= 0.82; },
  },
  {
    id: 'shield', name: 'Aegis Barrier', rarity: 'epic', stackable: true, tags: ['holy'],
    desc: '+30 regenerating shield (absorbs damage)',
    apply: (s) => { s.shieldMax += 30; },
  },
  {
    id: 'bulwark_shield', name: 'Bulwark Plating', rarity: 'rare', stackable: true, tags: ['earth'],
    desc: '+20 shield, take 6% less damage',
    apply: (s) => { s.shieldMax += 20; s.armor += 0.06; },
  },
  {
    id: 'luck', name: 'Lucky Charm', rarity: 'rare', stackable: true, tags: ['gold'],
    desc: 'Improves the odds of rarer boons & relics',
    apply: (s) => { s.luck += 1; },
  },
  {
    id: 'fortune_luck', name: "Fortune's Favor", rarity: 'epic', stackable: true, tags: ['gold'],
    desc: '+2 Luck, +15% gold',
    apply: (s) => { s.luck += 2; s.greed += 0.15; },
  },
];

// Tiered variants of the core stat boons — higher rarity, bigger numbers.
// Generated so the pool deepens without hand-maintaining near-duplicates.
const TIER_SOURCES = [
  { id: 'power', name: 'Blade', apply: (s, v) => { s.damageMult += v; }, base: 0.2, desc: (v) => `+${Math.round(v * 100)}% damage` },
  { id: 'haste', name: 'Tempo', apply: (s, v) => { s.attackSpeedMult += v; }, base: 0.15, desc: (v) => `+${Math.round(v * 100)}% attack speed` },
  { id: 'vigor', name: 'Heart', apply: (s, v) => { s.maxHealthBonus += v * 100; s.healOnPick = (s.healOnPick || 0) + v * 100; }, base: 0.25, desc: (v) => `+${Math.round(v * 100)} max health, heal ${Math.round(v * 100)}` },
  { id: 'swift', name: 'Stride', apply: (s, v) => { s.speedMult += v; }, base: 0.12, tags: ['wind'], desc: (v) => `+${Math.round(v * 100)}% move speed` },
  { id: 'crit2', name: 'Focus', apply: (s, v) => { s.critChance += v; }, base: 0.12, tags: ['crit'], desc: (v) => `+${Math.round(v * 100)}% critical chance` },
  { id: 'reach2', name: 'Span', apply: (s, v) => { s.rangeMult += v; s.arcMult += v * 0.7; }, base: 0.18, desc: (v) => `+${Math.round(v * 100)}% range & arc` },
  { id: 'knock2', name: 'Impact', apply: (s, v) => { s.knockbackMult += v; }, base: 0.5, tags: ['earth'], desc: (v) => `+${Math.round(v * 100)}% knockback` },
  { id: 'greed2', name: 'Fortune', apply: (s, v) => { s.greed += v; }, base: 0.35, tags: ['gold'], desc: (v) => `+${Math.round(v * 100)}% gold gained` },
];
const TIERS = [
  { suffix: 'II', prefix: 'Greater', rarity: 'rare', mult: 1.6 },
  { suffix: 'III', prefix: 'Superior', rarity: 'epic', mult: 2.4 },
];
const GENERATED = [];
for (const src of TIER_SOURCES) {
  for (const t of TIERS) {
    const v = src.base * t.mult;
    GENERATED.push({
      id: `${src.id}_${t.suffix}`,
      name: `${t.prefix} ${src.name}`,
      rarity: t.rarity,
      stackable: true,
      tags: src.tags,
      desc: src.desc(v),
      apply: (s) => src.apply(s, v),
    });
  }
}

export const UPGRADES = [...HANDWRITTEN, ...GENERATED];

// Weighted random draw of `n` distinct upgrades, honouring stackability.
// `sourcePool` lets callers mix in weapon-exclusive / relic pools.
// `bias` ({tag: multiplier}) skews draws — biomes favour their element.
// `luck` (>=0) boosts the odds of rarer picks (Lucky Charm boon).
export function drawUpgrades(rng, n, ownedCounts, sourcePool = UPGRADES, bias = null, luck = 0) {
  const pool = sourcePool.filter((u) => u.stackable || !(ownedCounts[u.id] > 0));
  // Luck raises rare/epic/legendary weights (commons implicitly get rarer).
  const LUCK_BOOST = { common: 0, rare: 0.15, epic: 0.28, legendary: 0.45 };
  const weightOf = (u) => {
    let w = RARITY[u.rarity].weight;
    if (luck > 0) w *= 1 + luck * (LUCK_BOOST[u.rarity] ?? 0);
    if (bias && u.tags) {
      for (const t of u.tags) if (bias[t]) w *= bias[t];
    }
    return w;
  };
  const picks = [];
  const available = [...pool];
  for (let i = 0; i < n && available.length; i++) {
    const total = available.reduce((sum, u) => sum + weightOf(u), 0);
    let roll = rng() * total;
    let idx = 0;
    for (; idx < available.length; idx++) {
      roll -= weightOf(available[idx]);
      if (roll <= 0) break;
    }
    idx = Math.min(idx, available.length - 1);
    picks.push(available[idx]);
    available.splice(idx, 1);
  }
  return picks;
}
