// Turns a room's data-driven enemyPlan into live entities, placed away from the
// player and room edges. Also spawns boss adds. Object creation is centralised
// here so encounter tuning stays in one place.
import { Enemy } from '../entities/Enemy.js';
import { Boss } from '../entities/Boss.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { CONFIG } from '../data/config.js';
import { dist } from '../core/math.js';

export class SpawnSystem {
  constructor(rng) { this.rng = rng; }

  // Returns { enemies, boss } for the given room.
  spawnRoom(room, depthLevel, player, bossDef = null) {
    const enemies = [];
    let boss = null;
    const b = room.bounds;

    for (const group of room.enemyPlan) {
      if (group.type === 'boss') {
        boss = new Boss(b.w / 2, b.h * 0.32, bossDef, depthLevel);
        continue;
      }
      enemies.push(...this.spawnPlan([group], b, player, room.depth + depthLevel * 4));
    }
    return { enemies, boss };
  }

  // Instantiate a [{type, count, elite}] plan at safe positions (rooms, events).
  spawnPlan(plan, bounds, player, depth = 0) {
    const out = [];
    for (const group of plan) {
      const def = ENEMY_TYPES[group.type];
      if (!def) continue;
      for (let i = 0; i < group.count; i++) {
        const pos = this._safePos(bounds, player);
        const e = new Enemy(pos.x, pos.y, def, depth);
        if (group.elite) e.makeElite();
        out.push(e);
      }
    }
    return out;
  }

  // Spawn a specific archetype at an exact position (summons, events, mimics).
  spawnAt(type, x, y, bounds, depthLevel = 0) {
    const def = ENEMY_TYPES[type] || ENEMY_TYPES.melee;
    const pad = CONFIG.world.roomPadding + def.radius;
    const e = new Enemy(
      Math.min(bounds.x + bounds.w - pad, Math.max(bounds.x + pad, x)),
      Math.min(bounds.y + bounds.h - pad, Math.max(bounds.y + pad, y)),
      def, depthLevel * 4,
    );
    return e;
  }

  spawnAdd(boss, bounds, player, type = 'melee') {
    const def = ENEMY_TYPES[type] || ENEMY_TYPES.melee;
    const pos = this._safePos(bounds, player);
    const e = new Enemy(pos.x, pos.y, def, 2);
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
