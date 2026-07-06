// Turns a room's data-driven enemyPlan into live entities, placed away from the
// player and room edges. Also spawns boss adds. Object creation is centralised
// here so encounter tuning stays in one place.
import { Enemy } from '../entities/Enemy.js';
import { Boss } from '../entities/Boss.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { CONFIG } from '../data/config.js';
import { dist } from '../core/math.js';

// Identity scaling used when no DifficultyManager is supplied (standalone use).
const IDENTITY = { enemyScale: () => ({ hp: 1, damage: 1, speed: 1 }), bossScale: () => ({ hp: 1, damage: 1 }), eliteChance: () => 0 };

export class SpawnSystem {
  // `difficulty` is a DifficultyManager; all stat scaling is sourced from it.
  constructor(rng, difficulty = null) {
    this.rng = rng;
    this.difficulty = difficulty || IDENTITY;
  }

  // Returns { enemies, boss } for the given room.
  spawnRoom(room, depthLevel, player, bossDef = null) {
    const enemies = [];
    let boss = null;
    const b = room.bounds;

    for (const group of room.enemyPlan) {
      if (group.type === 'boss') {
        boss = new Boss(b.w / 2, b.h * 0.32, bossDef, this.difficulty.bossScale());
        continue;
      }
      enemies.push(...this.spawnPlan([group], b, player));
    }
    return { enemies, boss };
  }

  // Instantiate a [{type, count, elite}] plan at safe positions (rooms, events).
  // Elite status comes from the plan (designated groups) or a difficulty roll.
  spawnPlan(plan, bounds, player) {
    const out = [];
    const scale = this.difficulty.enemyScale();
    const eliteChance = this.difficulty.eliteChance();
    for (const group of plan) {
      const def = ENEMY_TYPES[group.type];
      if (!def) continue;
      for (let i = 0; i < group.count; i++) {
        const pos = this._safePos(bounds, player);
        const e = new Enemy(pos.x, pos.y, def, scale);
        if (group.elite || (eliteChance > 0 && this.rng.chance(eliteChance))) e.makeElite();
        out.push(e);
      }
    }
    return out;
  }

  // Spawn a specific archetype at an exact position (summons, events, mimics).
  spawnAt(type, x, y, bounds) {
    const def = ENEMY_TYPES[type] || ENEMY_TYPES.melee;
    const pad = CONFIG.world.roomPadding + def.radius;
    return new Enemy(
      Math.min(bounds.x + bounds.w - pad, Math.max(bounds.x + pad, x)),
      Math.min(bounds.y + bounds.h - pad, Math.max(bounds.y + pad, y)),
      def, this.difficulty.enemyScale(),
    );
  }

  spawnAdd(boss, bounds, player, type = 'melee') {
    const def = ENEMY_TYPES[type] || ENEMY_TYPES.melee;
    const pos = this._safePos(bounds, player);
    const e = new Enemy(pos.x, pos.y, def, this.difficulty.enemyScale());
    e.spawnedByBoss = true;
    return e;
  }

  // Random position inside play area, at least a safe distance from the player.
  _safePos(b, player) {
    const pad = CONFIG.world.roomPadding + 30;
    let x, y, tries = 0;
    do {
      x = this.rng.range(b.x + pad, b.x + b.w - pad);
      y = this.rng.range(b.y + pad, b.y + b.h - pad);
      tries++;
    } while (player && dist(x, y, player.x, player.y) < 150 && tries < 20);
    return { x, y };
  }
}
