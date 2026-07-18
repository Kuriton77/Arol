// DifficultyManager — the single source of truth for all gameplay scaling.
//
// Every scaled stat is derived as:
//     final = base × difficultyMultiplier × floorMultiplier × modifierMultiplier
//
// Nothing else in the codebase should hardcode difficulty or floor numbers;
// systems ask the manager (enemyScale(), goldMult(), eliteChance(), ...).
//
// Three independent, composable axes:
//   1. Difficulty tier  — player-chosen (Easy … Inferno), one flat multiplier.
//   2. Floor scaling     — automatic per-floor growth, per-stat rates.
//   3. Modifiers         — pluggable global multipliers (Blood Moon, Greed,
//                          Curse, seasonal events…) registered at run start.
//
// Adding a new modifier is one entry in MODIFIERS + addModifier(); adding a new
// scaled stat is one entry in FLOOR_RATES + a helper. No refactor required.

import { clamp } from '../core/math.js';

// --- Difficulty tiers (player-selectable). ---------------------------------
export const DIFFICULTIES = [
  { id: 'easy',      name: 'Easy',      mult: 0.75, color: '#4fd88a', desc: 'A gentler descent. Fewer, weaker foes.' },
  { id: 'normal',    name: 'Normal',    mult: 1.00, color: '#63b8ff', desc: 'The intended experience.' },
  { id: 'hard',      name: 'Hard',      mult: 1.30, color: '#ffd23f', desc: 'Tougher enemies, richer rewards.' },
  { id: 'nightmare', name: 'Nightmare', mult: 1.60, color: '#ff8a3f', desc: 'For hardened delvers only.' },
  { id: 'inferno',   name: 'Inferno',   mult: 2.00, color: '#ff4f5a', desc: 'Everything wants you dead. Twice as much.' },
];

export const DEFAULT_DIFFICULTY = 'normal';

export function difficultyById(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES.find((d) => d.id === DEFAULT_DIFFICULTY);
}

// --- Automatic per-floor scaling (fraction added per floor beyond floor 1). -
export const FLOOR_RATES = {
  hp: 0.20,          // +20% enemy HP / floor — aggressive so foes stay relevant
  damage: 0.06,      // +6%  enemy damage / floor
  speed: 0.015,      // +1.5% enemy speed / floor (slight)
  spawnRate: 0.03,   // +3%  enemy count / floor
  eliteChance: 0.01, // +1%  elite chance / floor
  gold: 0.05,        // +5%  gold reward / floor
  xp: 0.03,          // +3%  xp reward / floor
};

// --- Player-level scaling (fraction added per player level beyond 1). -------
// Enemies grow with the player's own power so a strong build never fully
// trivialises the game; rewards don't level-scale (only floors pay more).
export const LEVEL_RATES = {
  hp: 0.06,          // +6% enemy HP / player level
  damage: 0.025,     // +2.5% enemy damage / player level
  eliteChance: 0.003,
};

// --- Attack pace (ability frequency): cooldowns tick faster as runs deepen. -
export const PACE = { floorRate: 0.025, levelRate: 0.008, max: 1.6 };

// --- Boss tuning: bosses scale dramatically harder than regular enemies so
// they survive to showcase their phases and stay the climax of the run. -----
export const BOSS_TUNING = {
  hpBase: 2.1,        // flat multiplier over the data HP
  hpFloorRate: 0.35,  // +35% boss HP per floor
  hpLevelRate: 0.09,  // +9% boss HP per player level
  damageBase: 1.15,   // bosses hit harder than their data values
  paceBonus: 0.15,    // extra ability-frequency on top of the shared pace
};

// Baseline chance for a normal enemy to spawn elite (before floor/difficulty).
export const BASE_ELITE_CHANCE = 0.0;
export const ELITE_CHANCE_CAP = 0.75;

// --- Optional global modifiers (plug-and-play). Values are multipliers on the
// named stat; anything omitted defaults to ×1. These are examples the game can
// activate via addModifier(); none are active by default. ---
export const MODIFIERS = {
  bloodMoon: { id: 'bloodMoon', name: 'Blood Moon', damage: 1.30 },
  greed:     { id: 'greed',     name: 'Greed',      gold: 1.50 },
  curse:     { id: 'curse',     name: 'Curse',      eliteChance: 2.00 },
  frenzy:    { id: 'frenzy',    name: 'Frenzy',     speed: 1.20, spawnRate: 1.15 },
  bounty:    { id: 'bounty',    name: 'Bounty',     gold: 1.25, xp: 1.25 },
};

