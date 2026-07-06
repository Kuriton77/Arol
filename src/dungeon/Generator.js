// Procedural dungeon generator. Grows a connected tree of rooms on a grid,
// adds a few loops, then assigns room types and per-room encounter plans.
// Deterministic given a seed, so runs are reproducible & testable.
import { Room, DIRS } from './Room.js';
import { ROOM, CONFIG } from '../data/config.js';
import { EVENTS } from '../data/events.js';

export function generateDungeon(seed, depthLevel = 0, biome = null) {
  const rng = seed;               // a mulberry32 rng from makeRng
  const count = rng.int(CONFIG.dungeon.minRooms, CONFIG.dungeon.maxRooms);

  const grid = new Map();         // "gx,gy" -> Room
  const key = (x, y) => `${x},${y}`;
  const rooms = [];
  let nextId = 0;

  const start = new Room(nextId++, 0, 0);
  start.type = ROOM.START;
  start.cleared = true; start.visited = true;
  grid.set(key(0, 0), start);
  rooms.push(start);

  // Growing-tree placement.
  let guard = 0;
  while (rooms.length < count && guard++ < 2000) {
    const base = rooms[rng.int(0, rooms.length - 1)];
    const dirNames = rng.shuffle(Object.keys(DIRS));
    let placed = false;
    for (const dName of dirNames) {
      const d = DIRS[dName];
      const nx = base.gx + d.dx, ny = base.gy + d.dy;
      if (grid.has(key(nx, ny))) continue;
      const r = new Room(nextId++, nx, ny);
      grid.set(key(nx, ny), r);
      rooms.push(r);
      // Connect base <-> r.
      base.doors[dName] = r.id;
      r.doors[d.opp] = base.id;
      placed = true;
      break;
    }
    if (!placed) continue;
  }

  const byId = new Map(rooms.map((r) => [r.id, r]));

  // Add a few loops between grid-adjacent, currently-unconnected rooms.
  const loopCount = Math.floor(rooms.length * 0.15);
  for (let i = 0; i < loopCount; i++) {
    const r = rooms[rng.int(0, rooms.length - 1)];
    const dName = rng.pick(Object.keys(DIRS));
    if (r.doors[dName] != null) continue;
    const d = DIRS[dName];
    const n = grid.get(key(r.gx + d.dx, r.gy + d.dy));
    if (n) { r.doors[dName] = n.id; n.doors[d.opp] = r.id; }
  }

  // BFS depths from start.
  computeDepths(start, byId);

  // Boss room = farthest room from start (deterministic tiebreak by id).
  let boss = start;
  for (const r of rooms) {
    if (r === start) continue;
    if (r.depth > boss.depth || (r.depth === boss.depth && r.id < boss.id)) boss = r;
  }
  if (boss === start) boss = rooms[rooms.length - 1];
  boss.type = ROOM.BOSS;

  // Assign special rooms among the remaining (exclude start & boss).
  const others = rooms.filter((r) => r !== start && r !== boss);
  rng.shuffle(others);
  const specials = [ROOM.TREASURE, ROOM.SHOP, ROOM.ELITE, ROOM.EVENT, ROOM.TREASURE, ROOM.EVENT];
  let si = 0;
  for (const r of others) {
    if (si < specials.length && r.depth >= 2) { r.type = specials[si++]; }
    else r.type = ROOM.COMBAT;
  }

  // Build encounter / reward plans + biome dressing.
  for (const r of rooms) buildRoomContent(r, rng, depthLevel, biome);

  return { rooms, byId, start, boss, grid };
}

function computeDepths(start, byId) {
  const q = [start];
  start.depth = 0;
  const seen = new Set([start.id]);
  while (q.length) {
    const r = q.shift();
    for (const nid of Object.values(r.doors)) {
      if (seen.has(nid)) continue;
      seen.add(nid);
      const n = byId.get(nid);
      n.depth = r.depth + 1;
      q.push(n);
    }
  }
}

function buildRoomContent(room, rng, depthLevel, biome) {
  const d = room.depth + depthLevel * 4; // scale with both room depth and floor
  const allowed = biome ? biome.enemies : null;

  // Biome dressing: decorations everywhere, hazards only in fights.
  if (biome && room.type !== ROOM.BOSS) {
    room.decor = placeDecor(rng, biome);
    if (room.type === ROOM.COMBAT || room.type === ROOM.ELITE) {
      room.envHazards = placeHazards(rng, biome);
    }
  }

  switch (room.type) {
    case ROOM.COMBAT: {
      const budget = 3 + Math.floor(d * 0.8);
      room.enemyPlan = planEnemies(rng, budget, false, d, allowed);
      break;
    }
    case ROOM.ELITE: {
      const budget = 4 + Math.floor(d * 0.9);
      room.enemyPlan = planEnemies(rng, budget, true, d, allowed);
      break;
    }
    case ROOM.TREASURE:
      room.reward = { kind: 'upgrade' };
      break;
    case ROOM.SHOP:
      room.reward = { kind: 'shop' };
      break;
    case ROOM.EVENT:
      room.reward = { kind: 'event', variant: rng.pick(EVENTS.map((e) => e.id)) };
      break;
    case ROOM.BOSS:
      room.enemyPlan = [{ type: 'boss', count: 1 }];
      break;
  }
}

