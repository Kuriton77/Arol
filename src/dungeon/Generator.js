// Procedural dungeon generator. Grows a connected tree of rooms on a grid,
// adds a few loops, then assigns room types and per-room encounter plans.
// Deterministic given a seed, so runs are reproducible & testable.
import { Room, DIRS } from './Room.js';
import { ROOM, CONFIG } from '../data/config.js';

export function generateDungeon(seed, depthLevel = 0) {
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
  const specials = [ROOM.TREASURE, ROOM.SHOP, ROOM.ELITE, ROOM.EVENT, ROOM.TREASURE];
  let si = 0;
  for (const r of others) {
    if (si < specials.length && r.depth >= 2) { r.type = specials[si++]; }
    else r.type = ROOM.COMBAT;
  }

  // Build encounter / reward plans.
  for (const r of rooms) buildRoomContent(r, rng, depthLevel);

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

function buildRoomContent(room, rng, depthLevel) {
  const d = room.depth + depthLevel * 4; // scale with both room depth and floor
  switch (room.type) {
    case ROOM.COMBAT: {
      const budget = 3 + Math.floor(d * 0.8);
      room.enemyPlan = planEnemies(rng, budget, false);
      break;
    }
    case ROOM.ELITE: {
      const budget = 4 + Math.floor(d * 0.9);
      room.enemyPlan = planEnemies(rng, budget, true);
      break;
    }
    case ROOM.TREASURE:
      room.reward = { kind: 'upgrade' };
      break;
    case ROOM.SHOP:
      room.reward = { kind: 'shop' };
      break;
    case ROOM.EVENT:
      room.reward = { kind: 'event', variant: rng.pick(['heal', 'gamble', 'sacrifice']) };
      break;
    case ROOM.BOSS:
      room.enemyPlan = [{ type: 'boss', count: 1 }];
      break;
  }
}

// Distribute a "threat budget" across enemy archetypes.
function planEnemies(rng, budget, elite) {
  const costs = { melee: 1, ranged: 1.4, tank: 2.6 };
  const plan = { melee: 0, ranged: 0, tank: 0 };
  let remaining = budget;
  const types = ['melee', 'ranged', 'tank'];
  let guard = 0;
  while (remaining > 0.9 && guard++ < 100) {
    const t = rng.pick(types);
    if (costs[t] <= remaining) { plan[t]++; remaining -= costs[t]; }
    else if (costs.melee <= remaining) { plan.melee++; remaining -= costs.melee; }
    else break;
  }
  const out = Object.entries(plan)
    .filter(([, n]) => n > 0)
    .map(([type, count]) => ({ type, count }));
  if (elite && out.length) out[0].elite = true; // first group upgraded to elite
  if (!out.length) out.push({ type: 'melee', count: 2 });
  return out;
}
