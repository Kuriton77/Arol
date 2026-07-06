// Biome definitions — one per floor, cycling after the last. Each biome themes
// the palette, restricts the enemy roster, seeds decorations and environmental
// hazards, drives ambient particles + explore music, biases the relic loot
// table toward its element, and names its boss (bosses.js).
export const BIOMES = [
  {
    id: 'castle', name: 'The Castle', bossId: 'hollow_king',
    palette: { floor: '#12141c', wall: '#20242f', grid: 'rgba(120,140,200,0.06)' },
    elitePalette: { floor: '#161327', wall: '#262040', grid: 'rgba(150,110,220,0.09)' },
    enemies: ['melee', 'ranged', 'swarmling', 'shieldknight', 'tank', 'assassin'],
    hazard: { kind: 'spikes', color: '#8a93ad', damage: 8, radius: 34, count: [0, 2], linger: 9999, tickEvery: 0.7 },
    decor: { kind: 'pillar', color: '#2c3245', count: [3, 6] },
    ambient: { color: 'rgba(170,180,210,0.5)', vx: 4, vy: -6, rate: 0.5, size: 2 },
    musicScale: [220, 261, 329, 392, 261, 329],
    lootBias: null,
  },
  {
    id: 'crypt', name: 'The Crypt', bossId: 'bone_matriarch',
    palette: { floor: '#16140e', wall: '#292515', grid: 'rgba(200,190,140,0.06)' },
    elitePalette: { floor: '#1c1810', wall: '#332c18', grid: 'rgba(220,200,150,0.09)' },
    enemies: ['swarmling', 'melee', 'necromancer', 'assassin', 'healer', 'ranged'],
    hazard: { kind: 'miasma', color: '#7aa04f', damage: 6, radius: 44, count: [1, 3], linger: 9999, tickEvery: 0.8 },
    decor: { kind: 'grave', color: '#3a3524', count: [4, 8] },
    ambient: { color: 'rgba(180,220,140,0.35)', vx: 0, vy: -12, rate: 0.35, size: 2.5 },
    musicScale: [196, 233, 261, 311, 233, 207],
    lootBias: { poison: 2, blood: 2 },
  },
  {
    id: 'forest', name: 'The Silent Wood', bossId: 'spider_queen',
    palette: { floor: '#0f160f', wall: '#1c2c1a', grid: 'rgba(120,200,130,0.06)' },
    elitePalette: { floor: '#12200f', wall: '#233a1e', grid: 'rgba(150,230,150,0.09)' },
    enemies: ['spider', 'bomber', 'healer', 'charger', 'ranged', 'melee'],
    hazard: { kind: 'web', color: '#c8e8d0', damage: 2, radius: 46, count: [1, 3], linger: 9999, tickEvery: 0.9, slow: true },
    decor: { kind: 'tree', color: '#1e3820', count: [4, 7] },
    ambient: { color: 'rgba(150,220,120,0.5)', vx: -14, vy: 10, rate: 0.7, size: 2.5 },
    musicScale: [233, 277, 349, 415, 277, 311],
    lootBias: { poison: 2, wind: 2 },
  },
  {
    id: 'ice', name: 'The Ice Cavern', bossId: 'frost_wyrm',
    palette: { floor: '#0e1620', wall: '#1a2a3c', grid: 'rgba(140,200,255,0.07)' },
    elitePalette: { floor: '#101c2a', wall: '#1e3248', grid: 'rgba(170,220,255,0.1)' },
    enemies: ['mage', 'warden', 'tank', 'spider', 'ranged', 'shieldknight'],
    hazard: { kind: 'frost', color: '#a8d8ff', damage: 4, radius: 48, count: [1, 3], linger: 9999, tickEvery: 0.9, slow: true },
    decor: { kind: 'crystal', color: '#3a6a9c', count: [4, 7] },
    ambient: { color: 'rgba(210,235,255,0.6)', vx: -8, vy: 16, rate: 0.9, size: 2 },
    musicScale: [207, 246, 311, 370, 246, 277],
    lootBias: { ice: 3 },
  },
  {
    id: 'volcano', name: 'The Burning Deep', bossId: 'magma_titan',
    palette: { floor: '#1a0f0a', wall: '#2e180e', grid: 'rgba(255,140,70,0.06)' },
    elitePalette: { floor: '#221208', wall: '#3a1e0c', grid: 'rgba(255,160,90,0.09)' },
    enemies: ['bomber', 'charger', 'tank', 'warden', 'mage', 'melee'],
    hazard: { kind: 'lava', color: '#ff7b3a', damage: 10, radius: 46, count: [1, 4], linger: 9999, tickEvery: 0.6 },
    decor: { kind: 'vent', color: '#3a1c10', count: [3, 6] },
    ambient: { color: 'rgba(255,160,80,0.55)', vx: 3, vy: -22, rate: 0.9, size: 2 },
    musicScale: [174, 207, 261, 311, 207, 185],
    lootBias: { fire: 3 },
  },
  {
    id: 'void', name: 'The Hollow Between', bossId: 'void_amalgam',
    palette: { floor: '#100c1a', wall: '#1e1630', grid: 'rgba(170,130,255,0.07)' },
    elitePalette: { floor: '#140e22', wall: '#261c3e', grid: 'rgba(190,150,255,0.1)' },
    enemies: ['assassin', 'mage', 'necromancer', 'warden', 'shieldknight', 'charger', 'swarmling'],
    hazard: { kind: 'rift', color: '#9a6aff', damage: 9, radius: 40, count: [1, 3], linger: 9999, tickEvery: 0.7 },
    decor: { kind: 'shard', color: '#3a2a66', count: [4, 8] },
    ambient: { color: 'rgba(190,150,255,0.5)', vx: 6, vy: -4, rate: 0.6, size: 2 },
    musicScale: [164, 196, 246, 293, 196, 174],
    lootBias: { void: 3 },
  },
];

export function biomeForFloor(floor) {
  return BIOMES[(floor - 1) % BIOMES.length];
}
