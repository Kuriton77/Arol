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
  hp: 0.05,          // +5%  enemy HP / floor
  damage: 0.03,      // +3%  enemy damage / floor
  speed: 0.01,       // +1%  enemy speed / floor
  spawnRate: 0.02,   // +2%  enemy count / floor
  eliteChance: 0.005,// +0.5% elite chance / floor
  gold: 0.03,        // +3%  gold reward / floor
  xp: 0.03,          // +3%  xp reward / floor
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
    this.modifiers = [];
  }

  // --- configuration ---
  setDifficulty(id) {
    this.def = difficultyById(id); // falls back to Normal for unknown/missing
    return this;
  }
  get id() { return this.def.id; }
  setFloor(floor) { this.floor = Math.max(1, floor | 0); return this; }

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
  // Generic scaled multiplier for a stat (difficulty applies to every stat).
  mult(stat) {
    return this.def.mult * this._floorFactor(stat) * this._modFactor(stat);
  }

  // --- helper methods requested by the rest of the game --------------------
  // Enemy stat bundle (applied at spawn to base data values).
  enemyScale() {
    return { hp: this.mult('hp'), damage: this.mult('damage'), speed: this.mult('speed') };
  }
  // Bosses scale HP + damage but not movement (their speed is pattern-driven).
  bossScale() {
    return { hp: this.mult('hp'), damage: this.mult('damage') };
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
