// Permanent meta-progression data: the three-branch skill tree (Sanctum),
// weapon mastery curve, blacksmith forging, and achievements (Feats).
// All purchases persist via SaveSystem and apply at run start.

// ---------------------------------------------------------------- skill tree
// Nodes unlock top-to-bottom within a branch (node N requires node N-1).
export const META_TREE = [
  {
    id: 'power', name: 'POWER', color: '#e8574a',
    nodes: [
      { id: 'p1', name: 'Might', cost: 25, desc: '+6% damage', apply: (s) => { s.damageMult += 0.06; } },
      { id: 'p2', name: 'Precision', cost: 40, desc: '+4% crit chance', apply: (s) => { s.critChance += 0.04; } },
      { id: 'p3', name: 'Ferocity', cost: 60, desc: '+8% attack speed', apply: (s) => { s.attackSpeedMult += 0.08; } },
      { id: 'p4', name: 'Brutality', cost: 85, desc: '+15% crit damage', apply: (s) => { s.critMult += 0.15; } },
      { id: 'p5', name: 'Overwhelm', cost: 120, desc: '+10% damage', apply: (s) => { s.damageMult += 0.10; } },
      { id: 'p6', name: 'Warlord', cost: 160, desc: 'Boon choices offer 4 options', keystone: true, apply: () => {} },
    ],
  },
  {
    id: 'vitality', name: 'VITALITY', color: '#4fd88a',
    nodes: [
      { id: 'v1', name: 'Fortitude', cost: 25, desc: '+20 max health', apply: (s) => { s.maxHealthBonus += 20; } },
      { id: 'v2', name: 'Recovery', cost: 40, desc: '+0.3 health/sec regen', apply: (s) => { s.regen += 0.3; } },
      { id: 'v3', name: 'Stoneskin', cost: 60, desc: 'Take 5% less damage', apply: (s) => { s.armor += 0.05; } },
      { id: 'v4', name: 'Bulwark', cost: 85, desc: '+25 max health', apply: (s) => { s.maxHealthBonus += 25; } },
      { id: 'v5', name: 'Reflexes', cost: 120, desc: '5% dodge chance', apply: (s) => { s.dodge += 0.05; } },
      { id: 'v6', name: 'Undying', cost: 160, desc: 'Second Wind every floor', keystone: true, apply: (s) => { s.secondWind = true; } },
    ],
  },
  {
    id: 'fortune', name: 'FORTUNE', color: '#ffd23f',
    nodes: [
      { id: 'f1', name: 'Greed', cost: 25, desc: '+10% gold gained', apply: (s) => { s.greed += 0.10; } },
      { id: 'f2', name: 'Wisdom', cost: 40, desc: '+10% XP gained', apply: (s) => { s.xpMult += 0.10; } },
      { id: 'f3', name: 'Haggler', cost: 60, desc: 'Shop prices 10% cheaper', apply: (s) => { s.shopDiscount += 0.10; } },
      { id: 'f4', name: 'Soul Harvest', cost: 85, desc: '+10% souls gained', apply: (s) => { s.greed += 0.10; } },
      { id: 'f5', name: 'Lucky Strike', cost: 120, desc: '+4% crit chance', apply: (s) => { s.critChance += 0.04; } },
      { id: 'f6', name: 'Fated', cost: 160, desc: 'Start runs with a random boon', keystone: true, apply: () => {} },
    ],
  },
];

export function metaNodeById(id) {
  for (const br of META_TREE) {
    const n = br.nodes.find((x) => x.id === id);
    if (n) return n;
  }
  return null;
}

// Legacy v1 meta upgrades — kept only so the save migration can refund them.
export const LEGACY_META = [
  { id: 'm_health', baseCost: 20, costGrowth: 1.6 },
  { id: 'm_damage', baseCost: 25, costGrowth: 1.6 },
  { id: 'm_dash', baseCost: 30, costGrowth: 1.8 },
  { id: 'm_crit', baseCost: 35, costGrowth: 1.8 },
  { id: 'm_greed', baseCost: 25, costGrowth: 1.7 },
];

