// Small, dependency-free math helpers used across systems.

export const TAU = Math.PI * 2;

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

// Shortest signed angle from a to b, in range [-PI, PI].
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// Circle vs circle overlap.
export function circlesOverlap(ax, ay, ar, bx, by, br) {
  const r = ar + br;
  return dist2(ax, ay, bx, by) <= r * r;
}

// Is point within a swing arc centred on `facing` with half-width `halfArc`
// and radius `range` from origin? Used for melee hit detection.
export function inArc(ox, oy, facing, halfArc, range, px, py, targetRadius = 0) {
  const d = dist(ox, oy, px, py);
  if (d > range + targetRadius) return false;
  const a = Math.atan2(py - oy, px - ox);
  return Math.abs(angleDelta(facing, a)) <= halfArc;
}

// Squared distance from point P to segment AB. Used for thrust (capsule) hits.
export function pointSegDist2(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby || 1)));
  const cx = ax + abx * t, cy = ay + aby * t;
  return dist2(px, py, cx, cy);
}

// Is a circle (px,py,r) inside a thrust capsule from origin along `facing`?
export function inThrust(ox, oy, facing, length, width, px, py, r = 0) {
  const bx = ox + Math.cos(facing) * length;
  const by = oy + Math.sin(facing) * length;
  const reach = width / 2 + r;
  return pointSegDist2(px, py, ox, oy, bx, by) <= reach * reach;
}

// Seeded, deterministic PRNG (mulberry32) so a run is reproducible from a seed.
export function makeRng(seed) {
  let s = seed >>> 0;
  const rng = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (min, max) => min + rng() * (max - min);
  rng.int = (min, max) => Math.floor(rng.range(min, max + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  rng.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return rng;
}
