// Pooled projectiles used by ranged enemies, the boss, and player blade boons.
import { ObjectPool } from '../core/ObjectPool.js';
import { CONFIG } from '../data/config.js';

export function createProjectilePool() {
  return new ObjectPool(
    () => ({
      x: 0, y: 0, vx: 0, vy: 0, radius: 6, damage: 0,
      hostile: true, color: '#fff', life: 3, pierce: 0, knockback: 120,
      crit: false, dead: false,
    }),
    (p, o) => { Object.assign(p, o); if (p.life == null) p.life = 3; },
  );
}

// Advances projectiles, cull on lifetime/out-of-bounds. Collision handled by caller.
export function updateProjectiles(pool, dt, bounds) {
  pool.update((p) => {
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; return; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const m = CONFIG.world.roomPadding - 8;
    if (p.x < bounds.x + m || p.x > bounds.x + bounds.w - m ||
        p.y < bounds.y + m || p.y > bounds.y + bounds.h - m) {
      p.dead = true;
    }
  });
}
