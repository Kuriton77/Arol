// Central data-driven configuration. Tuning lives here so systems stay generic.
export const CONFIG = Object.freeze({
  world: {
    width: 960,
    height: 540,
    roomPadding: 48,     // wall thickness / play-area inset
  },
  player: {
    radius: 14,
    speed: 210,
    maxHealth: 100,
    dash: {
      speed: 620,
      duration: 0.16,
      cooldown: 0.9,
      iframes: 0.24,
    },
    attack: {
      damage: 18,
      cooldown: 0.34,     // base seconds between swings
      range: 58,
      arc: Math.PI * 0.85, // swing arc width (radians)
      knockback: 260,
      windup: 0.05,
      active: 0.12,
    },
    hurtIframes: 0.6,
    baseCrit: 0.05,
    critMult: 2.0,
  },
  combat: {
    hitPause: 0.055,      // seconds of freeze on landing a hit
    shakeOnHit: 4,
    shakeOnHurt: 9,
    shakeOnDeath: 14,
  },
  progression: {
    xpBase: 12,           // xp to reach level 2
    xpGrowth: 1.35,       // multiplier per level
    upgradesOnLevel: 3,   // choices offered
  },
  dungeon: {
    minRooms: 10,
    maxRooms: 14,
  },
  audio: {
    master: 0.6,
    music: 0.4,
    sfx: 0.7,
  },
});

// Room type identifiers, kept as constants to avoid stringly-typed bugs.
export const ROOM = Object.freeze({
  START: 'start',
  COMBAT: 'combat',
  ELITE: 'elite',
  TREASURE: 'treasure',
  SHOP: 'shop',
  EVENT: 'event',
  BOSS: 'boss',
});

export const GAME_STATE = Object.freeze({
  MENU: 'menu',
  PLAYING: 'playing',
  UPGRADE: 'upgrade',
  EVENT: 'event',
  PAUSED: 'paused',
  GAMEOVER: 'gameover',
  VICTORY: 'victory',
});
