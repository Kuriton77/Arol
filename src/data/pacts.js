// Pact of Punishment-style difficulty modifiers. Each pact has ranks; every
// rank adds Heat. Heat multiplies soul income (+12% per point) and win
// milestones pay one-time bonuses. Ranks persist in the save and apply at
// run start via pactMods().

export const PACTS = [
  {
    id: 'swiftness', name: 'Pact of Swiftness', heatPerRank: 1,
    ranks: ['Enemies move 12% faster', 'Enemies move 25% faster'],
  },
  {
    id: 'legion', name: 'Pact of the Legion', heatPerRank: 1,
    ranks: ['25% more enemies', '50% more enemies'],
  },
  {
    id: 'elites', name: 'Pact of Champions', heatPerRank: 1,
    ranks: ['15% of enemies are elite', '35% of enemies are elite'],
  },
  {
    id: 'tyranny', name: 'Pact of Tyranny', heatPerRank: 1,
    ranks: ['Bosses +20% health & damage', 'Bosses +40% health & damage'],
  },
  {
    id: 'scarcity', name: 'Pact of Scarcity', heatPerRank: 1,
    ranks: ['Healing halved', 'Healing reduced 75%'],
  },
  {
    id: 'barrage', name: 'Pact of the Barrage', heatPerRank: 1,
    ranks: ['Enemy projectiles 20% faster', 'Enemy projectiles 40% faster'],
  },
  {
    id: 'frailty', name: 'Pact of Frailty', heatPerRank: 1,
    ranks: ['-15 max health', '-30 max health'],
  },
  {
    id: 'darkness', name: 'Pact of Darkness', heatPerRank: 2,
    ranks: ['The dungeon dims beyond your torchlight'],
  },
  {
    id: 'hourglass', name: 'Pact of the Hourglass', heatPerRank: 2,
    ranks: ['3 minutes per floor; overtime empowers enemies'],
  },
];

export function totalHeat(ranks) {
  let heat = 0;
  for (const p of PACTS) {
    heat += (ranks[p.id] || 0) * p.heatPerRank;
  }
  return heat;
}

export function maxHeat() {
  return PACTS.reduce((s, p) => s + p.ranks.length * p.heatPerRank, 0);
}

// Resolve rank selections into a flat modifier object consumed by Game.
export function pactMods(ranks) {
  const r = (id) => ranks[id] || 0;
  return {
    enemySpeed: [1, 1.12, 1.25][r('swiftness')],
    legionExtra: [0, 0.25, 0.5][r('legion')],
    eliteChance: [0, 0.15, 0.35][r('elites')],
    bossMult: [1, 1.2, 1.4][r('tyranny')],
    healMult: [1, 0.5, 0.25][r('scarcity')],
    projSpeed: [1, 1.2, 1.4][r('barrage')],
    maxHpLoss: [0, 15, 30][r('frailty')],
    darkness: r('darkness') > 0,
    hourglass: r('hourglass') > 0,
  };
}

export const SOUL_BONUS_PER_HEAT = 0.12;
export const HEAT_MILESTONES = [
  { heat: 3, souls: 50 },
  { heat: 6, souls: 120 },
  { heat: 9, souls: 250 },
];