export class DifficultyManager {
  constructor(difficultyId = DEFAULT_DIFFICULTY) {
    this.setDifficulty(difficultyId);
    this.floor = 1;
    this.playerLevel = 1;
    this.modifiers = [];
  }

  // --- configuration ---
  setDifficulty(id) {
    this.def = difficultyById(id); // falls back to Normal for unknown/missing
    return this;
  }
  get id() { return this.def.id; }
  setFloor(floor) { this.floor = Math.max(1, floor | 0); return this; }
  setPlayerLevel(level) { this.playerLevel = Math.max(1, level | 0); return this; }

  addModifier(mod) {
    if (mod && !this.modifiers.some((m) => m.id === mod.id)) this.modifiers.push(mod);
    return this;
  }
  removeModifier(id) { this.modifiers = this.modifiers.filter((m) => m.id !== id); return this; }
  clearModifiers() { this.modifiers = []; return this; }

  // --- core multiplier: difficulty × floor × modifiers, for any named stat ---
  _floorFactor(stat) {
    const rate = FLOOR_RATES[stat] || 0;
    return 1 + rate * (this.floor - 1);
  }
  _modFactor(stat) {
    let m = 1;
    for (const mod of this.modifiers) m *= mod[stat] ?? 1;
    return m;
  }
  _levelFactor(stat) {
    const rate = LEVEL_RATES[stat] || 0;
    return 1 + rate * (this.playerLevel - 1);
  }
  // Generic scaled multiplier for a stat (difficulty × floor × player level ×
  // modifiers). Future axes (Endless...) slot into this one product.
  mult(stat) {
    return this.def.mult * this._floorFactor(stat) * this._levelFactor(stat) * this._modFactor(stat);
  }
  // Cooldown/ability-frequency multiplier (difficulty-agnostic ramp).
  pace(extra = 0) {
    return Math.min(PACE.max, 1 + PACE.floorRate * (this.floor - 1) + PACE.levelRate * (this.playerLevel - 1) + extra);
  }

  // --- helper methods requested by the rest of the game --------------------
  // Enemy stat bundle (applied at spawn to base data values).
  enemyScale() {
    return { hp: this.mult('hp'), damage: this.mult('damage'), speed: this.mult('speed'), pace: this.pace() };
  }
  // Bosses scale far harder: flat base, steeper floor/level HP growth, bonus
  // damage and ability frequency — they must outlive the player's burst.
  bossScale() {
    const T = BOSS_TUNING;
    return {
      hp: T.hpBase * this.def.mult
        * (1 + T.hpFloorRate * (this.floor - 1))
        * (1 + T.hpLevelRate * (this.playerLevel - 1))
        * this._modFactor('hp'),
      damage: T.damageBase * this.mult('damage'),
      pace: this.pace(T.paceBonus),
    };
  }
  // Multiplier applied to a room's enemy-count budget.
  spawnMultiplier() { return this.mult('spawnRate'); }
  // Probability a normal enemy spawns as an elite this run.
  eliteChance() {
    const base = BASE_ELITE_CHANCE + FLOOR_RATES.eliteChance * (this.floor - 1);
    return clamp(base * this.def.mult * this._modFactor('eliteChance'), 0, ELITE_CHANCE_CAP);
  }
  goldMult() { return this.mult('gold'); }
  xpMult() { return this.mult('xp'); }

  // Read-only view for HUD / menus / debugging / tests.
  snapshot() {
    return {
      id: this.def.id, name: this.def.name, color: this.def.color, difficultyMult: this.def.mult,
      floor: this.floor,
      hp: this.mult('hp'), damage: this.mult('damage'), speed: this.mult('speed'),
      spawn: this.spawnMultiplier(), elite: this.eliteChance(),
      gold: this.goldMult(), xp: this.xpMult(),
      modifiers: this.modifiers.map((m) => m.name),
    };
  }
}
