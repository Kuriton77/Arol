// A single arena room. Holds its grid position, type, door connections, and the
// spawn plan for its encounter. Rooms are full-screen; the player transitions
// between them through doors.
import { ROOM, CONFIG } from '../data/config.js';

export const DIRS = {
  n: { dx: 0, dy: -1, opp: 's' },
  s: { dx: 0, dy: 1, opp: 'n' },
  e: { dx: 1, dy: 0, opp: 'w' },
  w: { dx: -1, dy: 0, opp: 'e' },
};

export class Room {
  constructor(id, gx, gy) {
    this.id = id;
    this.gx = gx; this.gy = gy;
    this.type = ROOM.COMBAT;
    this.doors = {};           // dir -> neighbour room id
    this.cleared = false;
    this.visited = false;
    this.locked = false;       // doors sealed until cleared
    this.depth = 0;            // BFS distance from start
    this.enemyPlan = [];       // [{type, count}]
    this.reward = null;        // for treasure/shop/event
    this.rewardTaken = false;
    // World bounds are shared (single-screen arenas).
    this.bounds = { x: 0, y: 0, w: CONFIG.world.width, h: CONFIG.world.height };
  }

  get needsClearing() {
    return (this.type === ROOM.COMBAT || this.type === ROOM.ELITE || this.type === ROOM.BOSS) && !this.cleared;
  }

  // Centre pixel of a door on the given wall, in room-local coordinates.
  doorPos(dir) {
    const b = this.bounds, pad = CONFIG.world.roomPadding;
    switch (dir) {
      case 'n': return { x: b.w / 2, y: pad };
      case 's': return { x: b.w / 2, y: b.h - pad };
      case 'w': return { x: pad, y: b.h / 2 };
      case 'e': return { x: b.w - pad, y: b.h / 2 };
    }
  }
}
