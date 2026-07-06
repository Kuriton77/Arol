// Generic object pool to avoid GC churn for high-frequency entities
// (projectiles, particles, damage numbers). Supports hundreds of live objects.
export class ObjectPool {
  constructor(factory, reset) {
    this._factory = factory;   // () => newObject
    this._reset = reset;       // (obj, ...args) => void
    this._free = [];
    this.active = [];
  }

  spawn(...args) {
    const obj = this._free.pop() || this._factory();
    obj._pooled = true;
    obj.dead = false;
    this._reset(obj, ...args);
    this.active.push(obj);
    return obj;
  }

  // Sweep: update in place, recycle anything flagged dead. Callback runs per live obj.
  update(fn) {
    const a = this.active;
    let w = 0;
    for (let i = 0; i < a.length; i++) {
      const obj = a[i];
      if (!obj.dead) fn(obj);
      if (obj.dead) {
        this._free.push(obj);
      } else {
        a[w++] = obj;
      }
    }
    a.length = w;
  }

  forEach(fn) {
    for (let i = 0; i < this.active.length; i++) {
      if (!this.active[i].dead) fn(this.active[i]);
    }
  }

  clear() {
    for (const o of this.active) { o.dead = true; this._free.push(o); }
    this.active.length = 0;
  }

  get count() { return this.active.length; }
}
