// Boss definitions — pure data resolved by the pattern engine in Boss.js.
// Each phase unlocks a pattern pool; params tune the shared pattern library.
// arena colors theme the room, musicScale drives the boss soundtrack, and
// rewardRelicId is the boss-exclusive relic offered on the kill.

export const BOSSES = [
  {
    id: 'hollow_king', name: 'The Hollow King', title: 'Lord of the Empty Throne',
    radius: 46, health: 900, speed: 82, contactDamage: 16,
    color: '#d64f7a', accent: '#ffb0cf', xp: 200, gold: 120,
    musicScale: [146, 174, 207, 261, 174, 155],
    arena: { floor: '#241018', wall: '#3a1826', grid: 'rgba(200,80,120,0.08)' },
    rewardRelicId: 'r_hollow_crown',
    params: { radialCount: 14, projSpeed: 270, chargeSpeed: 620, summonType: 'melee', summonCount: 2 },
    phases: [
      { at: 1.0,  name: 'Awakening',   speedMult: 1.0,  cooldownMult: 1.0,  patterns: ['radial', 'charge'] },
      { at: 0.66, name: 'Fury',        speedMult: 1.2,  cooldownMult: 0.78, patterns: ['radial', 'charge', 'spiral', 'summon'] },
      { at: 0.33, name: 'Desperation', speedMult: 1.45, cooldownMult: 0.6,  patterns: ['spiral', 'radial', 'charge', 'ring'] },
    ],
  },
  {
    id: 'bone_matriarch', name: 'The Bone Matriarch', title: 'Mother of the Restless Dead',
    radius: 42, health: 1050, speed: 64, contactDamage: 14,
    color: '#c8bfa8', accent: '#fff8e0', xp: 240, gold: 140,
    musicScale: [138, 164, 196, 246, 164, 146],
    arena: { floor: '#1a1a14', wall: '#2e2c20', grid: 'rgba(200,190,140,0.07)' },
    rewardRelicId: 'r_bone_scepter',
    params: { radialCount: 12, projSpeed: 250, summonType: 'swarmling', summonCount: 3, volleyShots: 3, volleyCount: 3 },
    phases: [
      { at: 1.0,  name: 'Stirring',     speedMult: 1.0, cooldownMult: 1.0,  patterns: ['summon', 'volley'] },
      { at: 0.66, name: 'Grave Chorus', speedMult: 1.1, cooldownMult: 0.8,  patterns: ['summon', 'volley', 'spiral'] },
      { at: 0.33, name: 'Bone Storm',   speedMult: 1.3, cooldownMult: 0.62, patterns: ['summon', 'spiral', 'ring', 'volley'] },
    ],
  },
  {
    id: 'spider_queen', name: 'The Spider Queen', title: 'Weaver of the Silent Wood',
    radius: 40, health: 980, speed: 118, contactDamage: 15,
    color: '#3a7a4a', accent: '#a8ffc8', xp: 240, gold: 140,
    musicScale: [155, 185, 220, 277, 185, 165],
    arena: { floor: '#101a10', wall: '#1e3020', grid: 'rgba(120,220,140,0.07)' },
    rewardRelicId: 'r_web_talisman',
    params: { radialCount: 10, projSpeed: 240, chargeSpeed: 700, summonType: 'spider', summonCount: 2, webShots: true },
    phases: [
      { at: 1.0,  name: 'Lurking',    speedMult: 1.0,  cooldownMult: 1.0,  patterns: ['charge', 'radial'] },
      { at: 0.66, name: 'Brood Call', speedMult: 1.2,  cooldownMult: 0.75, patterns: ['charge', 'summon', 'radial'] },
      { at: 0.33, name: 'Frenzy',     speedMult: 1.5,  cooldownMult: 0.55, patterns: ['charge', 'charge', 'summon', 'ring'] },
    ],
  },
  {
    id: 'frost_wyrm', name: 'The Frost Wyrm', title: 'Breath of the Long Winter',
    radius: 48, health: 1150, speed: 70, contactDamage: 17,
    color: '#5aa8d6', accent: '#d0f0ff', xp: 280, gold: 160,
    musicScale: [130, 155, 185, 233, 155, 138],
    arena: { floor: '#101822', wall: '#1c2c3e', grid: 'rgba(140,200,255,0.08)' },
    rewardRelicId: 'r_wyrm_scale',
    params: { radialCount: 12, projSpeed: 230, chargeSpeed: 560, coneShots: 5, chillProj: true, hazardCount: 4, hazardRadius: 60 },
    phases: [
      { at: 1.0,  name: 'Glacial Calm', speedMult: 1.0,  cooldownMult: 1.0,  patterns: ['cone', 'charge'] },
      { at: 0.66, name: 'Hailstorm',    speedMult: 1.15, cooldownMult: 0.8,  patterns: ['cone', 'charge', 'hazards', 'radial'] },
      { at: 0.33, name: 'Whiteout',     speedMult: 1.35, cooldownMult: 0.6,  patterns: ['cone', 'hazards', 'ring', 'charge'] },
    ],
  },
  {
    id: 'magma_titan', name: 'The Magma Titan', title: 'Heart of the Burning Deep',
    radius: 52, health: 1300, speed: 58, contactDamage: 20,
    color: '#e86a3a', accent: '#ffc890', xp: 320, gold: 180,
    musicScale: [123, 146, 174, 220, 146, 130],
    arena: { floor: '#20100c', wall: '#381a10', grid: 'rgba(255,140,70,0.08)' },
    rewardRelicId: 'r_magma_heart',
    params: { radialCount: 16, projSpeed: 250, hazardCount: 6, hazardRadius: 70, slamRadius: 130, burnProj: true },
    phases: [
      { at: 1.0,  name: 'Smoldering', speedMult: 1.0, cooldownMult: 1.0,  patterns: ['hazards', 'novaSlam'] },
      { at: 0.66, name: 'Eruption',   speedMult: 1.1, cooldownMult: 0.78, patterns: ['hazards', 'novaSlam', 'radial'] },
      { at: 0.33, name: 'Meltdown',   speedMult: 1.3, cooldownMult: 0.58, patterns: ['hazards', 'novaSlam', 'radial', 'ring'] },
    ],
  },
  {
    id: 'void_amalgam', name: 'The Void Amalgam', title: 'That Which Should Not Cohere',
    radius: 44, health: 1400, speed: 90, contactDamage: 18,
    color: '#6a4fd6', accent: '#d0b8ff', xp: 380, gold: 220,
    musicScale: [110, 138, 164, 207, 130, 116],
    arena: { floor: '#120e1e', wall: '#221a38', grid: 'rgba(170,130,255,0.08)' },
    rewardRelicId: 'r_void_prism',
    params: { radialCount: 14, projSpeed: 280, summonType: 'mage', summonCount: 1, teleports: true },
    phases: [
      { at: 1.0,  name: 'Coalescing', speedMult: 1.0,  cooldownMult: 1.0,  patterns: ['teleport', 'radial'] },
      { at: 0.66, name: 'Unraveling', speedMult: 1.2,  cooldownMult: 0.75, patterns: ['teleport', 'spiral', 'summon'] },
      { at: 0.33, name: 'Oblivion',   speedMult: 1.45, cooldownMult: 0.55, patterns: ['teleport', 'spiral', 'ring', 'radial'] },
    ],
  },
];

export function bossForFloor(floor) {
  return BOSSES[(floor - 1) % BOSSES.length];
}

export function bossById(id) {
  return BOSSES.find((b) => b.id === id) || BOSSES[0];
}