// Threat roster: cost is the budget price, minDepth gates when an archetype
// can appear so early rooms teach basics before mixing in complex enemies.
const ROSTER = [
  { type: 'melee',        cost: 1.0, minDepth: 0 },
  { type: 'spider',       cost: 1.0, minDepth: 0 },
  { type: 'swarmling',    cost: 0.5, minDepth: 0 },
  { type: 'ranged',       cost: 1.4, minDepth: 1 },
  { type: 'bomber',       cost: 1.2, minDepth: 1 },
  { type: 'tank',         cost: 2.6, minDepth: 2 },
  { type: 'assassin',     cost: 1.8, minDepth: 2 },
  { type: 'healer',       cost: 1.6, minDepth: 2 },
  { type: 'shieldknight', cost: 2.2, minDepth: 2 },
  { type: 'mage',         cost: 2.0, minDepth: 3 },
  { type: 'charger',      cost: 1.8, minDepth: 3 },
  { type: 'warden',       cost: 2.0, minDepth: 3 },
  { type: 'necromancer',  cost: 2.4, minDepth: 4 },
];

// Scatter decorative props away from the room centre and door lanes.
function placeDecor(rng, biome) {
  const n = rng.int(biome.decor.count[0], biome.decor.count[1]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = rng.range(90, CONFIG.world.width - 90);
    const y = rng.range(90, CONFIG.world.height - 90);
    // Keep the centre (reward pedestals) and door lanes clear.
    const cx = CONFIG.world.width / 2, cy = CONFIG.world.height / 2;
    if (Math.abs(x - cx) < 90 && Math.abs(y - cy) < 90) continue;
    if (Math.abs(x - cx) < 55 || Math.abs(y - cy) < 55) continue;
    out.push({ x, y, kind: biome.decor.kind, size: rng.range(0.7, 1.3), seed: rng() });
  }
  return out;
}

// Seed environmental hazard zones (lava pools, webs, rifts...).
function placeHazards(rng, biome) {
  const h = biome.hazard;
  const n = rng.int(h.count[0], h.count[1]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = rng.range(130, CONFIG.world.width - 130);
    const y = rng.range(130, CONFIG.world.height - 130);
    const cx = CONFIG.world.width / 2, cy = CONFIG.world.height / 2;
    if (Math.abs(x - cx) < 80 && Math.abs(y - cy) < 80) continue; // keep centre safe
    out.push({
      x, y, radius: h.radius, warn: 0.01, damage: h.damage,
      color: h.color, linger: h.linger, tickEvery: h.tickEvery, slow: !!h.slow,
    });
  }
  return out;
}

// Distribute a "threat budget" across the archetypes available at this depth,
// optionally restricted to a biome's exclusive roster.
function planEnemies(rng, budget, elite, depth = 0, allowed = null) {
  let available = ROSTER.filter((r) => r.minDepth <= depth);
  if (allowed) {
    const filtered = available.filter((r) => allowed.includes(r.type));
    if (filtered.length >= 2) available = filtered;
  }
  // Biome rosters may gate out all cheap types on shallow floors — if the
  // filter leaves nothing, fall back to the roster's cheapest entries.
  if (!available.length) {
    const pool = allowed ? ROSTER.filter((r) => allowed.includes(r.type)) : ROSTER;
    available = [...pool].sort((a, b) => a.cost - b.cost).slice(0, 2);
  }
  const cheapest = available.reduce((m, r) => (r.cost < m.cost ? r : m), available[0]);
  const plan = {};
  let remaining = budget;
  let guard = 0;
  while (remaining > 0.4 && guard++ < 100) {
    const r = rng.pick(available);
    if (r.cost <= remaining) { plan[r.type] = (plan[r.type] || 0) + 1; remaining -= r.cost; }
    else if (cheapest.cost <= remaining) { plan[cheapest.type] = (plan[cheapest.type] || 0) + 1; remaining -= cheapest.cost; }
    else break;
  }
  // Support enemies need something to support — a lone healer becomes a fighter.
  const combatCount = Object.entries(plan).filter(([t]) => t !== 'healer').reduce((s, [, n]) => s + n, 0);
  if (plan.healer && combatCount === 0) {
    plan[cheapest.type] = (plan[cheapest.type] || 0) + plan.healer;
    delete plan.healer;
  }
  const out = Object.entries(plan)
    .filter(([, n]) => n > 0)
    .map(([type, count]) => ({ type, count }));
  if (elite && out.length) out[0].elite = true; // first group upgraded to elite
  if (!out.length) out.push({ type: cheapest.type, count: 2 });
  return out;
}
