// Minimal event bus enabling event-driven, decoupled systems.
// Systems emit gameplay events (e.g. 'enemy:died') without knowing consumers.
export class EventBus {
  constructor() {
    this._map = new Map();
  }

  on(type, fn) {
    let set = this._map.get(type);
    if (!set) { set = new Set(); this._map.set(type, set); }
    set.add(fn);
    return () => this.off(type, fn); // returns unsubscribe handle
  }

  off(type, fn) {
    const set = this._map.get(type);
    if (set) set.delete(fn);
  }

  emit(type, payload) {
    const set = this._map.get(type);
    if (!set) return;
    // Copy to allow handlers to unsubscribe during dispatch.
    for (const fn of [...set]) fn(payload);
  }

  clear() {
    this._map.clear();
  }
}