// ------------------------------------------------------------ weapon mastery
// Kills with a weapon accumulate across runs; levels grant permanent bonuses.
export const MASTERY_THRESHOLDS = [10, 30, 70, 150, 300];

export function masteryLevel(kills) {
  let lvl = 0;
  for (const t of MASTERY_THRESHOLDS) if (kills >= t) lvl++;
  return lvl;
}

// Applied at run start for the equipped weapon.
export function applyMastery(stats, lvl) {
  stats.damageMult += 0.03 * lvl;               // +3% damage per level
  if (lvl >= 3) stats.attackSpeedMult += 0.05;  // keystone at 3
  if (lvl >= 5) stats.critChance += 0.05;       // keystone at 5
}

export const MASTERY_PERKS = ['+3% dmg', '+3% dmg', '+5% atk speed', '+3% dmg', '+5% crit'];

// -------------------------------------------------------------- blacksmith
export const SMITH_MAX = 3;
export const SMITH_COSTS = [30, 60, 100];
export const SMITH_BONUS = 0.06; // +6% weapon base damage per forge level

// ------------------------------------------------------------- achievements
// check(save, run) runs when a run is committed; run may be null for
// passive checks. Each pays its soul bounty once.
export const ACHIEVEMENTS = [
  { id: 'first_blood', name: 'First Blood', desc: 'Slay your first enemy', souls: 10, check: (sv) => sv.stats.kills >= 1 },
  { id: 'slayer_100', name: 'Slayer', desc: 'Slay 100 enemies', souls: 20, check: (sv) => sv.stats.kills >= 100 },
  { id: 'slayer_500', name: 'Reaper', desc: 'Slay 500 enemies', souls: 40, check: (sv) => sv.stats.kills >= 500 },
  { id: 'first_win', name: 'Kingslayer', desc: 'Defeat a floor boss', souls: 30, check: (sv) => sv.stats.wins >= 1 },
  { id: 'boss_3', name: 'Giant Hunter', desc: 'Defeat 3 different bosses', souls: 40, check: (sv) => Object.keys(sv.stats.bossesDefeated || {}).length >= 3 },
  { id: 'boss_6', name: 'Pantheon Breaker', desc: 'Defeat all 6 bosses', souls: 80, check: (sv) => Object.keys(sv.stats.bossesDefeated || {}).length >= 6 },
  { id: 'floor_3', name: 'Delver', desc: 'Reach floor 3', souls: 25, check: (sv) => sv.stats.bestDepth >= 3 },
  { id: 'floor_5', name: 'Deep Delver', desc: 'Reach floor 5', souls: 50, check: (sv) => sv.stats.bestDepth >= 5 },
  { id: 'synergy', name: 'Alchemist', desc: 'Unlock a synergy in a run', souls: 20, check: (sv, run) => run && run.synergies > 0 },
  { id: 'collector', name: 'Collector', desc: 'Hold 8 relics in one run', souls: 30, check: (sv, run) => run && run.relics >= 8 },
  { id: 'wealthy', name: 'Deep Pockets', desc: 'Hold 200 gold in one run', souls: 25, check: (sv, run) => run && run.maxGold >= 200 },
  { id: 'level_10', name: 'Ascendant', desc: 'Reach level 10 in one run', souls: 25, check: (sv, run) => run && run.level >= 10 },
  { id: 'persistent', name: 'Persistent', desc: 'Die 10 times (it builds character)', souls: 20, check: (sv) => sv.stats.runs - sv.stats.wins >= 10 },
  { id: 'master', name: 'Weapon Master', desc: 'Reach mastery 5 with any weapon', souls: 60, check: (sv) => Object.values(sv.weaponMastery || {}).some((m) => masteryLevel(m.kills) >= 5) },
];
