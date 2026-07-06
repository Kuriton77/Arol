// Persistent meta-progression via localStorage. Fails gracefully (private mode,
// disabled storage) by falling back to an in-memory object so play never breaks.
const KEY = 'arol.save.v1';

const DEFAULT = {
  souls: 0,
  metaLevels: {},        // upgradeId -> level
  unlockedWeapons: ['sword'],
  selectedWeapon: 'sword',
  stats: { runs: 0, wins: 0, kills: 0, bestDepth: 0 },
};

export class SaveSystem {
  constructor() {
    this.data = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT);
      const parsed = JSON.parse(raw);
      return { ...structuredClone(DEFAULT), ...parsed };
    } catch {
      return structuredClone(DEFAULT);
    }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }

  addSouls(n) { this.data.souls += Math.round(n); this.save(); }
  spendSouls(n) {
    if (this.data.souls < n) return false;
    this.data.souls -= n; this.save(); return true;
  }

  metaLevel(id) { return this.data.metaLevels[id] || 0; }
  setMetaLevel(id, lvl) { this.data.metaLevels[id] = lvl; this.save(); }

  unlockWeapon(id) {
    if (!this.data.unlockedWeapons.includes(id)) {
      this.data.unlockedWeapons.push(id);
      this.save();
    }
  }
  isWeaponUnlocked(id) { return this.data.unlockedWeapons.includes(id); }

  selectWeapon(id) { this.data.selectedWeapon = id; this.save(); }

  recordRun({ won, kills, depth }) {
    this.data.stats.runs++;
    if (won) this.data.stats.wins++;
    this.data.stats.kills += kills;
    this.data.stats.bestDepth = Math.max(this.data.stats.bestDepth, depth);
    this.save();
  }

  reset() { this.data = structuredClone(DEFAULT); this.save(); }
}
