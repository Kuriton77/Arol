// Data-driven enemy archetypes. Behaviour is selected by `ai` (see the
// behaviour registry in Enemy.js); stats scale with dungeon depth.
// Adding an enemy = adding an entry + (optionally) a behaviour.
//
// Fields: shape drives the renderer; blockFrontal/summons/heals/web/explodes
// are mechanic flags read by CombatSystem / behaviours.
export const ENEMY_TYPES = {
  // ---------------------------------------------------------- original three
  melee: {
    name: 'Grunt', ai: 'melee', shape: 'circle',
    radius: 15, health: 34, speed: 128, damage: 10,
    color: '#e8574a', accent: '#ff8a7a', xp: 6, gold: 2, knockbackResist: 0,
    attack: { range: 34, cooldown: 1.0, windup: 0.35, lunge: 300, knockback: 200 },
  },
  ranged: {
    name: 'Sniper', ai: 'ranged', shape: 'diamond',
    radius: 13, health: 22, speed: 96, damage: 8,
    color: '#3fb6e8', accent: '#8fe0ff', xp: 8, gold: 3, knockbackResist: 0.1,
    preferredDist: 220,
    attack: { range: 380, cooldown: 1.6, windup: 0.5, projSpeed: 300, knockback: 120 },
  },
  tank: {
    name: 'Brute', ai: 'tank', shape: 'square',
    radius: 24, health: 120, speed: 66, damage: 18,
    color: '#8a6bd6', accent: '#c3a8ff', xp: 16, gold: 6, knockbackResist: 0.7,
    attack: { range: 46, cooldown: 1.6, windup: 0.6, lunge: 180, knockback: 340 },
  },

  // ------------------------------------------------------------- expansion
  assassin: {
    // Vanishes, reappears behind the player, quick backstab. Frail.
    name: 'Assassin', ai: 'assassin', shape: 'triangle',
    radius: 13, health: 26, speed: 150, damage: 14,
    color: '#5a5f78', accent: '#b8c0e0', xp: 10, gold: 4, knockbackResist: 0.1,
    attack: { range: 36, cooldown: 2.4, windup: 0.28, lunge: 340, knockback: 180, vanishTime: 0.55 },
  },
  necromancer: {
    // Keeps far away and raises Bonelings. Weak alone — kill it first.
    name: 'Necromancer', ai: 'necromancer', shape: 'ring',
    radius: 15, health: 40, speed: 70, damage: 6,
    color: '#7a4fd6', accent: '#d0b8ff', xp: 14, gold: 7, knockbackResist: 0.2,
    preferredDist: 300,
    attack: { range: 999, cooldown: 4.2, windup: 0.9, summonType: 'swarmling', summonCount: 2 },
  },
  bomber: {
    // Sprints at the player and detonates. The fuse is the telegraph.
    name: 'Bomber', ai: 'bomber', shape: 'circle',
    radius: 12, health: 18, speed: 168, damage: 22,
    color: '#e8a13f', accent: '#ffd98a', xp: 7, gold: 3, knockbackResist: 0,
    attack: { range: 52, cooldown: 1, windup: 0.55, blastRadius: 78 },
  },
  shieldknight: {
    // Blocks all frontal damage — flank it or hit during its swing.
    name: 'Shield Knight', ai: 'melee', shape: 'square', blockFrontal: true,
    radius: 17, health: 80, speed: 82, damage: 14,
    color: '#c0c8d8', accent: '#f0f4ff', xp: 14, gold: 5, knockbackResist: 0.5,
    attack: { range: 38, cooldown: 1.5, windup: 0.5, lunge: 240, knockback: 280 },
  },
  mage: {
    // Blinks away when approached, fires a 3-round burst. Punishes passivity.
    name: 'Mage', ai: 'mage', shape: 'diamond',
    radius: 13, health: 30, speed: 90, damage: 9,
    color: '#d64fb8', accent: '#ffb0ec', xp: 12, gold: 5, knockbackResist: 0.1,
    preferredDist: 240,
    attack: { range: 420, cooldown: 2.2, windup: 0.55, projSpeed: 340, knockback: 100, burst: 3, blinkDist: 150 },
  },
  spider: {
    // Fast zig-zag skitter; spits webs that slow the player.
    name: 'Spider', ai: 'spider', shape: 'spider',
    radius: 11, health: 20, speed: 172, damage: 7,
    color: '#3a7a4a', accent: '#8fe0a8', xp: 7, gold: 2, knockbackResist: 0,
    preferredDist: 150,
    attack: { range: 260, cooldown: 2.0, windup: 0.4, projSpeed: 260, knockback: 60, web: true },
  },
  healer: {
    // Avoids the player and channels healing into wounded allies. Priority target.
    name: 'Mender', ai: 'healer', shape: 'cross',
    radius: 13, health: 34, speed: 98, damage: 0,
    color: '#4fd88a', accent: '#c0ffd8', xp: 12, gold: 6, knockbackResist: 0,
    attack: { range: 0, cooldown: 1, windup: 0, healPerSec: 14, healRange: 240 },
  },
  charger: {
    // Locks on, telegraphs a line, then charges across the arena. Stunned on walls.
    name: 'Charger', ai: 'charger', shape: 'triangle',
    radius: 18, health: 55, speed: 88, damage: 20,
    color: '#d6a04f', accent: '#ffd9a0', xp: 12, gold: 5, knockbackResist: 0.6,
    attack: { range: 380, cooldown: 2.6, windup: 0.8, chargeSpeed: 560, knockback: 380, stun: 1.0 },
  },
  swarmling: {
    // Tiny, fast, dies to a stiff breeze. Dangerous in packs; raised by necromancers.
    name: 'Boneling', ai: 'melee', shape: 'circle',
    radius: 9, health: 8, speed: 188, damage: 5,
    color: '#d8d0c0', accent: '#fff8e8', xp: 2, gold: 1, knockbackResist: 0,
    attack: { range: 24, cooldown: 0.9, windup: 0.25, lunge: 260, knockback: 120 },
  },
  warden: {
    // Immobile arcane turret; rotating radial volleys control space.
    name: 'Warden', ai: 'warden', shape: 'hex',
    radius: 19, health: 70, speed: 0, damage: 8,
    color: '#4f8ad6', accent: '#a8d0ff', xp: 15, gold: 7, knockbackResist: 1,
    attack: { range: 999, cooldown: 2.4, windup: 0.7, projSpeed: 240, knockback: 100, radial: 8 },
  },
  mimic: {
    // Disguised as treasure; springs to life with frenzied bites. (Event rooms.)
    name: 'Mimic', ai: 'melee', shape: 'square',
    radius: 16, health: 60, speed: 158, damage: 12,
    color: '#c9a227', accent: '#ffe08a', xp: 18, gold: 25, knockbackResist: 0.2,
    attack: { range: 32, cooldown: 0.7, windup: 0.2, lunge: 320, knockback: 160 },
  },
};

// Boss definitions live in bosses.js (data-driven pattern engine).
